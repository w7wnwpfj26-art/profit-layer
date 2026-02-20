"""
永续合约资金费率套利策略 (Perpetual Funding Rate Arbitrage)

策略原理：
永续合约每 8 小时收取/支付资金费率。
当市场看涨时，多头向空头支付资金费率（通常 0.01-0.1%/8h）。

Delta 中性策略：
1. 在现货市场做多（买入 ETH）
2. 在永续合约市场做空等量 ETH
3. 净敞口 = 0（价格涨跌对你没影响）
4. 每 8 小时收取资金费率作为纯利润

预期收益：10-40% APY（牛市更高）
风险：交易所倒闭、资金费率反转、爆仓
"""

from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class FundingRateOpportunity:
    exchange: str
    symbol: str                      # e.g., "ETH-PERP"
    current_funding_rate: float      # 当前 8h 资金费率
    annualized_rate_pct: float       # 年化
    avg_7d_rate_pct: float          # 7 日平均年化
    direction: str                   # "long_spot_short_perp" 或反向
    capital_required_usd: float      # 需要的资金（现货 + 保证金）
    estimated_daily_yield_usd: float
    estimated_annual_yield_usd: float
    risk_level: str
    notes: str


class FundingRateArbStrategy:
    """
    永续合约资金费率套利。

    支持的交易所/协议：
    - 中心化：Binance, OKX, Bybit (API 交易)
    - 去中心化：GMX, dYdX, HyperLiquid, Drift (链上)
    """

    def __init__(
        self,
        min_annual_rate_pct: float = 10.0,
        max_leverage: float = 2.0,
        capital_usd: float = 10_000,
    ):
        self.min_annual_rate = min_annual_rate_pct
        self.max_leverage = max_leverage
        self.capital_usd = capital_usd

    def analyze_opportunities(
        self,
        funding_rates: list[dict],
    ) -> list[FundingRateOpportunity]:
        """
        分析资金费率数据，找到套利机会。

        funding_rates 格式：
        [{"exchange": "binance", "symbol": "ETHUSDT", "rate": 0.0003, "avg_7d": 0.00025}, ...]
        """
        opportunities: list[FundingRateOpportunity] = []

        for fr in funding_rates:
            rate = fr.get("rate", 0)
            avg_7d = fr.get("avg_7d", rate)

            # 年化 = 8h费率 * 3(每天) * 365
            annualized = abs(rate) * 3 * 365 * 100
            avg_annualized = abs(avg_7d) * 3 * 365 * 100

            if avg_annualized < self.min_annual_rate:
                continue

            # 方向：正费率 = 做空永续(收费率)，负费率 = 做多永续
            if rate > 0:
                direction = "long_spot_short_perp"
            else:
                direction = "short_spot_long_perp"

            # 资金分配：一半现货，一半保证金
            capital_needed = self.capital_usd
            daily_yield = capital_needed * abs(rate) * 3  # 每天 3 次结算
            annual_yield = daily_yield * 365

            # 风险评估
            if avg_annualized > 50:
                risk = "high"
                notes = "资金费率异常高，可能即将反转"
            elif avg_annualized > 20:
                risk = "medium"
                notes = "资金费率健康，适合持续套利"
            else:
                risk = "low"
                notes = "费率较低但稳定"

            opportunities.append(FundingRateOpportunity(
                exchange=fr.get("exchange", ""),
                symbol=fr.get("symbol", ""),
                current_funding_rate=rate,
                annualized_rate_pct=round(annualized, 2),
                avg_7d_rate_pct=round(avg_annualized, 2),
                direction=direction,
                capital_required_usd=capital_needed,
                estimated_daily_yield_usd=round(daily_yield, 2),
                estimated_annual_yield_usd=round(annual_yield, 2),
                risk_level=risk,
                notes=notes,
            ))

        opportunities.sort(key=lambda o: o.avg_7d_rate_pct, reverse=True)
        logger.info(f"找到 {len(opportunities)} 个资金费率套利机会")
        return opportunities
