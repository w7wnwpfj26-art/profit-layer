"""
永续 DEX LP 策略 (Perp DEX LP Strategy)

在 GMX V2 / Hyperliquid / dYdX 等永续 DEX 提供流动性:
- 赚取交易手续费 (通常 20-60% APR)
- 承担交易者的对手方风险
- 需要管理 delta 暴露

2026 最新: Hyperliquid HLP vault, GMX V2 GM pools
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


@dataclass
class PerpLPOpportunity:
    """永续 DEX LP 机会"""
    protocol: str        # "gmx-v2", "hyperliquid", "dydx-v4", "vertex"
    chain: str
    pool_name: str       # "ETH-USDC GM", "HLP Vault"
    assets: list[str]    # 池子资产
    apr_fees: float      # 手续费 APR
    apr_funding: float   # 资金费率收入
    apr_total: float
    tvl_usd: float
    utilization_pct: float  # 资金利用率
    max_drawdown_30d: float  # 30天最大回撤
    delta_exposure: str  # "neutral", "long_biased", "short_biased"
    risk_score: float
    recommendation: str


class PerpDexLPStrategy:
    """
    永续 DEX LP 策略

    核心逻辑:
    1. 扫描各永续 DEX 的 LP 池
    2. 评估: 手续费收入, 资金费率, 交易者盈亏, delta 暴露
    3. 风险管理: 监控 LP 的 PnL 和回撤
    4. 推荐最优 LP 池

    关键指标:
    - 手续费 APR: 交易量 * 费率 / TVL
    - 交易者 PnL: 交易者亏损 = LP 收益 (反之亦然)
    - Delta 暴露: LP 承担的方向性风险
    """

    # 已知永续 DEX LP 池
    KNOWN_POOLS = [
        {
            "protocol": "gmx-v2", "chain": "arbitrum",
            "pool": "GM ETH-USDC", "assets": ["ETH", "USDC"],
            "typical_apr": 25, "delta": "long_biased",
        },
        {
            "protocol": "gmx-v2", "chain": "arbitrum",
            "pool": "GM BTC-USDC", "assets": ["BTC", "USDC"],
            "typical_apr": 20, "delta": "long_biased",
        },
        {
            "protocol": "gmx-v2", "chain": "arbitrum",
            "pool": "GM SOL-USDC", "assets": ["SOL", "USDC"],
            "typical_apr": 30, "delta": "long_biased",
        },
        {
            "protocol": "hyperliquid", "chain": "hyperliquid",
            "pool": "HLP Vault", "assets": ["USDC"],
            "typical_apr": 35, "delta": "neutral",
        },
        {
            "protocol": "vertex", "chain": "arbitrum",
            "pool": "Vertex LP", "assets": ["USDC"],
            "typical_apr": 20, "delta": "neutral",
        },
    ]

    def __init__(
        self,
        min_apr: float = 10.0,
        min_tvl_usd: float = 5_000_000,
        max_drawdown_pct: float = 15.0,
    ):
        self.min_apr = min_apr
        self.min_tvl = min_tvl_usd
        self.max_drawdown = max_drawdown_pct

    def find_opportunities(
        self,
        pools: list[dict] | None = None,
        capital_usd: float = 10000,
    ) -> list[PerpLPOpportunity]:
        """发现永续 DEX LP 机会"""
        opportunities = []

        # 使用已知池子数据 + 链上数据
        for known in self.KNOWN_POOLS:
            apr = known["typical_apr"]
            if apr < self.min_apr:
                continue

            # 风险评分
            risk = 30  # 基础风险 (永续 DEX LP 有对手方风险)
            if known["delta"] != "neutral":
                risk += 15  # 有方向性暴露
            if apr > 40:
                risk += 10  # 高 APR 可能不可持续

            rec = "推荐" if risk < 45 else "谨慎参与"
            if known["delta"] == "neutral" and apr > 20:
                rec = "强烈推荐 - Delta 中性高收益"

            opportunities.append(PerpLPOpportunity(
                protocol=known["protocol"],
                chain=known["chain"],
                pool_name=known["pool"],
                assets=known["assets"],
                apr_fees=apr * 0.7,  # 估算: 70% 来自手续费
                apr_funding=apr * 0.3,  # 30% 来自资金费率
                apr_total=apr,
                tvl_usd=0,  # 从链上获取
                utilization_pct=0,
                max_drawdown_30d=0,
                delta_exposure=known["delta"],
                risk_score=risk,
                recommendation=rec,
            ))

        # 从 scanner 数据补充
        if pools:
            for pool in pools:
                protocol = pool.get("protocolId", "").lower()
                if not any(p in protocol for p in ["gmx", "hyperliquid", "dydx", "vertex", "perp"]):
                    continue

                apr = pool.get("aprTotal", 0)
                tvl = pool.get("tvlUsd", 0)
                if apr < self.min_apr or tvl < self.min_tvl:
                    continue

                opportunities.append(PerpLPOpportunity(
                    protocol=protocol,
                    chain=pool.get("chain", ""),
                    pool_name=pool.get("symbol", ""),
                    assets=pool.get("tokens", []),
                    apr_fees=apr * 0.7,
                    apr_funding=apr * 0.3,
                    apr_total=apr,
                    tvl_usd=tvl,
                    utilization_pct=0,
                    max_drawdown_30d=0,
                    delta_exposure="unknown",
                    risk_score=40,
                    recommendation="需要进一步分析",
                ))

        opportunities.sort(key=lambda o: o.apr_total, reverse=True)
        logger.info(f"Found {len(opportunities)} perp DEX LP opportunities")
        return opportunities
