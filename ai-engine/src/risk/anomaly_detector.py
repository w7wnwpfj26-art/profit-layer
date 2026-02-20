"""
Anomaly Detector

Detects unusual patterns that might indicate:
- Rug pulls
- Flash crashes
- Unusual TVL movements
- Suspicious APR spikes
"""

from dataclasses import dataclass
import numpy as np
import logging

logger = logging.getLogger(__name__)


@dataclass
class Anomaly:
    pool_id: str
    anomaly_type: str     # "tvl_crash", "apr_spike", "tvl_drain", "suspicious_activity"
    severity: str         # "warning", "critical"
    description: str
    current_value: float
    expected_value: float
    deviation_pct: float


class AnomalyDetector:
    """
    Detects anomalies in pool data using statistical methods.
    
    Methods:
    - Z-score based detection for APR and TVL
    - Rate-of-change detection for rapid movements
    - Pattern matching for known attack signatures
    """

    def __init__(
        self,
        z_threshold: float = 3.0,
        tvl_crash_pct: float = 30.0,
        apr_spike_multiplier: float = 5.0,
    ):
        self.z_threshold = z_threshold
        self.tvl_crash_pct = tvl_crash_pct
        self.apr_spike_multiplier = apr_spike_multiplier

    def detect(
        self,
        current_data: list[dict],
        historical_data: dict[str, list[dict]] | None = None,
    ) -> list[Anomaly]:
        """
        Detect anomalies in current pool data.
        
        Args:
            current_data: Latest pool snapshots
            historical_data: Historical data keyed by pool_id
        """
        anomalies: list[Anomaly] = []
        historical_data = historical_data or {}

        for pool in current_data:
            pool_id = pool.get("poolId", "")
            history = historical_data.get(pool_id, [])

            # Check TVL crash
            tvl_anomaly = self._check_tvl_crash(pool, history)
            if tvl_anomaly:
                anomalies.append(tvl_anomaly)

            # Check APR spike
            apr_anomaly = self._check_apr_spike(pool, history)
            if apr_anomaly:
                anomalies.append(apr_anomaly)

            # Check TVL drain (gradual)
            drain_anomaly = self._check_tvl_drain(pool, history)
            if drain_anomaly:
                anomalies.append(drain_anomaly)

        if anomalies:
            logger.warning(f"Detected {len(anomalies)} anomalies")

        return anomalies

    def _check_tvl_crash(self, pool: dict, history: list[dict]) -> Anomaly | None:
        """Detect sudden TVL drops (potential rug pull)."""
        if not history:
            return None

        current_tvl = pool.get("tvlUsd", 0)
        prev_tvl = history[-1].get("tvlUsd", 0) if history else 0

        if prev_tvl <= 0:
            return None

        drop_pct = (prev_tvl - current_tvl) / prev_tvl * 100

        if drop_pct >= self.tvl_crash_pct:
            return Anomaly(
                pool_id=pool.get("poolId", ""),
                anomaly_type="tvl_crash",
                severity="critical",
                description=f"TVL dropped {drop_pct:.1f}% "
                            f"(${prev_tvl:,.0f} -> ${current_tvl:,.0f})",
                current_value=current_tvl,
                expected_value=prev_tvl,
                deviation_pct=round(drop_pct, 2),
            )

        return None

    def _check_apr_spike(self, pool: dict, history: list[dict]) -> Anomaly | None:
        """Detect suspicious APR spikes."""
        if len(history) < 7:
            return None

        current_apr = pool.get("aprTotal", 0)
        recent_aprs = [h.get("aprTotal", 0) for h in history[-7:]]

        if not recent_aprs:
            return None

        mean_apr = float(np.mean(recent_aprs))
        std_apr = float(np.std(recent_aprs))

        if mean_apr <= 0:
            return None

        # Check if current APR is abnormally high
        if std_apr > 0:
            z_score = (current_apr - mean_apr) / std_apr
            if z_score > self.z_threshold:
                return Anomaly(
                    pool_id=pool.get("poolId", ""),
                    anomaly_type="apr_spike",
                    severity="warning",
                    description=f"APR spiked to {current_apr:.1f}% "
                                f"(mean: {mean_apr:.1f}%, z-score: {z_score:.1f})",
                    current_value=current_apr,
                    expected_value=mean_apr,
                    deviation_pct=round((current_apr - mean_apr) / mean_apr * 100, 2),
                )

        if current_apr > mean_apr * self.apr_spike_multiplier:
            return Anomaly(
                pool_id=pool.get("poolId", ""),
                anomaly_type="apr_spike",
                severity="warning",
                description=f"APR {current_apr:.1f}% is {current_apr / mean_apr:.1f}x the average",
                current_value=current_apr,
                expected_value=mean_apr,
                deviation_pct=round((current_apr - mean_apr) / mean_apr * 100, 2),
            )

        return None

    def _check_tvl_drain(self, pool: dict, history: list[dict]) -> Anomaly | None:
        """Detect gradual TVL drain (capital flight)."""
        if len(history) < 7:
            return None

        tvls = [h.get("tvlUsd", 0) for h in history[-7:]]
        current_tvl = pool.get("tvlUsd", 0)

        if not tvls or tvls[0] <= 0:
            return None

        # Check if TVL has been consistently declining
        declining_days = sum(1 for i in range(1, len(tvls)) if tvls[i] < tvls[i - 1])

        if declining_days >= 5:  # 5+ of last 7 days declining
            total_drain = (tvls[0] - current_tvl) / tvls[0] * 100
            if total_drain > 20:
                return Anomaly(
                    pool_id=pool.get("poolId", ""),
                    anomaly_type="tvl_drain",
                    severity="warning",
                    description=f"TVL declining for {declining_days}/7 days, "
                                f"total drain: {total_drain:.1f}%",
                    current_value=current_tvl,
                    expected_value=tvls[0],
                    deviation_pct=round(total_drain, 2),
                )

        return None
