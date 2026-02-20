"""
强化学习投资组合优化器 (RL Portfolio Optimizer)

使用 PPO (Proximal Policy Optimization) 算法替代传统 MPT 优化:
- State: 市场情绪 + 波动率 + 当前持仓 + 各池APR + gas价格
- Action: 资金分配比例 + 进入/退出/复投决策
- Reward: risk-adjusted return (Sharpe ratio)

支持在线学习: 每次决策后根据实际结果更新策略
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import logging
from dataclasses import dataclass, field
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd

logger = logging.getLogger(__name__)

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch.distributions import Dirichlet
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False


@dataclass
class RLState:
    """RL 环境状态"""
    pool_aprs: list[float]           # 各池当前 APR
    pool_tvls: list[float]           # 各池 TVL (log scale)
    pool_risks: list[float]          # 各池风险分数
    current_weights: list[float]     # 当前分配权重
    market_sentiment: float          # 市场情绪 0-100
    btc_change_24h: float            # BTC 24h 变化率
    eth_change_24h: float            # ETH 24h 变化率
    fear_greed: float                # 恐惧贪婪指数
    avg_gas_gwei: float              # 平均 gas
    portfolio_pnl_pct: float         # 组合收益率
    days_since_rebalance: float      # 距上次调仓天数


@dataclass
class RLAction:
    """RL 动作: 新的分配权重"""
    weights: list[float]             # 目标分配权重 (sum=1)
    rebalance: bool                  # 是否执行调仓
    confidence: float                # 动作置信度


@dataclass
class RLExperience:
    """经验回放缓冲区条目"""
    state: np.ndarray
    action: np.ndarray
    reward: float
    next_state: np.ndarray
    done: bool
    log_prob: float
    value: float


if HAS_TORCH:

    class ActorCritic(nn.Module):
        """
        Actor-Critic 网络

        Actor: 输出 Dirichlet 分布参数 (用于投资组合权重)
        Critic: 输出状态价值估计
        """
        def __init__(self, state_dim: int, action_dim: int, hidden: int = 256):
            super().__init__()
            # Shared feature extractor
            self.shared = nn.Sequential(
                nn.Linear(state_dim, hidden), nn.LayerNorm(hidden), nn.GELU(),
                nn.Linear(hidden, hidden), nn.LayerNorm(hidden), nn.GELU(),
            )
            # Actor: Dirichlet concentration parameters
            self.actor = nn.Sequential(
                nn.Linear(hidden, hidden // 2), nn.GELU(),
                nn.Linear(hidden // 2, action_dim), nn.Softplus()
            )
            # Critic: state value
            self.critic = nn.Sequential(
                nn.Linear(hidden, hidden // 2), nn.GELU(),
                nn.Linear(hidden // 2, 1)
            )
            # Rebalance decision head
            self.rebalance_head = nn.Sequential(
                nn.Linear(hidden, 32), nn.GELU(),
                nn.Linear(32, 1), nn.Sigmoid()
            )

        def forward(self, state):
            features = self.shared(state)
            # Actor: Dirichlet 参数 (最小值 1.0 确保有效分布)
            concentration = self.actor(features) + 1.0
            # Critic
            value = self.critic(features)
            # Rebalance probability
            rebalance_prob = self.rebalance_head(features)
            return concentration, value, rebalance_prob

        def get_action(self, state):
            concentration, value, rebalance_prob = self.forward(state)
            dist = Dirichlet(concentration)
            action = dist.sample()
            log_prob = dist.log_prob(action)
            return action, log_prob, value.squeeze(-1), rebalance_prob.squeeze(-1)

        def evaluate(self, state, action):
            concentration, value, rebalance_prob = self.forward(state)
            dist = Dirichlet(concentration)
            log_prob = dist.log_prob(action)
            entropy = dist.entropy()
            return log_prob, value.squeeze(-1), entropy


class PPOOptimizer:
    """
    PPO 强化学习投资组合优化器

    训练流程:
    1. 从历史数据构建环境
    2. Agent 与环境交互收集经验
    3. PPO 更新策略
    4. 在线部署: 每次决策后用实际结果更新

    奖励函数:
    R = sharpe_ratio * (1 - max_drawdown_penalty) - transaction_cost
    """

    def __init__(
        self,
        max_pools: int = 10,
        hidden_dim: int = 256,
        lr: float = 3e-4,
        gamma: float = 0.99,
        gae_lambda: float = 0.95,
        clip_epsilon: float = 0.2,
        entropy_coef: float = 0.01,
        value_coef: float = 0.5,
        max_grad_norm: float = 0.5,
        model_path: str = "",
        device: str = "cpu",
    ):
        self.max_pools = max_pools
        self.gamma = gamma
        self.gae_lambda = gae_lambda
        self.clip_epsilon = clip_epsilon
        self.entropy_coef = entropy_coef
        self.value_coef = value_coef
        self.max_grad_norm = max_grad_norm
        self.model_path = model_path
        self.device = device

        # State dim: per-pool features (apr, tvl, risk, weight) * max_pools + global features
        self.state_dim = max_pools * 4 + 7  # 7 global features
        self.action_dim = max_pools

        if HAS_TORCH:
            self.model = ActorCritic(self.state_dim, self.action_dim, hidden_dim).to(device)
            self.optimizer = torch.optim.Adam(self.model.parameters(), lr=lr, eps=1e-5)
            self.is_trained = False

            if model_path:
                try:
                    state = torch.load(model_path, map_location=device, weights_only=True)
                    self.model.load_state_dict(state['model'])
                    self.is_trained = True
                    logger.info(f"Loaded RL model from {model_path}")
                except Exception as e:
                    logger.warning(f"Failed to load RL model: {e}")

        # Experience buffer
        self.buffer: list[RLExperience] = []
        self.buffer_size = 2048

    def state_to_tensor(self, state: RLState) -> np.ndarray:
        """将 RLState 转为固定维度向量"""
        vec = np.zeros(self.state_dim)
        n = min(len(state.pool_aprs), self.max_pools)
        for i in range(n):
            base = i * 4
            vec[base] = state.pool_aprs[i] / 100.0  # normalize APR
            vec[base + 1] = np.log1p(state.pool_tvls[i]) / 25.0  # normalize TVL
            vec[base + 2] = state.pool_risks[i] / 100.0
            vec[base + 3] = state.current_weights[i] if i < len(state.current_weights) else 0
        # Global features
        g = self.max_pools * 4
        vec[g] = state.market_sentiment / 100.0
        vec[g + 1] = state.btc_change_24h / 100.0
        vec[g + 2] = state.eth_change_24h / 100.0
        vec[g + 3] = state.fear_greed / 100.0
        vec[g + 4] = min(state.avg_gas_gwei / 100.0, 1.0)
        vec[g + 5] = state.portfolio_pnl_pct / 100.0
        vec[g + 6] = min(state.days_since_rebalance / 30.0, 1.0)
        return vec

    def get_action(self, state: RLState) -> RLAction:
        """根据当前状态获取最优动作"""
        if not HAS_TORCH or not self.is_trained:
            return self._heuristic_action(state)

        try:
            state_vec = self.state_to_tensor(state)
            state_t = torch.FloatTensor(state_vec).unsqueeze(0).to(self.device)

            self.model.eval()
            with torch.no_grad():
                action, log_prob, value, rebalance_prob = self.model.get_action(state_t)

            weights = action[0].cpu().numpy()
            n = min(len(state.pool_aprs), self.max_pools)
            weights = weights[:n]
            weights = weights / weights.sum()  # renormalize

            rebalance = rebalance_prob.item() > 0.5
            confidence = min(0.95, float(1.0 - weights.std()))

            return RLAction(
                weights=weights.tolist(),
                rebalance=rebalance,
                confidence=round(confidence, 3),
            )
        except Exception as e:
            logger.error(f"RL action failed: {e}")
            return self._heuristic_action(state)

    def _heuristic_action(self, state: RLState) -> RLAction:
        """Fallback: 基于 Sharpe ratio 的启发式分配"""
        n = len(state.pool_aprs)
        if n == 0:
            return RLAction(weights=[], rebalance=False, confidence=0.3)

        # Risk-adjusted score
        scores = []
        for i in range(n):
            apr = state.pool_aprs[i]
            risk = max(state.pool_risks[i], 1)
            score = apr / risk
            scores.append(max(score, 0))

        total = sum(scores)
        if total == 0:
            weights = [1.0 / n] * n
        else:
            weights = [s / total for s in scores]

        return RLAction(weights=weights, rebalance=True, confidence=0.4)

    def compute_reward(
        self,
        portfolio_return: float,
        portfolio_volatility: float,
        max_drawdown: float,
        transaction_cost: float,
        risk_free_rate: float = 0.03,
    ) -> float:
        """
        计算奖励函数

        R = sharpe_ratio * (1 - drawdown_penalty) - tx_cost_penalty
        """
        # Sharpe ratio
        excess_return = portfolio_return - risk_free_rate
        sharpe = excess_return / max(portfolio_volatility, 0.01)

        # Drawdown penalty (exponential)
        dd_penalty = 1.0 - np.exp(-3.0 * max(max_drawdown, 0))

        # Transaction cost penalty
        tx_penalty = transaction_cost * 10  # amplify cost awareness

        reward = sharpe * (1.0 - dd_penalty) - tx_penalty

        return float(np.clip(reward, -5.0, 5.0))

    def store_experience(self, exp: RLExperience):
        """存储经验到缓冲区"""
        self.buffer.append(exp)
        if len(self.buffer) > self.buffer_size:
            self.buffer.pop(0)

    def train_step(self, batch_size: int = 64, epochs: int = 4) -> dict:
        """PPO 训练步骤"""
        if not HAS_TORCH or len(self.buffer) < batch_size:
            return {"status": "insufficient_data", "buffer_size": len(self.buffer)}

        # Compute GAE advantages
        states = torch.FloatTensor(np.array([e.state for e in self.buffer])).to(self.device)
        actions = torch.FloatTensor(np.array([e.action for e in self.buffer])).to(self.device)
        rewards = torch.FloatTensor([e.reward for e in self.buffer]).to(self.device)
        old_log_probs = torch.FloatTensor([e.log_prob for e in self.buffer]).to(self.device)
        old_values = torch.FloatTensor([e.value for e in self.buffer]).to(self.device)

        # GAE
        advantages = torch.zeros_like(rewards)
        last_gae = 0
        for t in reversed(range(len(rewards))):
            if t == len(rewards) - 1:
                next_value = 0
            else:
                next_value = old_values[t + 1]
            delta = rewards[t] + self.gamma * next_value - old_values[t]
            advantages[t] = last_gae = delta + self.gamma * self.gae_lambda * last_gae

        returns = advantages + old_values
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

        # PPO update
        total_loss = 0
        self.model.train()

        for _ in range(epochs):
            indices = torch.randperm(len(self.buffer))
            for start in range(0, len(indices), batch_size):
                end = min(start + batch_size, len(indices))
                idx = indices[start:end]

                log_probs, values, entropy = self.model.evaluate(states[idx], actions[idx])

                # Policy loss (clipped)
                ratio = torch.exp(log_probs - old_log_probs[idx])
                surr1 = ratio * advantages[idx]
                surr2 = torch.clamp(ratio, 1 - self.clip_epsilon, 1 + self.clip_epsilon) * advantages[idx]
                policy_loss = -torch.min(surr1, surr2).mean()

                # Value loss
                value_loss = F.mse_loss(values, returns[idx])

                # Total loss
                loss = policy_loss + self.value_coef * value_loss - self.entropy_coef * entropy.mean()

                self.optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(self.model.parameters(), self.max_grad_norm)
                self.optimizer.step()
                total_loss += loss.item()

        self.is_trained = True

        # Save model
        if self.model_path:
            torch.save({'model': self.model.state_dict()}, self.model_path)

        avg_loss = total_loss / max(epochs * (len(self.buffer) // batch_size), 1)
        logger.info(f"PPO training step: loss={avg_loss:.4f}, buffer={len(self.buffer)}")

        # Clear buffer after training
        self.buffer.clear()

        return {"status": "trained", "avg_loss": avg_loss, "buffer_cleared": True}

    def train_from_history(
        self,
        pool_histories: dict[str, pd.DataFrame],
        sentiment_history: list[dict],
        episodes: int = 100,
    ) -> dict:
        """从历史数据离线训练"""
        import pandas as pd

        if not HAS_TORCH:
            return {"status": "no_torch"}

        pool_ids = list(pool_histories.keys())[:self.max_pools]
        if not pool_ids:
            return {"status": "no_data"}

        # Align all pool histories to same time index
        min_len = min(len(pool_histories[pid]) for pid in pool_ids)
        if min_len < 60:
            return {"status": "insufficient_history"}

        total_reward = 0
        for episode in range(episodes):
            # Random starting point
            start = np.random.randint(0, max(min_len - 90, 1))
            weights = np.ones(len(pool_ids)) / len(pool_ids)

            for t in range(start, min(start + 90, min_len - 1)):
                # Build state
                aprs = [float(pool_histories[pid].iloc[t].get('apr_total', 0)) for pid in pool_ids]
                tvls = [float(pool_histories[pid].iloc[t].get('tvl_usd', 0)) for pid in pool_ids]
                risks = [30.0] * len(pool_ids)  # placeholder

                sent = sentiment_history[t % len(sentiment_history)] if sentiment_history else {}
                state = RLState(
                    pool_aprs=aprs, pool_tvls=tvls, pool_risks=risks,
                    current_weights=weights.tolist(),
                    market_sentiment=sent.get('composite', 50),
                    btc_change_24h=sent.get('btc_change', 0),
                    eth_change_24h=sent.get('eth_change', 0),
                    fear_greed=sent.get('fear_greed', 50),
                    avg_gas_gwei=sent.get('gas', 20),
                    portfolio_pnl_pct=0,
                    days_since_rebalance=1,
                )
                state_vec = self.state_to_tensor(state)
                state_t = torch.FloatTensor(state_vec).unsqueeze(0).to(self.device)

                action, log_prob, value, _ = self.model.get_action(state_t)
                new_weights = action[0].cpu().numpy()[:len(pool_ids)]
                new_weights = new_weights / new_weights.sum()

                # Compute reward from next step
                next_aprs = [float(pool_histories[pid].iloc[t + 1].get('apr_total', 0)) for pid in pool_ids]
                daily_return = sum(w * apr / 365 for w, apr in zip(new_weights, next_aprs)) / 100
                tx_cost = np.sum(np.abs(new_weights - weights)) * 0.003  # 0.3% per rebalance
                reward = self.compute_reward(daily_return, 0.02, 0, tx_cost)

                self.store_experience(RLExperience(
                    state=state_vec, action=new_weights,
                    reward=reward, next_state=state_vec,  # simplified
                    done=(t == min(start + 89, min_len - 2)),
                    log_prob=log_prob.item(), value=value.item(),
                ))
                weights = new_weights
                total_reward += reward

            # Train after each episode
            if len(self.buffer) >= 64:
                self.train_step()

        avg_reward = total_reward / max(episodes, 1)
        logger.info(f"RL offline training: {episodes} episodes, avg_reward={avg_reward:.4f}")
        return {"status": "trained", "episodes": episodes, "avg_reward": avg_reward}
