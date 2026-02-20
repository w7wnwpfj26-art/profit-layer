"""
Portfolio Optimizer - Modern Portfolio Theory for DeFi

Optimizes capital allocation across multiple DeFi pools
using risk-adjusted return maximization.
"""

import numpy as np
from scipy.optimize import minimize
from dataclasses import dataclass
import logging

from ..models.friction_calculator import FrictionCalculator

logger = logging.getLogger(__name__)


@dataclass
class PoolCandidate:
    pool_id: str
    protocol_id: str
    chain: str
    symbol: str
    apr: float          # Annual percentage rate (gross)
    tvl_usd: float
    risk_score: float   # 0-100
    il_risk: float      # Expected IL percentage
    volatility: float   # APR volatility
    net_apr: float = 0  # 扣除磨损后的净年化（由 FrictionCalculator 填充）
    entry_friction_pct: float = 0.0  # 入场摩擦费用百分比


@dataclass
class Allocation:
    pool_id: str
    protocol_id: str
    chain: str
    symbol: str
    weight: float         # 0-1 portfolio weight
    amount_usd: float
    expected_apr: float
    risk_score: float
    reason: str


@dataclass
class OptimizationResult:
    allocations: list[Allocation]
    total_amount_usd: float
    expected_portfolio_apr: float
    portfolio_risk_score: float
    sharpe_ratio: float
    diversification_score: float


