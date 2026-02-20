"""
RWA 代币化资产收益策略 (Real World Asset Yield)

将资金配置到链上代币化的现实世界资产（如美国国债），
获取低风险的基础收益率。

2026年市场规模：$21B+
主要产品：代币化美国国债（4-5% APY）

作用：
1. 作为投资组合的"安全垫"（类似传统金融的国债配置）
2. 在 DeFi 收益不佳时提供保底收益
3. 作为抵押品产生额外收益
"""

from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class RWAOpportunity:
    protocol: str
    product_name: str
    chain: str
    underlying_asset: str            # "US Treasury", "Corporate Bond" 等
    yield_pct: float                 # 年化收益
    tvl_usd: float
    min_investment_usd: float
    kyc_required: bool
    accredited_only: bool            # 是否只对合格投资者开放
    redemption_period: str           # 赎回时间
    risk_level: str
    token_symbol: str                # 代币符号 (USDY, sDAI, etc.)
    composability: str               # "high" = 可在 DeFi 中使用


class RWAYieldStrategy:
    """
    RWA 链上资产收益策略。

    策略逻辑：
    1. 配置 20-40% 资金到 RWA 产品作为安全垫
    2. RWA 代币可作为借贷抵押品，再赚一层
    3. 当 DeFi 收益率低于国债利率时，自动转入 RWA
    """

    def __init__(
        self,
        min_yield_pct: float = 3.0,
        max_portfolio_allocation_pct: float = 40.0,
    ):
        self.min_yield = min_yield_pct
        self.max_allocation = max_portfolio_allocation_pct

    def find_opportunities(self) -> list[RWAOpportunity]:
        """查找 RWA 收益机会。"""
        # TODO: Replace hardcoded data with live API integration (e.g. Ondo, MakerDAO API)

        opportunities = [
            RWAOpportunity(
                protocol="ondo",
                product_name="USDY (Ondo US Dollar Yield)",
                chain="ethereum",
                underlying_asset="短期美国国债 + 银行存款",
                yield_pct=4.65,
                tvl_usd=500_000_000,
                min_investment_usd=100,
                kyc_required=False,
                accredited_only=False,
                redemption_period="即时",
                risk_level="very_low",
                token_symbol="USDY",
                composability="high",
            ),
            RWAOpportunity(
                protocol="maker",
                product_name="sDAI (Savings DAI)",
                chain="ethereum",
                underlying_asset="美国国债 + DeFi 借贷利息",
                yield_pct=5.0,
                tvl_usd=2_000_000_000,
                min_investment_usd=1,
                kyc_required=False,
                accredited_only=False,
                redemption_period="即时",
                risk_level="low",
                token_symbol="sDAI",
                composability="high",
            ),
            RWAOpportunity(
                protocol="mountain",
                product_name="USDM (Mountain Protocol)",
                chain="ethereum",
                underlying_asset="短期美国国债",
                yield_pct=4.3,
                tvl_usd=150_000_000,
                min_investment_usd=100,
                kyc_required=False,
                accredited_only=False,
                redemption_period="1-2 天",
                risk_level="low",
                token_symbol="USDM",
                composability="high",
            ),
            RWAOpportunity(
                protocol="blackrock",
                product_name="BUIDL (BlackRock USD Fund)",
                chain="ethereum",
                underlying_asset="美国国债 + 回购协议",
                yield_pct=4.5,
                tvl_usd=1_500_000_000,
                min_investment_usd=5_000_000,
                kyc_required=True,
                accredited_only=True,
                redemption_period="T+0",
                risk_level="very_low",
                token_symbol="BUIDL",
                composability="medium",
            ),
            RWAOpportunity(
                protocol="franklin_templeton",
                product_name="FOBXX (OnChain US Gov Money Fund)",
                chain="ethereum",
                underlying_asset="美国政府债券",
                yield_pct=4.8,
                tvl_usd=400_000_000,
                min_investment_usd=1_000,
                kyc_required=True,
                accredited_only=False,
                redemption_period="T+1",
                risk_level="very_low",
                token_symbol="FOBXX",
                composability="low",
            ),
        ]

        filtered = [o for o in opportunities if o.yield_pct >= self.min_yield]
        filtered.sort(key=lambda o: o.yield_pct, reverse=True)

        logger.info(f"找到 {len(filtered)} 个 RWA 收益机会")
        return filtered

    def should_shift_to_rwa(
        self,
        avg_defi_apr: float,
        rwa_yield: float = 4.5,
        risk_threshold: float = 1.5,
    ) -> tuple[bool, str]:
        """
        判断是否应该将 DeFi 资金转入 RWA。

        规则：如果 DeFi 风险调整后收益 < RWA 收益，就应该转入 RWA。
        风险调整 = DeFi APR / risk_multiplier
        """
        risk_adjusted_defi = avg_defi_apr / risk_threshold

        if risk_adjusted_defi < rwa_yield:
            return (
                True,
                f"DeFi 风险调整收益 {risk_adjusted_defi:.1f}% < RWA {rwa_yield:.1f}%，"
                f"建议将部分资金转入 RWA 产品",
            )
        return (
            False,
            f"DeFi 风险调整收益 {risk_adjusted_defi:.1f}% > RWA {rwa_yield:.1f}%，"
            f"继续 DeFi 策略",
        )
