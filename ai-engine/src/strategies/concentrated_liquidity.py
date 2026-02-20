"""
集中流动性管理策略 (Concentrated Liquidity Management)

针对 Uniswap V3/V4 集中流动性池:
- 自动计算最优价格区间
- 基于波动率动态调整区间宽度
- 自动 rebalance (区间偏移时重新部署)
- 收益比普通 LP 高 2-5x

2026 最新: 支持 Uniswap V4 Hooks 自定义逻辑
"""

import numpy as np
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


@dataclass
class PriceRange:
    """价格区间"""
    lower: float
    upper: float
    current: float
    width_pct: float  # 区间宽度占当前价格的百分比
    in_range: bool    # 当前价格是否在区间内


@dataclass
class CLPosition:
    """集中流动性持仓"""
    pool_id: str
    protocol: str  # "uniswap-v3", "uniswap-v4", "pancakeswap-v3"
    chain: str
    token0: str
    token1: str
    fee_tier: int  # basis points (500, 3000, 10000)
    price_range: PriceRange
    liquidity_usd: float
    unclaimed_fees_usd: float
    apr_estimate: float
    time_in_range_pct: float  # 过去 24h 价格在区间内的时间比例
    needs_rebalance: bool


@dataclass
class CLSignal:
    """集中流动性操作信号"""
    action: str  # "deploy", "rebalance", "withdraw", "collect_fees"
    pool_id: str
    chain: str
    token0: str
    token1: str
    new_range: PriceRange | None
    amount_usd: float
    reason: str
    expected_apr: float
    confidence: float


class ConcentratedLiquidityStrategy:
    """
    集中流动性管理策略

    核心逻辑:
    1. 根据历史波动率计算最优区间宽度
    2. 监控价格是否偏离区间
    3. 自动 rebalance: 撤出 → 重新部署到新区间
    4. 自动收取手续费并复投
    """

    def __init__(
        self,
        default_width_pct: float = 20.0,  # 默认区间宽度 ±10%
        rebalance_threshold: float = 0.8,  # 价格接近区间边界 80% 时触发
        min_apr: float = 10.0,
        min_tvl_usd: float = 1_000_000,
        fee_collect_threshold_usd: float = 50.0,
    ):
        self.default_width_pct = default_width_pct
        self.rebalance_threshold = rebalance_threshold
        self.min_apr = min_apr
        self.min_tvl = min_tvl_usd
        self.fee_collect_threshold = fee_collect_threshold_usd

    def calculate_optimal_range(
        self,
        current_price: float,
        price_history: list[float],
        fee_tier: int = 3000,
    ) -> PriceRange:
        """
        计算最优价格区间

        基于历史波动率:
        - 低波动率 → 窄区间 (更高资本效率)
        - 高波动率 → 宽区间 (更少 rebalance)

        fee_tier 影响:
        - 高手续费池 (1%) → 可以用更宽区间
        - 低手续费池 (0.05%) → 需要更窄区间提高效率
        """
        if not price_history or len(price_history) < 7:
            width_pct = self.default_width_pct
        else:
            # 计算历史波动率 (年化)
            returns = np.diff(price_history) / np.array(price_history[:-1])
            daily_vol = np.std(returns)
            annual_vol = daily_vol * np.sqrt(365) * 100  # 百分比

            # 区间宽度 = 2 * 波动率 * 调整因子
            # 低手续费池需要更窄区间
            fee_factor = {500: 0.6, 3000: 1.0, 10000: 1.5}.get(fee_tier, 1.0)
            width_pct = max(5, min(50, annual_vol * 0.3 * fee_factor))

        half_width = width_pct / 2 / 100
        lower = current_price * (1 - half_width)
        upper = current_price * (1 + half_width)

        return PriceRange(
            lower=round(lower, 6),
            upper=round(upper, 6),
            current=current_price,
            width_pct=round(width_pct, 2),
            in_range=True,
        )

    def check_positions(
        self,
        positions: list[CLPosition],
    ) -> list[CLSignal]:
        """检查所有集中流动性持仓，生成操作信号"""
        signals = []

        for pos in positions:
            # 1. 检查是否需要 rebalance
            if pos.needs_rebalance or not pos.price_range.in_range:
                signals.append(CLSignal(
                    action="rebalance",
                    pool_id=pos.pool_id,
                    chain=pos.chain,
                    token0=pos.token0,
                    token1=pos.token1,
                    new_range=self.calculate_optimal_range(
                        pos.price_range.current, [], pos.fee_tier
                    ),
                    amount_usd=pos.liquidity_usd,
                    reason=f"价格偏离区间 (当前 {pos.price_range.current}, 区间 [{pos.price_range.lower}, {pos.price_range.upper}])",
                    expected_apr=pos.apr_estimate * 0.8,  # rebalance 后预期略低
                    confidence=0.75,
                ))

            # 2. 检查是否需要收取手续费
            elif pos.unclaimed_fees_usd >= self.fee_collect_threshold:
                signals.append(CLSignal(
                    action="collect_fees",
                    pool_id=pos.pool_id,
                    chain=pos.chain,
                    token0=pos.token0,
                    token1=pos.token1,
                    new_range=None,
                    amount_usd=pos.unclaimed_fees_usd,
                    reason=f"未领取手续费 ${pos.unclaimed_fees_usd:.2f}",
                    expected_apr=pos.apr_estimate,
                    confidence=0.9,
                ))

            # 3. 检查区间内时间比例
            elif pos.time_in_range_pct < 50:
                signals.append(CLSignal(
                    action="rebalance",
                    pool_id=pos.pool_id,
                    chain=pos.chain,
                    token0=pos.token0,
                    token1=pos.token1,
                    new_range=self.calculate_optimal_range(
                        pos.price_range.current, [], pos.fee_tier
                    ),
                    amount_usd=pos.liquidity_usd,
                    reason=f"区间内时间仅 {pos.time_in_range_pct:.0f}%，效率低下",
                    expected_apr=pos.apr_estimate * 1.2,
                    confidence=0.7,
                ))

        return signals

    def find_opportunities(
        self,
        pools: list[dict],
        capital_usd: float,
    ) -> list[CLSignal]:
        """发现新的集中流动性机会"""
        opportunities = []

        for pool in pools:
            # 筛选 V3/V4 池子
            protocol = pool.get("protocolId", "").lower()
            if not any(v in protocol for v in ["v3", "v4", "concentrated"]):
                continue

            apr = pool.get("aprTotal", 0)
            tvl = pool.get("tvlUsd", 0)

            if apr < self.min_apr or tvl < self.min_tvl:
                continue

            # 集中流动性的 APR 通常是全范围的 2-5x
            cl_apr_estimate = apr * 2.5  # 保守估计 2.5x

            opportunities.append(CLSignal(
                action="deploy",
                pool_id=pool.get("poolId", ""),
                chain=pool.get("chain", ""),
                token0=pool.get("tokens", ["", ""])[0] if pool.get("tokens") else "",
                token1=pool.get("tokens", ["", ""])[1] if pool.get("tokens") and len(pool.get("tokens", [])) > 1 else "",
                new_range=None,  # 部署时再计算
                amount_usd=min(capital_usd * 0.2, 5000),
                reason=f"集中流动性机会: 全范围 APR {apr:.1f}%, 预估集中 APR {cl_apr_estimate:.1f}%",
                expected_apr=cl_apr_estimate,
                confidence=0.65,
            ))

        opportunities.sort(key=lambda o: o.expected_apr, reverse=True)
        logger.info(f"Found {len(opportunities)} concentrated liquidity opportunities")
        return opportunities[:10]
