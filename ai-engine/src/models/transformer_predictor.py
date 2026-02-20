"""
Transformer + LSTM 混合时序预测模型

替代原有的 GradientBoosting yield_predictor，使用深度学习捕捉:
- Transformer: 长距离依赖 + 全局注意力
- LSTM: 短期时序模式 + 局部记忆
- 输出: APR 预测 + 市场 regime 分类 + 置信区间

2026 最新架构: Temporal Fusion Transformer (TFT) 变体
"""

import numpy as np
import pandas as pd
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import torch
    import torch.nn as nn
    from torch.utils.data import Dataset, DataLoader
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False
    logger.warning("PyTorch not installed, falling back to sklearn predictor")


@dataclass
class TransformerPrediction:
    pool_id: str
    current_apr: float
    predicted_apr_1d: float
    predicted_apr_7d: float
    predicted_apr_30d: float
    confidence: float
    confidence_interval: tuple[float, float]  # 95% CI
    trend: str  # "rising", "falling", "stable", "volatile"
    regime: str  # "bull", "bear", "sideways", "high_vol"
    volatility: float
    attention_weights: dict[str, float] = field(default_factory=dict)


# ---- PyTorch Models ----

if HAS_TORCH:

    class PositionalEncoding(nn.Module):
        """正弦位置编码"""
        def __init__(self, d_model: int, max_len: int = 512):
            super().__init__()
            pe = torch.zeros(max_len, d_model)
            position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
            div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-np.log(10000.0) / d_model))
            pe[:, 0::2] = torch.sin(position * div_term)
            pe[:, 1::2] = torch.cos(position * div_term)
            self.register_buffer('pe', pe.unsqueeze(0))

        def forward(self, x):
            return x + self.pe[:, :x.size(1)]

    class TemporalBlock(nn.Module):
        """Transformer + LSTM 混合时序块"""
        def __init__(self, d_model: int = 64, nhead: int = 4, lstm_hidden: int = 128, dropout: float = 0.1):
            super().__init__()
            self.lstm = nn.LSTM(d_model, lstm_hidden, batch_first=True, bidirectional=True)
            self.lstm_proj = nn.Linear(lstm_hidden * 2, d_model)
            encoder_layer = nn.TransformerEncoderLayer(
                d_model=d_model, nhead=nhead, dim_feedforward=d_model * 4,
                dropout=dropout, batch_first=True, activation='gelu'
            )
            self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=2)
            self.norm = nn.LayerNorm(d_model)
            self.dropout = nn.Dropout(dropout)

        def forward(self, x):
            # LSTM branch
            lstm_out, _ = self.lstm(x)
            lstm_out = self.lstm_proj(lstm_out)
            # Transformer branch
            tf_out = self.transformer(x)
            # Fusion: residual connection
            fused = self.norm(x + self.dropout(lstm_out) + self.dropout(tf_out))
            return fused

    class YieldTransformerModel(nn.Module):
        """
        APR 预测 Transformer-LSTM 混合模型

        输入: (batch, seq_len, n_features) 时序特征
        输出:
          - apr_pred: (batch, 3) 预测 1d/7d/30d APR
          - regime: (batch, 4) 市场 regime 分类
          - uncertainty: (batch, 1) 不确定性估计
        """
        def __init__(self, n_features: int = 12, d_model: int = 64, seq_len: int = 90):
            super().__init__()
            self.input_proj = nn.Linear(n_features, d_model)
            self.pos_enc = PositionalEncoding(d_model, max_len=seq_len)
            self.temporal_block1 = TemporalBlock(d_model, nhead=4, lstm_hidden=128)
            self.temporal_block2 = TemporalBlock(d_model, nhead=4, lstm_hidden=128)
            # Multi-horizon prediction heads
            self.apr_head = nn.Sequential(
                nn.Linear(d_model, 128), nn.GELU(), nn.Dropout(0.1),
                nn.Linear(128, 3)  # 1d, 7d, 30d
            )
            self.regime_head = nn.Sequential(
                nn.Linear(d_model, 64), nn.GELU(),
                nn.Linear(64, 4)  # bull, bear, sideways, high_vol
            )
            self.uncertainty_head = nn.Sequential(
                nn.Linear(d_model, 32), nn.GELU(),
                nn.Linear(32, 1), nn.Softplus()  # 正值不确定性
            )

        def forward(self, x):
            x = self.input_proj(x)
            x = self.pos_enc(x)
            x = self.temporal_block1(x)
            x = self.temporal_block2(x)
            # 取最后一个时间步
            last = x[:, -1, :]
            apr_pred = self.apr_head(last)
            regime = self.regime_head(last)
            uncertainty = self.uncertainty_head(last)
            return apr_pred, regime, uncertainty

    class TimeSeriesDataset(Dataset):
        """时序数据集"""
        def __init__(self, features: np.ndarray, targets: np.ndarray, seq_len: int = 90):
            self.features = torch.FloatTensor(features)
            self.targets = torch.FloatTensor(targets)
            self.seq_len = seq_len

        def __len__(self):
            return len(self.features) - self.seq_len

        def __getitem__(self, idx):
            x = self.features[idx:idx + self.seq_len]
            y = self.targets[idx + self.seq_len - 1]
            return x, y


