"""
Risk Scorer - Protocol and Pool Risk Assessment

Evaluates risk based on multiple factors:
- Protocol maturity and TVL
- Smart contract risk (audit status, age)
- IL risk (token volatility correlation)
- APR sustainability
- Concentration risk
"""

import numpy as np
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class RiskAssessment:
    pool_id: str
    overall_score: float  # 0-100 (lower = safer)
    risk_level: RiskLevel
    components: dict[str, float]
    warnings: list[str]
    recommendations: list[str]


class RiskScorer:
    """
    Multi-factor risk assessment for DeFi pools.
    Score 0-100: 0 = safest, 100 = most risky.
    """

    # Weight for each risk factor
    WEIGHTS = {
        "tvl_risk": 0.15,
        "apr_sustainability": 0.20,
        "il_risk": 0.20,
        "protocol_risk": 0.15,
        "volatility_risk": 0.15,
        "concentration_risk": 0.15,
    }

    def assess(
        self,
        pool_id: str,
        tvl_usd: float,
        apr_total: float,
        apr_base: float,
        apr_reward: float,
        il_risk: str = "no",
        exposure: str = "single",
        stablecoin: bool = False,
        apr_volatility: float = 0,
        apr_mean_30d: float = 0,
        protocol_tvl: float = 0,
    ) -> RiskAssessment:
        """Calculate comprehensive risk score."""
        components = {}
        warnings = []
        recommendations = []

        # 1. TVL Risk (low TVL = higher risk of manipulation)
        if tvl_usd < 100_000:
            components["tvl_risk"] = 90
            warnings.append("Very low TVL - high manipulation risk")
        elif tvl_usd < 500_000:
            components["tvl_risk"] = 60
        elif tvl_usd < 5_000_000:
            components["tvl_risk"] = 30
        elif tvl_usd < 50_000_000:
            components["tvl_risk"] = 15
        else:
            components["tvl_risk"] = 5

        # 2. APR Sustainability
        if apr_total > 100:
            components["apr_sustainability"] = 95
            warnings.append(f"Extremely high APR ({apr_total:.1f}%) - likely unsustainable")
        elif apr_total > 50:
            components["apr_sustainability"] = 70
            warnings.append(f"Very high APR ({apr_total:.1f}%) - monitor closely")
        elif apr_total > 20:
            components["apr_sustainability"] = 40
        elif apr_total > 5:
            components["apr_sustainability"] = 15
        else:
            components["apr_sustainability"] = 5

        # Bonus risk if most APR is from rewards (not fees)
        if apr_total > 0 and apr_reward > 0:
            reward_ratio = apr_reward / apr_total
            if reward_ratio > 0.8:
                components["apr_sustainability"] = min(100,
                    components["apr_sustainability"] + 20)
                warnings.append("80%+ of APR from token rewards - may decline")

        # 3. Impermanent Loss Risk
        if il_risk == "yes" or (not stablecoin and exposure == "multi"):
            components["il_risk"] = 60
            recommendations.append("Consider hedging IL exposure")
        elif stablecoin:
            components["il_risk"] = 5
        else:
            components["il_risk"] = 30

        # 4. Protocol Risk (based on total protocol TVL)
        if protocol_tvl > 1_000_000_000:
            components["protocol_risk"] = 5  # Billion+ TVL = blue chip
        elif protocol_tvl > 100_000_000:
            components["protocol_risk"] = 15
        elif protocol_tvl > 10_000_000:
            components["protocol_risk"] = 35
        else:
            components["protocol_risk"] = 65
            warnings.append("Smaller protocol - higher smart contract risk")

        # 5. Volatility Risk
        if apr_volatility > 0 and apr_mean_30d > 0:
            cv = apr_volatility / apr_mean_30d  # Coefficient of variation
            if cv > 1.0:
                components["volatility_risk"] = 85
                warnings.append("APR is extremely volatile")
            elif cv > 0.5:
                components["volatility_risk"] = 55
            elif cv > 0.2:
                components["volatility_risk"] = 30
            else:
                components["volatility_risk"] = 10
        else:
            components["volatility_risk"] = 40  # Unknown = moderate

        # 6. Concentration Risk (single asset vs diversified)
        if exposure == "single":
            components["concentration_risk"] = 20
        elif exposure == "multi":
            components["concentration_risk"] = 40
        else:
            components["concentration_risk"] = 30

        # ---- Calculate overall score ----
        overall = sum(
            components[k] * self.WEIGHTS[k] for k in self.WEIGHTS
        )

        # Determine risk level
        if overall < 20:
            risk_level = RiskLevel.LOW
        elif overall < 45:
            risk_level = RiskLevel.MEDIUM
        elif overall < 70:
            risk_level = RiskLevel.HIGH
        else:
            risk_level = RiskLevel.CRITICAL
            warnings.append("CRITICAL RISK - manual review recommended")

        # Recommendations
        if not recommendations:
            if risk_level == RiskLevel.LOW:
                recommendations.append("Suitable for larger allocations")
            elif risk_level == RiskLevel.MEDIUM:
                recommendations.append("Moderate allocation recommended")
            elif risk_level == RiskLevel.HIGH:
                recommendations.append("Small allocation only, with stop-loss")

        logger.info(
            f"Risk assessment for {pool_id}: score={overall:.1f}, level={risk_level.value}"
        )

        return RiskAssessment(
            pool_id=pool_id,
            overall_score=round(overall, 2),
            risk_level=risk_level,
            components=components,
            warnings=warnings,
            recommendations=recommendations,
        )
