"""
奖励代币分析器 (Reward Token Analyzer)

解决核心问题：表面 APR 30% 但奖励代币持续贬值，实际收益可能为负。

很多 DeFi 协议的高 APR 来自奖励代币（如 CRV、THL、RAY），
这些代币因为持续通胀发行，价格长期下跌。
如果不考虑奖励代币的价格趋势，计算出的收益是虚假的。

本模块：
1. 追踪奖励代币的历史价格趋势
2. 计算代币贬值对实际收益的影响
3. 决定最优的奖励代币卖出策略
"""

from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class SellStrategy(str, Enum):
    IMMEDIATE = "immediate"          # 收到就卖，最安全
    ACCUMULATE_DAILY = "daily"       # 每天卖一次
    ACCUMULATE_WEEKLY = "weekly"     # 每周卖一次
    HOLD = "hold"                    # 长期持有（高风险）
    DCA_OUT = "dca_out"             # 分批卖出


@dataclass
class RewardTokenAnalysis:
    token_symbol: str
    token_address: str
    current_price_usd: float
    price_change_7d_pct: float
    price_change_30d_pct: float
    price_change_90d_pct: float
    is_inflationary: bool            # 是否持续增发
    daily_emission_usd: float        # 每日新增发行量（美元）
    sell_pressure_score: float       # 0-100，卖压评分
    recommended_strategy: SellStrategy
    adjusted_apr_pct: float          # 考虑代币贬值后的调整年化
    reasoning: str


class RewardTokenAnalyzer:
    """
    分析奖励代币的真实价值和最优卖出策略。

    核心洞察：
    - 如果奖励代币 30 天跌了 20%，那 30% 的奖励 APR 实际只值 24%
    - 高通胀代币应该立即卖出，不要持有
    - 只有有真实收入支撑的代币才值得持有
    """

    # 已知的高通胀代币（奖励代币）
    INFLATIONARY_TOKENS = {
        "CRV", "CVX", "CAKE", "SUSHI", "JOE", "SPELL",
        "THL", "RAY", "MNDE", "LDO", "COMP", "AAVE",
        "GMX", "ARB", "OP", "APT", "SUI",
    }

    # 有真实收入支撑的代币（可以考虑持有）
    REAL_YIELD_TOKENS = {
        "GMX",   # 平台交易费分红
        "GNS",   # 交易费分红
        "SUSHI", # xSUSHI 分红（有限）
    }

    def analyze(
        self,
        token_symbol: str,
        token_address: str,
        current_price_usd: float,
        price_7d_ago: float | None = None,
        price_30d_ago: float | None = None,
        price_90d_ago: float | None = None,
        daily_emission_tokens: float = 0,
        gross_reward_apr_pct: float = 0,
    ) -> RewardTokenAnalysis:
        """分析奖励代币并给出卖出建议。"""

        # 计算价格变动
        change_7d = self._pct_change(current_price_usd, price_7d_ago)
        change_30d = self._pct_change(current_price_usd, price_30d_ago)
        change_90d = self._pct_change(current_price_usd, price_90d_ago)

        # 判断是否通胀代币
        is_inflationary = (
            token_symbol.upper() in self.INFLATIONARY_TOKENS
            or daily_emission_tokens > 0
        )

        # 每日发行的美元价值
        daily_emission_usd = daily_emission_tokens * current_price_usd

        # 卖压评分 (0-100)
        sell_pressure = self._calculate_sell_pressure(
            change_7d, change_30d, change_90d,
            is_inflationary, daily_emission_usd,
        )

        # 调整后的实际 APR
        # 如果代币 30 天跌了 X%，年化贬值约 X% * 12
        if change_30d is not None and change_30d < 0:
            annualized_depreciation = abs(change_30d) * 12
            adjusted_apr = max(0, gross_reward_apr_pct - annualized_depreciation)
        elif change_90d is not None and change_90d < 0:
            annualized_depreciation = abs(change_90d) * 4
            adjusted_apr = max(0, gross_reward_apr_pct - annualized_depreciation)
        else:
            adjusted_apr = gross_reward_apr_pct

        # 推荐卖出策略
        strategy, reasoning = self._recommend_strategy(
            token_symbol, sell_pressure, change_30d or 0,
            is_inflationary, current_price_usd,
        )

        logger.info(
            f"奖励代币分析: {token_symbol} "
            f"价格30d变化={change_30d or 0:.1f}%, "
            f"表面APR={gross_reward_apr_pct:.1f}% -> "
            f"调整APR={adjusted_apr:.1f}%, "
            f"策略={strategy.value}"
        )

        return RewardTokenAnalysis(
            token_symbol=token_symbol,
            token_address=token_address,
            current_price_usd=current_price_usd,
            price_change_7d_pct=change_7d or 0,
            price_change_30d_pct=change_30d or 0,
            price_change_90d_pct=change_90d or 0,
            is_inflationary=is_inflationary,
            daily_emission_usd=round(daily_emission_usd, 2),
            sell_pressure_score=round(sell_pressure, 1),
            recommended_strategy=strategy,
            adjusted_apr_pct=round(adjusted_apr, 4),
            reasoning=reasoning,
        )

    def _pct_change(self, current: float, past: float | None) -> float | None:
        if past is None or past <= 0:
            return None
        return (current - past) / past * 100

    def _calculate_sell_pressure(
        self,
        change_7d: float | None,
        change_30d: float | None,
        change_90d: float | None,
        is_inflationary: bool,
        daily_emission_usd: float,
    ) -> float:
        score = 50.0  # 基线

        # 价格下跌趋势
        if change_7d is not None and change_7d < -5:
            score += 15
        if change_30d is not None and change_30d < -15:
            score += 20
        if change_90d is not None and change_90d < -30:
            score += 15

        # 通胀
        if is_inflationary:
            score += 10
        if daily_emission_usd > 100_000:
            score += 10

        # 价格上涨（减少卖压）
        if change_30d is not None and change_30d > 10:
            score -= 20
        if change_7d is not None and change_7d > 5:
            score -= 10

        return max(0, min(100, score))

    def _recommend_strategy(
        self,
        token_symbol: str,
        sell_pressure: float,
        change_30d: float,
        is_inflationary: bool,
        price: float,
    ) -> tuple[SellStrategy, str]:
        symbol_upper = token_symbol.upper()

        # 真实收益代币可以考虑持有
        if symbol_upper in self.REAL_YIELD_TOKENS and change_30d > -10:
            return (
                SellStrategy.ACCUMULATE_WEEKLY,
                f"{symbol_upper} 有真实收入分红，可以每周卖出一部分，保留一部分",
            )

        # 高卖压 = 立即卖
        if sell_pressure >= 70:
            return (
                SellStrategy.IMMEDIATE,
                f"卖压评分 {sell_pressure:.0f}/100，代币30天跌 {change_30d:.1f}%，建议收到即卖",
            )

        # 中等卖压 = 每日卖
        if sell_pressure >= 50 or is_inflationary:
            return (
                SellStrategy.ACCUMULATE_DAILY,
                f"通胀代币，卖压评分 {sell_pressure:.0f}/100，建议每日汇总卖出",
            )

        # 低卖压 = 每周卖
        if sell_pressure >= 30:
            return (
                SellStrategy.ACCUMULATE_WEEKLY,
                f"卖压较低，可以每周汇总卖出减少 Gas",
            )

        # 极低卖压
        return (
            SellStrategy.DCA_OUT,
            f"代币价格稳定或上涨，可以分批卖出",
        )
