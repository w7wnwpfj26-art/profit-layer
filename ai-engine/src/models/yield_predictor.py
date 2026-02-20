"""
Yield Predictor - APR/APY Prediction Model

Uses historical pool data to predict future APR trends.
Helps decide when to enter/exit positions.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from dataclasses import dataclass
from typing import Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class YieldPrediction:
    pool_id: str
    current_apr: float
    predicted_apr_1d: float
    predicted_apr_7d: float
    predicted_apr_30d: float
    confidence: float  # 0-1
    trend: str  # "rising", "falling", "stable"
    volatility: float  # APR standard deviation


class YieldPredictor:
    """
    Predicts future APR for DeFi pools using gradient boosting.
    
    Features used:
    - Historical APR values (lagged)
    - TVL trends
    - Volume trends
    - APR volatility (mu/sigma from DefiLlama)
    - Time features (day of week, etc.)
    """

    def __init__(self):
        self.model = GradientBoostingRegressor(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42,
        )
        self.scaler = StandardScaler()
        self.is_trained = False

    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract features from pool history data."""
        features = pd.DataFrame()

        # Lagged APR values
        for lag in [1, 3, 7, 14, 30]:
            features[f"apr_lag_{lag}"] = df["apr_total"].shift(lag)

        # Rolling statistics
        for window in [7, 14, 30]:
            features[f"apr_mean_{window}d"] = df["apr_total"].rolling(window).mean()
            features[f"apr_std_{window}d"] = df["apr_total"].rolling(window).std()
            features[f"apr_min_{window}d"] = df["apr_total"].rolling(window).min()
            features[f"apr_max_{window}d"] = df["apr_total"].rolling(window).max()

        # TVL features
        features["tvl"] = df["tvl_usd"]
        features["tvl_change_7d"] = df["tvl_usd"].pct_change(7)
        features["tvl_change_30d"] = df["tvl_usd"].pct_change(30)

        # Volume features
        if "volume_24h_usd" in df.columns:
            features["volume"] = df["volume_24h_usd"]
            features["volume_to_tvl"] = df["volume_24h_usd"] / df["tvl_usd"].clip(lower=1)

        # APR momentum
        features["apr_momentum_7d"] = df["apr_total"] - df["apr_total"].shift(7)
        features["apr_momentum_30d"] = df["apr_total"] - df["apr_total"].shift(30)

        return features.dropna()

    def train(self, pool_histories: dict[str, pd.DataFrame]) -> dict:
        """Train the model on historical pool data."""
        all_features = []
        all_targets = []

        for pool_id, df in pool_histories.items():
            if len(df) < 60:  # Need at least 60 data points
                continue

            features = self.prepare_features(df)
            # Target: APR 7 days from now
            target = df["apr_total"].shift(-7).loc[features.index]

            valid = target.notna()
            all_features.append(features[valid])
            all_targets.append(target[valid])

        if not all_features:
            logger.warning("No sufficient data for training")
            return {"status": "no_data"}

        X = pd.concat(all_features)
        y = pd.concat(all_targets)

        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        # Train
        self.model.fit(X_scaled, y)
        self.is_trained = True

        # Score
        score = self.model.score(X_scaled, y)
        logger.info(f"Yield predictor trained. R² score: {score:.4f}, samples: {len(X)}")

        return {
            "status": "trained",
            "r2_score": float(score),
            "samples": len(X),
            "feature_importance": dict(
                zip(X.columns, self.model.feature_importances_.tolist())
            ),
        }

    def predict(
        self,
        pool_id: str,
        history: pd.DataFrame,
    ) -> Optional[YieldPrediction]:
        """Predict future APR for a pool."""
        if not self.is_trained or len(history) < 30:
            return self._simple_prediction(pool_id, history)

        try:
            features = self.prepare_features(history)
            if features.empty:
                return self._simple_prediction(pool_id, history)

            latest = features.iloc[[-1]]
            X_scaled = self.scaler.transform(latest)

            predicted_7d = float(self.model.predict(X_scaled)[0])
            current_apr = float(history["apr_total"].iloc[-1])

            # 计算动量（在衰减模型之前）
            momentum = predicted_7d - current_apr
            
            # Estimate 1d and 30d from 7d prediction using exponential decay
            # 指数衰减模型比线性外推更准确：momentum 衰减因子 = exp(-t/tau)
            # tau = 14 天（APR 动量的特征时间常数）
            tau = 14.0  # 特征时间常数（天）
            decay_1d = np.exp(-1 / tau)
            decay_30d = np.exp(-30 / tau)
            
            # 1天预测：momentum 部分保留
            predicted_1d = current_apr + momentum * decay_1d * (6/7)  # 衰减 + 缩放
            # 30天预测：momentum 大幅衰减
            predicted_30d = current_apr + momentum * decay_30d

            # Volatility
            volatility = float(history["apr_total"].tail(30).std())

            # Trend
            if momentum > volatility * 0.5:
                trend = "rising"
            elif momentum < -volatility * 0.5:
                trend = "falling"
            else:
                trend = "stable"

            # Confidence based on model + data stability
            confidence = min(0.9, max(0.3, 1.0 - volatility / max(current_apr, 1)))

            return YieldPrediction(
                pool_id=pool_id,
                current_apr=current_apr,
                predicted_apr_1d=max(0, predicted_1d),
                predicted_apr_7d=max(0, predicted_7d),
                predicted_apr_30d=max(0, predicted_30d),
                confidence=confidence,
                trend=trend,
                volatility=volatility,
            )
        except Exception as e:
            logger.error(f"Prediction failed for {pool_id}: {e}")
            return self._simple_prediction(pool_id, history)

    def _simple_prediction(
        self, pool_id: str, history: pd.DataFrame
    ) -> Optional[YieldPrediction]:
        """Fallback: simple moving average prediction."""
        if history.empty:
            return None

        current = float(history["apr_total"].iloc[-1])
        mean_7d = float(history["apr_total"].tail(7).mean())
        mean_30d = float(history["apr_total"].tail(30).mean())
        volatility = float(history["apr_total"].tail(30).std()) if len(history) >= 30 else 0

        if current > mean_7d * 1.1:
            trend = "rising"
        elif current < mean_7d * 0.9:
            trend = "falling"
        else:
            trend = "stable"

        return YieldPrediction(
            pool_id=pool_id,
            current_apr=current,
            predicted_apr_1d=mean_7d,
            predicted_apr_7d=mean_7d,
            predicted_apr_30d=mean_30d,
            confidence=0.4,
            trend=trend,
            volatility=volatility,
        )
