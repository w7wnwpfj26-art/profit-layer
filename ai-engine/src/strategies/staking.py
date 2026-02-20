"""
Liquid Staking Strategy

Optimizes staking across liquid staking protocols.
"""

from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class StakingOpportunity:
    protocol_id: str
    chain: str
    asset: str
    liquid_token: str
    apr: float
    tvl_usd: float
    risk_score: float
    exit_period_days: float
    recommendation: str


class LiquidStakingStrategy:
    """
    Finds and ranks liquid staking opportunities.
    
    Considers:
    - Base staking APR
    - Additional DeFi composability (use LST in other protocols)
    - Protocol safety and TVL
    - Exit/unbonding period
    """

    def __init__(
        self,
        min_apr: float = 3.0,
        min_tvl_usd: float = 10_000_000,
    ):
        self.min_apr = min_apr
        self.min_tvl = min_tvl_usd

    def find_opportunities(
        self,
        staking_pools: list[dict],
    ) -> list[StakingOpportunity]:
        """Find best liquid staking opportunities."""
        opportunities: list[StakingOpportunity] = []

        for pool in staking_pools:
            apr = pool.get("aprTotal", 0)
            tvl = pool.get("tvlUsd", 0)

            if apr < self.min_apr or tvl < self.min_tvl:
                continue

            # Risk based on TVL
            if tvl > 1_000_000_000:
                risk = 10
                rec = "Tier 1 - high confidence"
            elif tvl > 100_000_000:
                risk = 25
                rec = "Tier 2 - good option"
            else:
                risk = 45
                rec = "Tier 3 - monitor closely"

            opportunities.append(StakingOpportunity(
                protocol_id=pool.get("protocolId", ""),
                chain=pool.get("chain", ""),
                asset=pool.get("symbol", ""),
                liquid_token=pool.get("metadata", {}).get("liquidToken", ""),
                apr=apr,
                tvl_usd=tvl,
                risk_score=risk,
                exit_period_days=0,  # Liquid = instant
                recommendation=rec,
            ))

        opportunities.sort(key=lambda o: o.apr, reverse=True)
        logger.info(f"Found {len(opportunities)} staking opportunities")
        return opportunities