class HybridYieldPredictor:
    """
    混合预测器: Transformer-LSTM (主) + GradientBoosting (备)

    特征工程:
    - APR 时序 (lagged, rolling stats, momentum)
    - TVL 变化率
    - Volume/TVL 比率
    - 市场情绪指标 (Fear/Greed, BTC 变化)
    - Gas 价格
    - 日期特征 (day_of_week, hour)
    """

    FEATURE_COLS = [
        'apr_total', 'tvl_usd', 'volume_24h_usd',
        'apr_ma7', 'apr_ma30', 'apr_std7', 'apr_std30',
        'tvl_change_pct', 'volume_tvl_ratio',
        'apr_momentum_7d', 'apr_momentum_30d', 'day_of_week'
    ]
    REGIME_LABELS = ['bull', 'bear', 'sideways', 'high_vol']
    SEQ_LEN = 90

    def __init__(self, model_path: str = "", device: str = "cpu"):
        self.device = device
        self.model_path = model_path
        self.model: Optional[object] = None
        self.feature_mean: Optional[np.ndarray] = None
        self.feature_std: Optional[np.ndarray] = None
        self.is_trained = False

        if HAS_TORCH:
            self.model = YieldTransformerModel(
                n_features=len(self.FEATURE_COLS),
                d_model=64,
                seq_len=self.SEQ_LEN
            )
            if model_path:
                try:
                    state = torch.load(model_path, map_location=device, weights_only=True)
                    self.model.load_state_dict(state['model'])
                    self.feature_mean = state.get('feature_mean')
                    self.feature_std = state.get('feature_std')
                    self.is_trained = True
                    logger.info(f"Loaded transformer model from {model_path}")
                except Exception as e:
                    logger.warning(f"Failed to load model: {e}")

    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """从原始池子数据提取特征"""
        features = pd.DataFrame(index=df.index)
        features['apr_total'] = df['apr_total']
        features['tvl_usd'] = np.log1p(df['tvl_usd'])  # log scale
        features['volume_24h_usd'] = np.log1p(df.get('volume_24h_usd', 0))
        features['apr_ma7'] = df['apr_total'].rolling(7).mean()
        features['apr_ma30'] = df['apr_total'].rolling(30).mean()
        features['apr_std7'] = df['apr_total'].rolling(7).std()
        features['apr_std30'] = df['apr_total'].rolling(30).std()
        features['tvl_change_pct'] = df['tvl_usd'].pct_change(7).clip(-1, 1)
        tvl = df['tvl_usd'].clip(lower=1)
        features['volume_tvl_ratio'] = df.get('volume_24h_usd', pd.Series(0, index=df.index)) / tvl
        features['apr_momentum_7d'] = df['apr_total'] - df['apr_total'].shift(7)
        features['apr_momentum_30d'] = df['apr_total'] - df['apr_total'].shift(30)
        features['day_of_week'] = pd.to_datetime(df.index).dayofweek if hasattr(df.index, 'dayofweek') else 0
        return features.fillna(0)

    def prepare_targets(self, df: pd.DataFrame) -> np.ndarray:
        """准备多horizon目标: [apr_1d, apr_7d, apr_30d]"""
        apr = df['apr_total'].values
        targets = np.zeros((len(apr), 3))
        for i in range(len(apr)):
            targets[i, 0] = apr[min(i + 1, len(apr) - 1)]
            targets[i, 1] = apr[min(i + 7, len(apr) - 1)]
            targets[i, 2] = apr[min(i + 30, len(apr) - 1)]
        return targets

    def train(self, pool_histories: dict[str, pd.DataFrame], epochs: int = 50, lr: float = 1e-3) -> dict:
        """训练 Transformer-LSTM 模型"""
        if not HAS_TORCH:
            return {"status": "no_torch", "message": "PyTorch not installed"}

        all_features = []
        all_targets = []

        for pool_id, df in pool_histories.items():
            if len(df) < self.SEQ_LEN + 30:
                continue
            features = self.prepare_features(df)
            targets = self.prepare_targets(df)
            feat_arr = features[self.FEATURE_COLS].values if all(c in features.columns for c in self.FEATURE_COLS) else features.values
            all_features.append(feat_arr)
            all_targets.append(targets)

        if not all_features:
            return {"status": "no_data"}

        X = np.concatenate(all_features, axis=0)
        Y = np.concatenate(all_targets, axis=0)

        # Normalize
        self.feature_mean = X.mean(axis=0)
        self.feature_std = X.std(axis=0) + 1e-8
        X = (X - self.feature_mean) / self.feature_std

        dataset = TimeSeriesDataset(X, Y, seq_len=self.SEQ_LEN)
        if len(dataset) < 10:
            return {"status": "insufficient_data"}

        loader = DataLoader(dataset, batch_size=32, shuffle=True)
        optimizer = torch.optim.AdamW(self.model.parameters(), lr=lr, weight_decay=1e-4)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
        criterion = nn.HuberLoss()

        self.model.train()
        best_loss = float('inf')

        for epoch in range(epochs):
            total_loss = 0
            for batch_x, batch_y in loader:
                batch_x, batch_y = batch_x.to(self.device), batch_y.to(self.device)
                apr_pred, regime, uncertainty = self.model(batch_x)
                loss = criterion(apr_pred, batch_y)
                optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
                optimizer.step()
                total_loss += loss.item()
            scheduler.step()
            avg_loss = total_loss / len(loader)
            if avg_loss < best_loss:
                best_loss = avg_loss
            if (epoch + 1) % 10 == 0:
                logger.info(f"Epoch {epoch+1}/{epochs}, loss={avg_loss:.4f}")

        self.is_trained = True
        logger.info(f"Transformer training complete. Best loss: {best_loss:.4f}, samples: {len(dataset)}")

        # Save model
        if self.model_path:
            torch.save({
                'model': self.model.state_dict(),
                'feature_mean': self.feature_mean,
                'feature_std': self.feature_std,
            }, self.model_path)

        return {"status": "trained", "best_loss": best_loss, "samples": len(dataset), "epochs": epochs}

    def train_from_history(
        self,
        days: int = 90,
        min_pool_samples: int = 60,
        epochs: int = 50,
        lr: float = 1e-3,
    ) -> dict:
        """从 pool_snapshots 表加载历史数据并训练"""
        import os
        import psycopg2

        if not HAS_TORCH:
            return {"status": "no_torch", "message": "PyTorch not installed"}

        conn = psycopg2.connect(
            host=os.getenv("POSTGRES_HOST", "localhost"),
            port=int(os.getenv("POSTGRES_PORT", "5433")),
            dbname=os.getenv("POSTGRES_DB", "defi_yield"),
            user=os.getenv("POSTGRES_USER", "defi"),
            password=os.getenv("POSTGRES_PASSWORD", ""),
        )
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT pool_id, time, apr_total, tvl_usd, volume_24h_usd
                FROM pool_snapshots
                WHERE time > NOW() - INTERVAL '1 day' * %s AND apr_total IS NOT NULL
                ORDER BY pool_id, time
            """, (days,))
            rows = cur.fetchall()
            cur.close()
        finally:
            conn.close()

        if not rows:
            return {"status": "no_data", "message": "No pool_snapshots found"}

        # Build pool_histories: dict[pool_id, DataFrame]
        pool_data: dict[str, list] = {}
        for pool_id, ts, apr, tvl, vol in rows:
            if pool_id not in pool_data:
                pool_data[pool_id] = []
            pool_data[pool_id].append({
                "time": pd.Timestamp(ts),
                "apr_total": float(apr or 0),
                "tvl_usd": float(tvl or 0),
                "volume_24h_usd": float(vol or 0),
            })

        pool_histories: dict[str, pd.DataFrame] = {}
        for pid, recs in pool_data.items():
            if len(recs) < min_pool_samples:
                continue
            df = pd.DataFrame(recs).set_index("time").sort_index()
            pool_histories[pid] = df

        if not pool_histories:
            return {"status": "insufficient_data", "message": f"Need at least {min_pool_samples} samples per pool"}

        logger.info(f"train_from_history: loaded {len(pool_histories)} pools, {days} days")
        return self.train(pool_histories, epochs=epochs, lr=lr)

    def predict(self, pool_id: str, history: pd.DataFrame) -> Optional[TransformerPrediction]:
        """预测未来 APR"""
        if history.empty or len(history) < 30:
            return self._fallback_prediction(pool_id, history)

        if not HAS_TORCH or not self.is_trained:
            return self._fallback_prediction(pool_id, history)

        try:
            features = self.prepare_features(history)
            feat_arr = features[self.FEATURE_COLS].values if all(c in features.columns for c in self.FEATURE_COLS) else features.values

            # Normalize
            if self.feature_mean is not None:
                feat_arr = (feat_arr - self.feature_mean) / self.feature_std

            # Pad or truncate to SEQ_LEN
            if len(feat_arr) < self.SEQ_LEN:
                pad = np.zeros((self.SEQ_LEN - len(feat_arr), feat_arr.shape[1]))
                feat_arr = np.concatenate([pad, feat_arr], axis=0)
            else:
                feat_arr = feat_arr[-self.SEQ_LEN:]

            x = torch.FloatTensor(feat_arr).unsqueeze(0).to(self.device)

            self.model.eval()
            with torch.no_grad():
                apr_pred, regime_logits, uncertainty = self.model(x)

            apr_vals = apr_pred[0].cpu().numpy()
            regime_probs = torch.softmax(regime_logits[0], dim=0).cpu().numpy()
            unc = uncertainty[0].item()

            current_apr = float(history['apr_total'].iloc[-1])
            pred_1d = max(0, float(apr_vals[0]))
            pred_7d = max(0, float(apr_vals[1]))
            pred_30d = max(0, float(apr_vals[2]))

            # Regime
            regime_idx = int(regime_probs.argmax())
            regime = self.REGIME_LABELS[regime_idx]

            # Trend
            momentum = pred_7d - current_apr
            volatility = float(history['apr_total'].tail(30).std())
            if abs(momentum) < volatility * 0.3:
                trend = "stable"
            elif momentum > 0:
                trend = "rising"
            else:
                trend = "falling"
            if volatility > current_apr * 0.5:
                trend = "volatile"

            # Confidence interval
            ci_low = pred_7d - 1.96 * unc
            ci_high = pred_7d + 1.96 * unc
            confidence = min(0.95, max(0.2, 1.0 - unc / max(current_apr, 1)))

            return TransformerPrediction(
                pool_id=pool_id,
                current_apr=current_apr,
                predicted_apr_1d=pred_1d,
                predicted_apr_7d=pred_7d,
                predicted_apr_30d=pred_30d,
                confidence=round(confidence, 3),
                confidence_interval=(round(max(0, ci_low), 2), round(ci_high, 2)),
                trend=trend,
                regime=regime,
                volatility=round(volatility, 4),
            )
        except Exception as e:
            logger.error(f"Transformer prediction failed for {pool_id}: {e}")
            return self._fallback_prediction(pool_id, history)

    def _fallback_prediction(self, pool_id: str, history: pd.DataFrame) -> Optional[TransformerPrediction]:
        """Fallback: 简单移动平均预测"""
        if history.empty:
            return None
        current = float(history['apr_total'].iloc[-1])
        mean_7d = float(history['apr_total'].tail(7).mean())
        mean_30d = float(history['apr_total'].tail(30).mean()) if len(history) >= 30 else current
        vol = float(history['apr_total'].tail(30).std()) if len(history) >= 30 else 0

        if current > mean_7d * 1.1:
            trend = "rising"
        elif current < mean_7d * 0.9:
            trend = "falling"
        else:
            trend = "stable"

        return TransformerPrediction(
            pool_id=pool_id, current_apr=current,
            predicted_apr_1d=mean_7d, predicted_apr_7d=mean_7d, predicted_apr_30d=mean_30d,
            confidence=0.35, confidence_interval=(max(0, mean_7d - vol), mean_7d + vol),
            trend=trend, regime="sideways", volatility=vol,
        )
