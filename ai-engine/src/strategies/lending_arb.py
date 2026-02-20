"""
Lending Arbitrage Strategy

Finds profit opportunities across lending protocols:
- Borrow cheap on one protocol, lend expensive on another
- Flash loan arbitrage
- Interest rate differential farming
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)


@dataclass
class LendingOpportunity:
    borrow_protocol: str
    borrow_chain: str
    borrow_asset: str
    borrow_rate: float       # Annual %
    supply_protocol: str
    supply_chain: str
    supply_asset: str
    supply_rate: float       # Annual %
    spread: float            # supply_rate - borrow_rate
    estimated_profit_usd: float
    risk_level: str
    cross_chain: bool


class LendingArbStrategy:
    """
    Identifies lending arbitrage opportunities across protocols and chains.
    """

    def __init__(
        self,
        min_spread_pct: float = 2.0,     # Minimum rate differential
        min_profit_usd: float = 50.0,    # Minimum estimated daily profit
        max_leverage: float = 3.0,       # Maximum leverage ratio
    ):
        self.min_spread = min_spread_pct
        self.min_profit = min_profit_usd
        self.max_leverage = max_leverage

    def find_opportunities(
        self,
        lending_pools: list[dict],
        capital_usd: float,
    ) -> list[LendingOpportunity]:
        """
        Find lending arbitrage opportunities.
        
        Args:
            lending_pools: Lending pool data from scanner
            capital_usd: Available capital
        """
        # Group by asset type (matching supply/borrow pairs)
        by_asset: dict[str, list[dict]] = {}
        for pool in lending_pools:
            symbol = pool.get("symbol", "").upper()
            # Normalize common token names
            for base in ["USDC", "USDT", "DAI", "ETH", "WETH", "BTC", "WBTC"]:
                if base in symbol:
                    by_asset.setdefault(base, []).append(pool)
                    break

        opportunities: list[LendingOpportunity] = []

        for asset, pools in by_asset.items():
            # Find lowest borrow rate and highest supply rate
            supply_pools = sorted(pools, key=lambda p: p.get("aprBase", 0), reverse=True)
            borrow_pools = sorted(pools, key=lambda p: p.get("aprBase", 0))

            for supply in supply_pools[:3]:
                for borrow in borrow_pools[:3]:
                    if supply["poolId"] == borrow["poolId"]:
                        continue

                    supply_rate = supply.get("aprBase", 0)
                    borrow_rate = borrow.get("aprBase", 0)
                    spread = supply_rate - borrow_rate

                    if spread < self.min_spread:
                        continue

                    cross_chain = supply.get("chain") != borrow.get("chain")
                    daily_profit = capital_usd * spread / 100 / 365

                    if daily_profit < self.min_profit / 365:
                        continue

                    opportunities.append(LendingOpportunity(
                        borrow_protocol=borrow.get("protocolId", ""),
                        borrow_chain=borrow.get("chain", ""),
                        borrow_asset=asset,
                        borrow_rate=borrow_rate,
                        supply_protocol=supply.get("protocolId", ""),
                        supply_chain=supply.get("chain", ""),
                        supply_asset=asset,
                        supply_rate=supply_rate,
                        spread=round(spread, 4),
                        estimated_profit_usd=round(daily_profit * 365, 2),
                        risk_level="medium" if not cross_chain else "high",
                        cross_chain=cross_chain,
                    ))

        opportunities.sort(key=lambda o: o.spread, reverse=True)

        logger.info(f"Found {len(opportunities)} lending arb opportunities")
        return opportunities
