"""
Vault 聚合策略 (Vault Strategy)

集成 Yearn V3 / Beefy / Sommelier 等 Vault 协议:
- 利用社区策略师的专业策略
- 自动复投 + 风险管理
- 多层收益叠加

优势: 不需要自己管理底层策略，由 Vault 协议的策略师管理
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


@dataclass
class VaultOpportunity:
    """Vault 机会"""
    vault_id: str
    protocol: str       # "yearn-v3", "beefy", "sommelier", "morpho"
    chain: str
    asset: str           # 存入资产
    strategy_name: str   # Vault 策略名称
    apr: float
    tvl_usd: float
    risk_score: float    # 0-100
    management_fee: float  # 管理费 %
    performance_fee: float  # 绩效费 %
    net_apr: float       # 扣费后净 APR
    auto_compound: bool
    audit_status: str
    recommendation: str


class VaultStrategy:
    """
    Vault 聚合策略

    核心逻辑:
    1. 扫描各 Vault 协议的可用 Vault
    2. 评估: APR, TVL, 费用, 审计状态
    3. 计算扣费后净收益
    4. 推荐最优 Vault 组合
    """

    # 已知 Vault 协议
    VAULT_PROTOCOLS = {
        "yearn-v3": {"fee_mgmt": 0, "fee_perf": 10, "audit": "audited", "chains": ["ethereum", "arbitrum", "base", "optimism", "polygon"]},
        "beefy": {"fee_mgmt": 0, "fee_perf": 4.5, "audit": "audited", "chains": ["ethereum", "arbitrum", "bsc", "polygon", "optimism", "base", "avalanche"]},
        "sommelier": {"fee_mgmt": 1, "fee_perf": 10, "audit": "audited", "chains": ["ethereum", "arbitrum"]},
        "morpho": {"fee_mgmt": 0, "fee_perf": 0, "audit": "audited", "chains": ["ethereum", "base"]},
    }

    def __init__(
        self,
        min_apr: float = 3.0,
        min_tvl_usd: float = 1_000_000,
        max_risk_score: float = 50,
    ):
        self.min_apr = min_apr
        self.min_tvl = min_tvl_usd
        self.max_risk = max_risk_score

    def find_opportunities(self, pools: list[dict]) -> list[VaultOpportunity]:
        """从池子数据中筛选 Vault 机会"""
        opportunities = []

        for pool in pools:
            protocol = pool.get("protocolId", "").lower()
            vault_info = None

            for vault_proto, info in self.VAULT_PROTOCOLS.items():
                if vault_proto in protocol or protocol in vault_proto:
                    vault_info = info
                    break

            if not vault_info:
                continue

            apr = pool.get("aprTotal", 0)
            tvl = pool.get("tvlUsd", 0)

            if apr < self.min_apr or tvl < self.min_tvl:
                continue

            # 计算扣费后净 APR
            mgmt_fee = vault_info["fee_mgmt"]
            perf_fee = vault_info["fee_perf"]
            net_apr = apr * (1 - perf_fee / 100) - mgmt_fee

            if net_apr <= 0:
                continue

            # 风险评分
            risk = self._assess_vault_risk(tvl, vault_info["audit"], apr)
            if risk > self.max_risk:
                continue

            # 推荐等级
            if net_apr > 15 and risk < 25:
                rec = "强烈推荐 - 高收益低风险"
            elif net_apr > 8:
                rec = "推荐 - 收益风险比良好"
            else:
                rec = "可选 - 稳健收益"

            opportunities.append(VaultOpportunity(
                vault_id=pool.get("poolId", ""),
                protocol=protocol,
                chain=pool.get("chain", ""),
                asset=pool.get("symbol", ""),
                strategy_name=pool.get("metadata", {}).get("strategy", "auto"),
                apr=apr,
                tvl_usd=tvl,
                risk_score=risk,
                management_fee=mgmt_fee,
                performance_fee=perf_fee,
                net_apr=round(net_apr, 2),
                auto_compound=True,
                audit_status=vault_info["audit"],
                recommendation=rec,
            ))

        opportunities.sort(key=lambda o: o.net_apr, reverse=True)
        logger.info(f"Found {len(opportunities)} vault opportunities")
        return opportunities

    def _assess_vault_risk(self, tvl: float, audit: str, apr: float) -> float:
        """评估 Vault 风险"""
        score = 0
        # TVL
        if tvl > 100_000_000:
            score += 5
        elif tvl > 10_000_000:
            score += 15
        else:
            score += 30
        # 审计
        if audit == "audited":
            score += 5
        else:
            score += 25
        # APR 可持续性
        if apr > 50:
            score += 25
        elif apr > 20:
            score += 10
        else:
            score += 5
        return score
