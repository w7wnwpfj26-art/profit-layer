"""
Stop Loss Manager

Monitors positions and triggers exits when losses exceed thresholds.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)


@dataclass
class StopLossAlert:
    position_id: str
    pool_id: str
    chain: str
    protocol_id: str
    loss_pct: float
    loss_usd: float
    trigger_type: str     # "stop_loss", "trailing_stop", "time_decay"
    action: str           # "exit", "reduce", "alert"
    signal_id: str
    timestamp: str


class StopLossManager:
    """
    Monitors positions for stop-loss conditions.
    
    Supports:
    - Fixed stop loss (e.g., -10%)
    - Trailing stop (protect profits)
    - Time-based decay (exit if underperforming over time)
    - APR drop stop (exit if APR drops significantly)
    """

    def __init__(
        self,
        stop_loss_pct: float = 10.0,
        trailing_stop_pct: float = 15.0,
        apr_drop_threshold_pct: float = 50.0,
        max_days_underperforming: int = 7,
    ):
        self.stop_loss_pct = stop_loss_pct
        self.trailing_stop_pct = trailing_stop_pct
        self.apr_drop_threshold = apr_drop_threshold_pct
        self.max_days_underperforming = max_days_underperforming
        self.peak_values: dict[str, float] = {}

    def check_positions(
        self,
        positions: list[dict],
        current_pool_data: dict[str, dict],
    ) -> list[StopLossAlert]:
        """
        Check all positions for stop-loss triggers.
        
        Args:
            positions: Active positions with current values
            current_pool_data: Latest pool APR/TVL data keyed by pool_id
        """
        alerts: list[StopLossAlert] = []

        for pos in positions:
            pos_id = pos.get("positionId", "")
            pool_id = pos.get("poolId", "")
            # 优先使用入场价值，如果没有则跳过（避免新仓位错误触发止损）
            entry_value = pos.get("entryValueUsd")
            if entry_value is None or entry_value <= 0:
                # 新仓位没有入场价值，跳过固定止损检查
                # 但仍检查移动止损
                entry_value = pos.get("valueUsd", 0)
                is_new_position = True
            else:
                is_new_position = False
            current_value = pos.get("valueUsd", 0)

            if entry_value <= 0:
                continue

            # Track peak value for trailing stop
            peak = self.peak_values.get(pos_id, entry_value)
            if current_value > peak:
                self.peak_values[pos_id] = current_value
                peak = current_value

            # 1. Fixed stop loss (仅对已有仓位生效)
            if not is_new_position and entry_value > 0:
                loss_pct = (entry_value - current_value) / entry_value * 100
                if loss_pct >= self.stop_loss_pct:
                    alerts.append(StopLossAlert(
                        position_id=pos_id,
                        pool_id=pool_id,
                        chain=pos.get("chain", ""),
                        protocol_id=pos.get("protocolId", ""),
                        loss_pct=round(loss_pct, 2),
                        loss_usd=round(entry_value - current_value, 2),
                        trigger_type="stop_loss",
                        action="exit",
                        signal_id=str(uuid.uuid4()),
                        timestamp=datetime.now(timezone.utc).isoformat(),
                    ))
                    continue

            # 2. Trailing stop (from peak)
            drawdown_pct = (peak - current_value) / peak * 100 if peak > 0 else 0
            if drawdown_pct >= self.trailing_stop_pct:
                alerts.append(StopLossAlert(
                    position_id=pos_id,
                    pool_id=pool_id,
                    chain=pos.get("chain", ""),
                    protocol_id=pos.get("protocolId", ""),
                    loss_pct=round(drawdown_pct, 2),
                    loss_usd=round(peak - current_value, 2),
                    trigger_type="trailing_stop",
                    action="exit",
                    signal_id=str(uuid.uuid4()),
                    timestamp=datetime.now(timezone.utc).isoformat(),
                ))
                continue

            # 3. APR drop check
            pool_data = current_pool_data.get(pool_id, {})
            current_apr = pool_data.get("aprTotal", 0)
            entry_apr = pos.get("entryApr", current_apr)

            if entry_apr > 0:
                apr_drop = (entry_apr - current_apr) / entry_apr * 100
                if apr_drop >= self.apr_drop_threshold:
                    alerts.append(StopLossAlert(
                        position_id=pos_id,
                        pool_id=pool_id,
                        chain=pos.get("chain", ""),
                        protocol_id=pos.get("protocolId", ""),
                        loss_pct=round(apr_drop, 2),
                        loss_usd=0,
                        trigger_type="apr_drop",
                        action="alert",
                        signal_id=str(uuid.uuid4()),
                        timestamp=datetime.now(timezone.utc).isoformat(),
                    ))

        if alerts:
            logger.warning(f"Stop-loss: {len(alerts)} alerts triggered")

        return alerts