class PortfolioOptimizer:
    """
    Optimizes DeFi portfolio allocation using risk-adjusted returns.
    
    Approach:
    1. Filter candidates by risk tolerance
    2. Build covariance matrix from APR histories
    3. Maximize Sharpe ratio (excess return / risk)
    4. Apply practical constraints (min/max per pool, chain diversification)
    """

    def __init__(
        self,
        max_risk_score: float = 60,
        max_per_pool_pct: float = 0.25,
        max_per_chain_pct: float = 0.50,
        min_allocation_usd: float = 100,
        risk_free_rate: float = 3.0,  # % (e.g., T-bill rate or stablecoin lending)
    ):
        self.max_risk_score = max_risk_score
        self.max_per_pool_pct = max_per_pool_pct
        self.max_per_chain_pct = max_per_chain_pct
        self.min_allocation_usd = min_allocation_usd
        self.risk_free_rate = risk_free_rate
        self.friction_calc = FrictionCalculator()

    def optimize(
        self,
        candidates: list[PoolCandidate],
        total_capital_usd: float,
        max_positions: int = 10,
    ) -> OptimizationResult:
        """
        Find optimal capital allocation across DeFi pools.
        """
        logger.info(
            f"Optimizing portfolio: {len(candidates)} candidates, "
            f"${total_capital_usd:,.0f} capital, max {max_positions} positions"
        )

        # 1. Filter by risk tolerance
        viable = [c for c in candidates if c.risk_score <= self.max_risk_score]
        if not viable:
            logger.warning("No viable candidates after risk filtering")
            return OptimizationResult(
                allocations=[],
                total_amount_usd=0,
                expected_portfolio_apr=0,
                portfolio_risk_score=0,
                sharpe_ratio=0,
                diversification_score=0,
            )

        # 2. 计算扣除交易磨损后的净年化收益
        # 使用保守的默认分配金额来估算摩擦成本
        default_position_usd = max(total_capital_usd / max(len(viable), 1), self.min_allocation_usd)
        for c in viable:
            net_yield = self.friction_calc.net_yield_after_friction(
                pool_id=c.pool_id,
                chain=c.chain,
                protocol=c.protocol_id,
                gross_apr_pct=c.apr,
                position_usd=default_position_usd,
                pool_tvl_usd=c.tvl_usd,
            )
            c.net_apr = net_yield.net_apr_pct
            # 用净年化替代表面年化，同时扣除无常损失
            c.apr = max(0, c.net_apr - c.il_risk)
            # 记录入场摩擦用于后续计算
            c.entry_friction_pct = net_yield.entry_friction_pct

        # 过滤掉净年化为负的（磨损超过收益）
        viable = [c for c in viable if c.apr > 0]

        if not viable:
            logger.warning("扣除交易磨损后无盈利候选池")
            return OptimizationResult(
                allocations=[], total_amount_usd=0,
                expected_portfolio_apr=0, portfolio_risk_score=0,
                sharpe_ratio=0, diversification_score=0,
            )

        viable.sort(
            key=lambda c: (c.apr - self.risk_free_rate) / max(c.volatility, 1),
            reverse=True,
        )

        # Take top N candidates
        selected = viable[:max_positions]
        n = len(selected)

        if n == 0:
            return OptimizationResult(
                allocations=[], total_amount_usd=0,
                expected_portfolio_apr=0, portfolio_risk_score=0,
                sharpe_ratio=0, diversification_score=0,
            )

        # 3. Optimize weights
        returns = np.array([c.apr for c in selected])
        risks = np.array([max(c.volatility, 0.1) for c in selected])

        # Simple diagonal covariance (assumes uncorrelated pools)
        cov_matrix = np.diag(risks ** 2)

        # Optimize: maximize Sharpe ratio
        def neg_sharpe(weights):
            port_return = np.dot(weights, returns)
            port_risk = np.sqrt(np.dot(weights, np.dot(cov_matrix, weights)))
            if port_risk == 0:
                return 0
            return -(port_return - self.risk_free_rate) / port_risk

        # Constraints
        constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]

        # Chain diversification constraint
        chain_pools: dict[str, list[int]] = {}
        for i, c in enumerate(selected):
            chain_pools.setdefault(c.chain, []).append(i)

        for chain, indices in chain_pools.items():
            constraints.append({
                "type": "ineq",
                "fun": lambda w, idx=indices: self.max_per_chain_pct - sum(w[i] for i in idx),
            })

        bounds = [(0, self.max_per_pool_pct) for _ in range(n)]
        initial = np.ones(n) / n

        try:
            result = minimize(
                neg_sharpe, initial,
                method="SLSQP",
                bounds=bounds,
                constraints=constraints,
            )
            weights = result.x
        except Exception as e:
            logger.warning(f"Optimization failed, using equal weights: {e}")
            weights = np.ones(n) / n

        # Clean up tiny weights
        weights[weights < 0.01] = 0
        if weights.sum() > 0:
            weights /= weights.sum()

        # 4. Build allocations
        allocations = []
        for i, (c, w) in enumerate(zip(selected, weights)):
            if w <= 0:
                continue

            amount = w * total_capital_usd
            if amount < self.min_allocation_usd:
                continue

            allocations.append(Allocation(
                pool_id=c.pool_id,
                protocol_id=c.protocol_id,
                chain=c.chain,
                symbol=c.symbol,
                weight=float(w),
                amount_usd=round(amount, 2),
                expected_apr=c.apr,
                risk_score=c.risk_score,
                reason=f"Sharpe-optimized: APR={c.apr:.1f}%, risk={c.risk_score:.0f}",
            ))

        # Portfolio metrics
        active_weights = np.array([a.weight for a in allocations])
        active_returns = np.array([a.expected_apr for a in allocations])
        active_risks = np.array([
            next(c.volatility for c in selected if c.pool_id == a.pool_id)
            for a in allocations
        ]) if allocations else np.array([])

        portfolio_apr = float(np.dot(active_weights, active_returns)) if len(active_weights) > 0 else 0
        portfolio_risk = float(np.sqrt(np.dot(active_weights ** 2, active_risks ** 2))) if len(active_weights) > 0 else 0
        sharpe = (portfolio_apr - self.risk_free_rate) / max(portfolio_risk, 0.01)

        # Diversification: 1 - HHI (Herfindahl index)
        hhi = float(np.sum(active_weights ** 2)) if len(active_weights) > 0 else 1
        diversification = 1 - hhi

        logger.info(
            f"Optimized: {len(allocations)} positions, "
            f"APR={portfolio_apr:.1f}%, Sharpe={sharpe:.2f}, "
            f"diversification={diversification:.2f}"
        )

        return OptimizationResult(
            allocations=allocations,
            total_amount_usd=sum(a.amount_usd for a in allocations),
            expected_portfolio_apr=round(portfolio_apr, 4),
            portfolio_risk_score=round(
                sum(a.risk_score * a.weight for a in allocations), 2
            ),
            sharpe_ratio=round(sharpe, 4),
            diversification_score=round(diversification, 4),
        )
