"""
Exposure Manager - Portfolio Risk Limits

Manages risk exposure across chains, protocols, and asset types.
"""

from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)


@dataclass
class ExposureLimits:
    max_per_chain_pct: float = 50.0
    max_per_protocol_pct: float = 30.0
    max_per_pool_pct: float = 20.0
    max_total_usd: float = 100_000.0
    max_single_tx_usd: float = 10_000.0
    max_daily_tx_usd: float = 50_000.0


@dataclass
class ExposureReport:
    total_exposure_usd: float
    by_chain: dict[str, float]
    by_protocol: dict[str, float]
    by_pool: dict[str, float]
    violations: list[str]
    utilization_pct: float


class ExposureManager:
    """Tracks and enforces portfolio exposure limits."""

    def __init__(self, limits: ExposureLimits | None = None):
        self.limits = limits or ExposureLimits()

    def check_exposure(
        self,
        positions: list[dict],
        proposed_action: dict | None = None,
    ) -> ExposureReport:
        """
        Check current exposure against limits.
        Optionally check if a proposed action would violate limits.
        """
        by_chain: dict[str, float] = {}
        by_protocol: dict[str, float] = {}
        by_pool: dict[str, float] = {}
        total = 0.0

        for pos in positions:
            value = pos.get("valueUsd", 0)
            chain = pos.get("chain", "unknown")
            protocol = pos.get("protocolId", "unknown")
            pool = pos.get("poolId", "unknown")

            by_chain[chain] = by_chain.get(chain, 0) + value
            by_protocol[protocol] = by_protocol.get(protocol, 0) + value
            by_pool[pool] = by_pool.get(pool, 0) + value
            total += value

        # Include proposed action
        if proposed_action:
            value = proposed_action.get("amountUsd", 0)
            chain = proposed_action.get("chain", "unknown")
            protocol = proposed_action.get("protocolId", "unknown")
            pool = proposed_action.get("poolId", "unknown")

            by_chain[chain] = by_chain.get(chain, 0) + value
            by_protocol[protocol] = by_protocol.get(protocol, 0) + value
            by_pool[pool] = by_pool.get(pool, 0) + value
            total += value

        # Check violations
        violations: list[str] = []

        if total > self.limits.max_total_usd:
            violations.append(
                f"Total exposure ${total:,.0f} exceeds limit ${self.limits.max_total_usd:,.0f}"
            )

        for chain, value in by_chain.items():
            pct = (value / total * 100) if total > 0 else 0
            if pct > self.limits.max_per_chain_pct:
                violations.append(
                    f"Chain {chain}: {pct:.1f}% exceeds limit {self.limits.max_per_chain_pct}%"
                )

        for protocol, value in by_protocol.items():
            pct = (value / total * 100) if total > 0 else 0
            if pct > self.limits.max_per_protocol_pct:
                violations.append(
                    f"Protocol {protocol}: {pct:.1f}% exceeds limit {self.limits.max_per_protocol_pct}%"
                )

        for pool, value in by_pool.items():
            pct = (value / total * 100) if total > 0 else 0
            if pct > self.limits.max_per_pool_pct:
                violations.append(
                    f"Pool {pool}: {pct:.1f}% exceeds limit {self.limits.max_per_pool_pct}%"
                )

        utilization = (total / self.limits.max_total_usd * 100) if self.limits.max_total_usd > 0 else 0

        return ExposureReport(
            total_exposure_usd=round(total, 2),
            by_chain=by_chain,
            by_protocol=by_protocol,
            by_pool=by_pool,
            violations=violations,
            utilization_pct=round(utilization, 2),
        )

    def can_execute(
        self,
        positions: list[dict],
        action: dict,
    ) -> tuple[bool, str]:
        """Check if an action is allowed under current exposure limits."""
        report = self.check_exposure(positions, proposed_action=action)

        if report.violations:
            reason = "; ".join(report.violations)
            logger.warning(f"Action blocked: {reason}")
            return False, reason

        # Check single tx limit
        amount = action.get("amountUsd", 0)
        if amount > self.limits.max_single_tx_usd:
            reason = f"Amount ${amount:,.0f} exceeds single tx limit ${self.limits.max_single_tx_usd:,.0f}"
            return False, reason

        return True, "OK"
