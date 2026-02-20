"""
Yield Farming Strategy

Identifies the best yield farming opportunities and
generates signals for the executor.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import logging
import uuid

from ..models.risk_scorer import RiskScorer, RiskLevel
from ..models.il_calculator import ILCalculator
from ..strategies.optimizer import PoolCandidate, PortfolioOptimizer

logger = logging.getLogger(__name__)


@dataclass
class StrategySignal:
    signal_id: str
    strategy_id: str
    action: str       # "enter", "exit", "compound", "rebalance"
    pool_id: str
    chain: str
    protocol_id: str
    amount_usd: float
    reason: str
    confidence: float  # 0-1
    risk_score: float  # 0-100
    expected_apr: float
    timestamp: str


class YieldFarmingStrategy:
    """
    Core yield farming strategy that:
    1. Scans pool APRs
    2. Assesses risks
    3. Optimizes allocation
    4. Generates entry/exit/compound signals
    """

    def __init__(
        self,
        strategy_id: str = "yield_farming_v1",
        min_apr: float = 5.0,
        max_risk_score: float = 60.0,
        compound_threshold_usd: float = 10.0,
        rebalance_threshold_pct: float = 20.0,
    ):
        self.strategy_id = strategy_id
        self.min_apr = min_apr
        self.max_risk_score = max_risk_score
        self.compound_threshold_usd = compound_threshold_usd
        self.rebalance_threshold_pct = rebalance_threshold_pct
        self.risk_scorer = RiskScorer()
        self.il_calculator = ILCalculator()
        self.optimizer = PortfolioOptimizer(max_risk_score=max_risk_score)

    def analyze_pools(
        self,
        pools: list[dict],
        total_capital_usd: float,
        current_positions: list[dict] | None = None,
    ) -> list[StrategySignal]:
        """
        Analyze pool data and generate trading signals.
        
        Args:
            pools: List of pool data from scanner
            total_capital_usd: Total capital available
            current_positions: Existing positions (for rebalance/exit signals)
        """
        signals: list[StrategySignal] = []
        current_positions = current_positions or []

        logger.info(
            f"Analyzing {len(pools)} pools with ${total_capital_usd:,.0f} capital"
        )

        # 1. Risk-assess and filter pools
        candidates: list[PoolCandidate] = []

        for pool in pools:
            apr = pool.get("aprTotal", 0)
            if apr < self.min_apr:
                continue

            # Risk assessment
            risk = self.risk_scorer.assess(
                pool_id=pool["poolId"],
                tvl_usd=pool.get("tvlUsd", 0),
                apr_total=apr,
                apr_base=pool.get("aprBase", 0),
                apr_reward=pool.get("aprReward", 0),
                il_risk=pool.get("metadata", {}).get("ilRisk", "no"),
                exposure=pool.get("metadata", {}).get("exposure", "single"),
                stablecoin=pool.get("metadata", {}).get("stablecoin", False),
                apr_volatility=pool.get("metadata", {}).get("sigma", 0) or 0,
                apr_mean_30d=pool.get("metadata", {}).get("apyMean30d", apr) or apr,
            )

            if risk.risk_level == RiskLevel.CRITICAL:
                continue

            # 计算 IL 风险（非稳定币池子有 IL 风险）
            is_stablecoin = pool.get("metadata", {}).get("stablecoin", False)
            if is_stablecoin:
                il_risk = 0  # 稳定币池子无 IL
            else:
                # 简化处理：假设价格变化 50% 时的 IL
                # 实际应该从池子元数据获取或实时计算
                il_risk = pool.get("metadata", {}).get("ilRiskPct", 5.0) or 5.0

            candidates.append(PoolCandidate(
                pool_id=pool["poolId"],
                protocol_id=pool.get("protocolId", ""),
                chain=pool.get("chain", ""),
                symbol=pool.get("symbol", ""),
                apr=apr,
                tvl_usd=pool.get("tvlUsd", 0),
                risk_score=risk.overall_score,
                il_risk=il_risk,
                volatility=pool.get("metadata", {}).get("sigma", 5) or 5,
            ))

        logger.info(f"Found {len(candidates)} viable candidates")

        # 2. Optimize allocation
        result = self.optimizer.optimize(
            candidates=candidates,
            total_capital_usd=total_capital_usd,
        )

        # 3. Generate ENTER signals for new positions
        current_pool_ids = {p.get("poolId") for p in current_positions}

        for alloc in result.allocations:
            if alloc.pool_id not in current_pool_ids:
                signals.append(StrategySignal(
                    signal_id=str(uuid.uuid4()),
                    strategy_id=self.strategy_id,
                    action="enter",
                    pool_id=alloc.pool_id,
                    chain=alloc.chain,
                    protocol_id=alloc.protocol_id,
                    amount_usd=alloc.amount_usd,
                    reason=alloc.reason,
                    confidence=min(0.9, 1.0 - alloc.risk_score / 100),
                    risk_score=alloc.risk_score,
                    expected_apr=alloc.expected_apr,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                ))

        # 4. Generate EXIT signals for underperforming positions
        optimal_pool_ids = {a.pool_id for a in result.allocations}
        for pos in current_positions:
            if pos.get("poolId") not in optimal_pool_ids:
                signals.append(StrategySignal(
                    signal_id=str(uuid.uuid4()),
                    strategy_id=self.strategy_id,
                    action="exit",
                    pool_id=pos["poolId"],
                    chain=pos.get("chain", ""),
                    protocol_id=pos.get("protocolId", ""),
                    amount_usd=pos.get("valueUsd", 0),
                    reason="Pool no longer in optimal set",
                    confidence=0.7,
                    risk_score=50,
                    expected_apr=0,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                ))

        logger.info(f"Generated {len(signals)} signals")
        return signals
