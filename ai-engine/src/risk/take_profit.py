"""
智能止盈管理器 - 三种模式

1. 固定止盈 (fixed): 收益达到 X% 时提取 50% 利润
2. 移动止盈 (trailing): 从最高点回撤 Y% 时全部退出
3. 阶梯出场 (ladder): +10% 提 25%, +20% 再提 25%, +50% 全部退出
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


@dataclass
class TakeProfitSignal:
    position_id: str
    pool_id: str
    chain: str
    action: str  # "decrease" (部分止盈) 或 "exit" (全部退出)
    amount_pct: float  # 提取比例 0-100
    reason: str
    current_pnl_pct: float
    timestamp: str = ""


@dataclass
class PositionTracker:
    """跟踪每个持仓的峰值和已提取比例"""
    position_id: str
    entry_value_usd: float
    peak_value_usd: float  # 历史最高净值
    total_withdrawn_pct: float = 0  # 已提取的累计比例
    ladder_stage: int = 0  # 阶梯出场已到达的阶段


class TakeProfitManager:
    def __init__(
        self,
        mode: str = "ladder",       # "fixed", "trailing", "ladder"
        take_profit_pct: float = 20,  # 固定止盈触发比例
        trailing_stop_pct: float = 10,  # 移动止盈回撤比例
    ):
        self.mode = mode
        self.take_profit_pct = take_profit_pct
        self.trailing_stop_pct = trailing_stop_pct
        self.trackers: dict[str, PositionTracker] = {}

    def _get_tracker(self, position_id: str, current_value: float) -> PositionTracker:
        if position_id not in self.trackers:
            self.trackers[position_id] = PositionTracker(
                position_id=position_id,
                entry_value_usd=current_value,
                peak_value_usd=current_value,
            )
        tracker = self.trackers[position_id]
        # 更新峰值
        if current_value > tracker.peak_value_usd:
            tracker.peak_value_usd = current_value
        return tracker

    def check_positions(
        self, positions: list[dict]
    ) -> list[TakeProfitSignal]:
        """检查所有持仓是否触发止盈"""
        signals: list[TakeProfitSignal] = []
        now = datetime.now(timezone.utc).isoformat()

        for pos in positions:
            pos_id = pos.get("positionId", "")
            current_value = pos.get("valueUsd", 0)
            entry_value = pos.get("entryValueUsd", current_value)  # 若无入场价，用当前值
            unrealized_pnl = pos.get("unrealizedPnlUsd", 0)
            pool_id = pos.get("poolId", "")
            chain = pos.get("chain", "")

            if current_value <= 0 or entry_value <= 0:
                continue

            pnl_pct = ((current_value - entry_value) / entry_value) * 100
            tracker = self._get_tracker(pos_id, current_value)

            signal = None

            if self.mode == "fixed":
                signal = self._check_fixed(tracker, pos_id, pool_id, chain, pnl_pct, now)
            elif self.mode == "trailing":
                signal = self._check_trailing(tracker, pos_id, pool_id, chain, current_value, pnl_pct, now)
            elif self.mode == "ladder":
                signal = self._check_ladder(tracker, pos_id, pool_id, chain, pnl_pct, now)

            if signal:
                signals.append(signal)

        if signals:
            logger.info(f"止盈检查: {len(signals)} 个信号触发 (模式: {self.mode})")

        return signals

    def _check_fixed(self, tracker: PositionTracker, pos_id: str, pool_id: str, chain: str, pnl_pct: float, now: str) -> TakeProfitSignal | None:
        """固定止盈: 收益达到 X% 时提取 50%"""
        if pnl_pct >= self.take_profit_pct and tracker.total_withdrawn_pct < 50:
            tracker.total_withdrawn_pct = 50
            return TakeProfitSignal(
                position_id=pos_id, pool_id=pool_id, chain=chain,
                action="decrease", amount_pct=50,
                reason=f"固定止盈: 收益 {pnl_pct:.1f}% ≥ {self.take_profit_pct}%，提取 50%",
                current_pnl_pct=pnl_pct, timestamp=now,
            )
        return None

    def _check_trailing(self, tracker: PositionTracker, pos_id: str, pool_id: str, chain: str, current_value: float, pnl_pct: float, now: str) -> TakeProfitSignal | None:
        """移动止盈: 从最高点回撤 Y% 时全部退出"""
        if tracker.peak_value_usd <= 0 or pnl_pct <= 0:
            return None  # 只在盈利时启动

        drawdown_from_peak = ((tracker.peak_value_usd - current_value) / tracker.peak_value_usd) * 100

        if drawdown_from_peak >= self.trailing_stop_pct and pnl_pct > 0:
            return TakeProfitSignal(
                position_id=pos_id, pool_id=pool_id, chain=chain,
                action="exit", amount_pct=100,
                reason=f"移动止盈: 从峰值回撤 {drawdown_from_peak:.1f}% ≥ {self.trailing_stop_pct}%，全部退出",
                current_pnl_pct=pnl_pct, timestamp=now,
            )
        return None

    def _check_ladder(self, tracker: PositionTracker, pos_id: str, pool_id: str, chain: str, pnl_pct: float, now: str) -> TakeProfitSignal | None:
        """阶梯出场: +10% 提 25%, +20% 再提 25%, +50% 全部退出"""
        ladder_steps = [
            (10, 25, 1),   # 收益 ≥10%, 提取 25%, 阶段 1
            (20, 25, 2),   # 收益 ≥20%, 再提取 25%, 阶段 2
            (50, 100, 3),  # 收益 ≥50%, 全部退出, 阶段 3
        ]

        for threshold_pct, withdraw_pct, stage in ladder_steps:
            if pnl_pct >= threshold_pct and tracker.ladder_stage < stage:
                tracker.ladder_stage = stage
                tracker.total_withdrawn_pct += withdraw_pct
                action = "exit" if withdraw_pct >= 100 else "decrease"
                return TakeProfitSignal(
                    position_id=pos_id, pool_id=pool_id, chain=chain,
                    action=action, amount_pct=withdraw_pct,
                    reason=f"阶梯止盈 (阶段{stage}): 收益 {pnl_pct:.1f}% ≥ {threshold_pct}%，提取 {withdraw_pct}%",
                    current_pnl_pct=pnl_pct, timestamp=now,
                )

        return None

    def remove_position(self, position_id: str) -> None:
        """持仓关闭后清理跟踪器"""
        self.trackers.pop(position_id, None)
