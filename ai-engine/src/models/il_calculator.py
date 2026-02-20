"""
Impermanent Loss Calculator

Calculates potential impermanent loss for LP positions
based on token price movements.
"""

import numpy as np
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class ILResult:
    price_change_pct: float
    il_pct: float           # IL as percentage (negative = loss)
    hold_value: float       # Value if tokens were just held
    lp_value: float         # Value in LP position
    loss_usd: float         # Actual USD loss from IL
    break_even_apr: float   # Minimum APR needed to offset IL


class ILCalculator:
    """
    Calculate impermanent loss for AMM liquidity positions.
    
    For a constant-product AMM (x*y=k):
    IL = 2*sqrt(r) / (1+r) - 1
    where r = new_price / old_price
    """

    @staticmethod
    def calculate(
        initial_price_ratio: float,
        current_price_ratio: float,
        initial_value_usd: float,
        days_in_pool: int = 1,
    ) -> ILResult:
        """
        Calculate IL for a 50/50 pool.
        
        Args:
            initial_price_ratio: Price of token0/token1 at entry
            current_price_ratio: Current price of token0/token1
            initial_value_usd: Initial USD value deposited
            days_in_pool: Days the position has been open
        """
        if initial_price_ratio <= 0:
            raise ValueError("Initial price ratio must be positive")

        r = current_price_ratio / initial_price_ratio
        
        # IL formula: 2*sqrt(r) / (1+r) - 1
        il_factor = 2 * np.sqrt(r) / (1 + r) - 1
        il_pct = float(il_factor * 100)

        # Value calculations
        hold_value = initial_value_usd * (1 + r) / 2  # Simple hold
        lp_value = initial_value_usd * (1 + il_factor)
        loss_usd = lp_value - hold_value

        # Break-even APR: what APR would offset this IL over the holding period
        if days_in_pool > 0 and il_factor < 0:
            annual_il = il_factor * 365 / days_in_pool
            break_even_apr = abs(annual_il) * 100
        else:
            break_even_apr = 0.0

        price_change_pct = (r - 1) * 100

        return ILResult(
            price_change_pct=round(price_change_pct, 4),
            il_pct=round(il_pct, 4),
            hold_value=round(hold_value, 2),
            lp_value=round(lp_value, 2),
            loss_usd=round(loss_usd, 2),
            break_even_apr=round(break_even_apr, 4),
        )

    @staticmethod
    def calculate_concentrated(
        initial_price: float,
        current_price: float,
        lower_price: float,
        upper_price: float,
        initial_value_usd: float,
        days_in_pool: int = 1,
    ) -> ILResult:
        """
        Calculate IL for concentrated liquidity (Uniswap V3 style).
        
        Concentrated IL is amplified relative to the range width.
        """
        if current_price < lower_price or current_price > upper_price:
            # Position is out of range - max IL
            r = current_price / initial_price
            il_pct = -100.0 if r > 2 or r < 0.5 else -50.0

            return ILResult(
                price_change_pct=round((r - 1) * 100, 4),
                il_pct=round(il_pct, 4),
                hold_value=initial_value_usd * (1 + r) / 2,
                lp_value=initial_value_usd * (1 + il_pct / 100),
                loss_usd=initial_value_usd * il_pct / 100,
                break_even_apr=999.0,
            )

        # For in-range: IL is amplified
        range_width = upper_price / lower_price
        amplification = np.sqrt(range_width) / (np.sqrt(range_width) - 1)

        r = current_price / initial_price
        base_il = 2 * np.sqrt(r) / (1 + r) - 1
        concentrated_il = base_il * amplification

        il_pct = float(concentrated_il * 100)
        hold_value = initial_value_usd * (1 + r) / 2
        lp_value = initial_value_usd * (1 + concentrated_il)

        if days_in_pool > 0 and concentrated_il < 0:
            break_even_apr = abs(concentrated_il * 365 / days_in_pool) * 100
        else:
            break_even_apr = 0.0

        return ILResult(
            price_change_pct=round((r - 1) * 100, 4),
            il_pct=round(il_pct, 4),
            hold_value=round(hold_value, 2),
            lp_value=round(lp_value, 2),
            loss_usd=round(lp_value - hold_value, 2),
            break_even_apr=round(break_even_apr, 4),
        )
