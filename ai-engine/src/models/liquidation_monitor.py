"""
清算风险监控器 (Liquidation Monitor)

解决核心问题：借贷仓位的健康因子不足时会被清算，损失惨重。

监控所有借贷仓位的健康因子，在清算风险升高时：
1. 提前预警
2. 自动追加抵押品或减少借款
3. 计算安全边际
"""

from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class HealthStatus(str, Enum):
    SAFE = "safe"                    # 健康因子 > 2.0
    WATCH = "watch"                  # 1.5 < 健康因子 < 2.0
    WARNING = "warning"              # 1.2 < 健康因子 < 1.5
    DANGER = "danger"                # 1.0 < 健康因子 < 1.2
    LIQUIDATABLE = "liquidatable"    # 健康因子 < 1.0


@dataclass
class LiquidationRisk:
    position_id: str
    protocol: str
    chain: str
    wallet_address: str

    # 仓位数据
    collateral_usd: float
    debt_usd: float
    health_factor: float
    liquidation_threshold: float     # 清算阈值（如 0.825 = 82.5%）

    # 风险评估
    status: HealthStatus
    price_drop_to_liquidation_pct: float   # 抵押品价格下跌多少会被清算
    liquidation_penalty_pct: float          # 被清算的罚金比例
    potential_loss_usd: float               # 被清算的潜在损失

    # 建议
    action: str                      # "none" / "add_collateral" / "repay_partial" / "exit"
    suggested_amount_usd: float      # 建议追加/偿还的金额
    reasoning: str


class LiquidationMonitor:
    """
    监控借贷仓位的清算风险。

    健康因子 = (抵押品价值 * 清算阈值) / 债务
    当健康因子 < 1.0 时，仓位可以被清算。
    """

    # 各协议的清算罚金
    LIQUIDATION_PENALTIES = {
        "aave-v3": 0.05,       # 5%
        "compound-v3": 0.05,
        "maker": 0.13,         # 13%
        "venus": 0.10,
    }

    def __init__(
        self,
        safe_threshold: float = 2.0,
        watch_threshold: float = 1.5,
        warning_threshold: float = 1.2,
        danger_threshold: float = 1.05,
    ):
        self.safe_threshold = safe_threshold
        self.watch_threshold = watch_threshold
        self.warning_threshold = warning_threshold
        self.danger_threshold = danger_threshold

    def assess_risk(
        self,
        position_id: str,
        protocol: str,
        chain: str,
        wallet_address: str,
        collateral_usd: float,
        debt_usd: float,
        liquidation_threshold: float = 0.825,
    ) -> LiquidationRisk:
        """评估单个借贷仓位的清算风险。"""

        if debt_usd <= 0:
            return LiquidationRisk(
                position_id=position_id, protocol=protocol, chain=chain,
                wallet_address=wallet_address, collateral_usd=collateral_usd,
                debt_usd=0, health_factor=999, liquidation_threshold=liquidation_threshold,
                status=HealthStatus.SAFE, price_drop_to_liquidation_pct=100,
                liquidation_penalty_pct=0, potential_loss_usd=0,
                action="none", suggested_amount_usd=0, reasoning="无借款，无风险",
            )

        # 健康因子
        hf = (collateral_usd * liquidation_threshold) / debt_usd

        # 状态判定
        if hf >= self.safe_threshold:
            status = HealthStatus.SAFE
        elif hf >= self.watch_threshold:
            status = HealthStatus.WATCH
        elif hf >= self.warning_threshold:
            status = HealthStatus.WARNING
        elif hf >= 1.0:
            status = HealthStatus.DANGER
        else:
            status = HealthStatus.LIQUIDATABLE

        # 价格下跌多少会被清算
        # 清算条件: collateral * (1-drop) * liq_threshold = debt
        # drop = 1 - debt / (collateral * liq_threshold) = 1 - 1/hf
        if hf >= 1:
            price_drop = (1 - 1 / hf) * 100
        else:
            price_drop = 0  # 已经可被清算，price_drop 已无意义
        price_drop = max(0, price_drop) if hf > 0 else 0

        # 清算罚金
        penalty_pct = self.LIQUIDATION_PENALTIES.get(protocol, 0.05)
        potential_loss = debt_usd * penalty_pct if status == HealthStatus.LIQUIDATABLE else 0

        # 行动建议
        action, suggested, reasoning = self._recommend_action(
            hf, status, collateral_usd, debt_usd, price_drop,
        )

        logger.info(
            f"清算风险: {position_id} HF={hf:.2f} 状态={status.value} "
            f"价格下跌 {price_drop:.1f}% 会被清算"
        )

        return LiquidationRisk(
            position_id=position_id, protocol=protocol, chain=chain,
            wallet_address=wallet_address, collateral_usd=collateral_usd,
            debt_usd=debt_usd, health_factor=round(hf, 4),
            liquidation_threshold=liquidation_threshold,
            status=status, price_drop_to_liquidation_pct=round(price_drop, 2),
            liquidation_penalty_pct=penalty_pct * 100,
            potential_loss_usd=round(potential_loss, 2),
            action=action, suggested_amount_usd=round(suggested, 2),
            reasoning=reasoning,
        )

    def _recommend_action(
        self, hf: float, status: HealthStatus,
        collateral: float, debt: float, price_drop: float,
    ) -> tuple[str, float, str]:
        if status == HealthStatus.LIQUIDATABLE:
            return (
                "exit",
                debt,
                f"紧急！健康因子 {hf:.2f} < 1.0，已处于可清算状态，立即全额偿还债务",
            )
        if status == HealthStatus.DANGER:
            repay = debt * 0.3
            return (
                "repay_partial",
                repay,
                f"危险！健康因子 {hf:.2f}，价格再跌 {price_drop:.1f}% 就会被清算。"
                f"建议立即偿还 ${repay:.0f} 债务",
            )
        if status == HealthStatus.WARNING:
            add = collateral * 0.2
            return (
                "add_collateral",
                add,
                f"警告：健康因子 {hf:.2f}，建议追加 ${add:.0f} 抵押品提升安全边际",
            )
        if status == HealthStatus.WATCH:
            return (
                "none",
                0,
                f"关注中：健康因子 {hf:.2f}，暂时安全但需要持续监控",
            )
        return ("none", 0, f"安全：健康因子 {hf:.2f}，有充足的安全边际")

    def batch_assess(
        self,
        positions: list[dict],
    ) -> list[LiquidationRisk]:
        """批量评估所有借贷仓位。"""
        results = []
        for pos in positions:
            if pos.get("debt_usd", 0) <= 0:
                continue
            risk = self.assess_risk(
                position_id=pos.get("position_id", ""),
                protocol=pos.get("protocol", ""),
                chain=pos.get("chain", ""),
                wallet_address=pos.get("wallet_address", ""),
                collateral_usd=pos.get("collateral_usd", 0),
                debt_usd=pos.get("debt_usd", 0),
                liquidation_threshold=pos.get("liquidation_threshold", 0.825),
            )
            results.append(risk)

        # 按风险从高到低排序
        results.sort(key=lambda r: r.health_factor)
        return results
