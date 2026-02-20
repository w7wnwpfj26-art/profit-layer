"""
Risk Worker - Continuous Risk Monitoring

Monitors all active positions for risk events.
"""

import asyncio
import logging
import os

import psycopg2

from ..risk.stop_loss import StopLossManager
from ..risk.anomaly_detector import AnomalyDetector
from ..risk.exposure_manager import ExposureManager
from ..risk.take_profit import TakeProfitManager

logger = logging.getLogger(__name__)


class RiskMonitor:
    """Continuous risk monitoring service."""

    def __init__(self):
        self.stop_loss = StopLossManager()
        self.anomaly_detector = AnomalyDetector()
        self.exposure_manager = ExposureManager()
        self.take_profit = TakeProfitManager()

    def get_db_connection(self):
        return psycopg2.connect(
            host=os.getenv("POSTGRES_HOST", "localhost"),
            port=int(os.getenv("POSTGRES_PORT", "5433")),
            dbname=os.getenv("POSTGRES_DB", "defi_yield"),
            user=os.getenv("POSTGRES_USER", "defi"),
            password=os.getenv("POSTGRES_PASSWORD", ""),
        )

    async def run_risk_check(self):
        """Run a complete risk check cycle."""
        try:
            conn = self.get_db_connection()
            cur = conn.cursor()

            # 1. Get active positions
            cur.execute(
                "SELECT position_id, pool_id, chain_id, value_usd, strategy_id "
                "FROM positions WHERE status = 'active'"
            )
            positions = []
            for row in cur.fetchall():
                positions.append({
                    "positionId": row[0],
                    "poolId": row[1],
                    "chain": row[2],
                    "valueUsd": float(row[3]),
                    "strategyId": row[4],
                })

            # 2. Get current pool data
            cur.execute(
                "SELECT pool_id, apr_total, tvl_usd FROM pools WHERE is_active = true"
            )
            pool_data = {}
            current_data = []
            for row in cur.fetchall():
                pool_data[row[0]] = {"aprTotal": float(row[1]), "tvlUsd": float(row[2])}
                current_data.append({
                    "poolId": row[0],
                    "aprTotal": float(row[1]),
                    "tvlUsd": float(row[2]),
                })

            # 3. Check stop losses
            stop_loss_alerts = self.stop_loss.check_positions(positions, pool_data)
            for alert in stop_loss_alerts:
                cur.execute(
                    "INSERT INTO audit_log (event_type, severity, source, message, metadata) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (
                        "stop_loss_triggered",
                        "warning" if alert.action == "alert" else "critical",
                        "risk_monitor",
                        f"Stop loss: {alert.trigger_type} for position {alert.position_id}",
                        "{}",
                    ),
                )

            # 4. Check anomalies
            anomalies = self.anomaly_detector.detect(current_data)
            for anomaly in anomalies:
                cur.execute(
                    "INSERT INTO audit_log (event_type, severity, source, message, metadata) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (
                        f"anomaly_{anomaly.anomaly_type}",
                        anomaly.severity,
                        "risk_monitor",
                        anomaly.description,
                        "{}",
                    ),
                )

            # 5. 智能止盈检查
            try:
                # 从 DB 读取止盈配置
                cur.execute(
                    "SELECT key, value FROM system_config WHERE key IN ('take_profit_pct', 'trailing_stop_pct', 'take_profit_mode')"
                )
                tp_cfg = {}
                for row in cur.fetchall():
                    tp_cfg[row[0]] = row[1]

                self.take_profit.mode = tp_cfg.get("take_profit_mode", "ladder")
                self.take_profit.take_profit_pct = float(tp_cfg.get("take_profit_pct", "20"))
                self.take_profit.trailing_stop_pct = float(tp_cfg.get("trailing_stop_pct", "10"))

                tp_signals = self.take_profit.check_positions(positions)
                for sig in tp_signals:
                    cur.execute(
                        "INSERT INTO audit_log (event_type, severity, source, message, metadata) "
                        "VALUES (%s, %s, %s, %s, %s)",
                        (
                            "take_profit_triggered",
                            "warning",
                            "risk_monitor",
                            sig.reason,
                            f'{{"position_id": "{sig.position_id}", "pool_id": "{sig.pool_id}", "action": "{sig.action}", "amount_pct": {sig.amount_pct}, "pnl_pct": {sig.current_pnl_pct:.2f}}}',
                        ),
                    )
                if tp_signals:
                    logger.info(f"止盈检查: {len(tp_signals)} 个信号触发")
            except Exception as tp_err:
                logger.warning(f"止盈检查异常: {tp_err}")

            # 6. Check exposure
            exposure = self.exposure_manager.check_exposure(positions)
            if exposure.violations:
                for violation in exposure.violations:
                    cur.execute(
                        "INSERT INTO audit_log (event_type, severity, source, message) "
                        "VALUES (%s, %s, %s, %s)",
                        ("exposure_violation", "warning", "risk_monitor", violation),
                    )

            conn.commit()
            cur.close()
            conn.close()

            logger.info(
                f"Risk check complete: {len(stop_loss_alerts)} stop-loss, "
                f"{len(anomalies)} anomalies, {len(exposure.violations)} violations, "
                f"take-profit checked"
            )

        except Exception as e:
            logger.error(f"Risk check failed: {e}")

    async def run_loop(self, interval_seconds: int = 60):
        """Run risk checks in a loop."""
        logger.info(f"Risk monitor starting, interval={interval_seconds}s")
        while True:
            await self.run_risk_check()
            await asyncio.sleep(interval_seconds)
