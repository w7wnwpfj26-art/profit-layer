"""
积分/空投挖矿策略 (Points & Airdrop Farming)

2026 年大量协议使用积分系统激励用户:
- EigenLayer Points → 空投预期
- Blast Points/Gold → 空投预期
- Hyperliquid Points → 已空投
- LayerZero, zkSync, Scroll 等 L2 积分

策略: 系统化追踪和参与积分活动，最大化空投收益
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


@dataclass
class PointsProgram:
    """积分项目"""
    protocol: str
    chain: str
    program_name: str
    points_type: str  # "points", "gold", "xp", "miles"
    estimated_airdrop_value: float  # 预估空投价值 (USD per $1000 deposited)
    tvl_usd: float
    min_deposit_usd: float
    multiplier: float  # 积分倍数
    end_date: str | None  # 活动结束日期
    risk_level: str  # "low", "medium", "high"
    actions: list[str]  # 获取积分的操作 ["deposit", "trade", "refer", "hold"]
    status: str  # "active", "ending_soon", "ended", "snapshot_pending"


@dataclass
class PointsFarmingSignal:
    """积分挖矿信号"""
    action: str  # "enter", "increase", "exit", "claim"
    protocol: str
    chain: str
    amount_usd: float
    reason: str
    estimated_value: float  # 预估空投价值
    urgency: str  # "low", "medium", "high"
    confidence: float


class PointsFarmingStrategy:
    """
    积分/空投挖矿策略

    核心逻辑:
    1. 追踪活跃的积分项目
    2. 评估空投预期价值 (基于 TVL, 融资额, 代币经济学)
    3. 优化资金分配: 在多个积分项目间分配
    4. 监控快照和空投时间线
    """

    # 已知积分项目数据库 (2026 年活跃项目)
    KNOWN_PROGRAMS: list[dict] = [
        {
            "protocol": "eigenlayer", "chain": "ethereum",
            "program_name": "EigenLayer Season 3",
            "points_type": "points", "estimated_value": 80,
            "min_deposit": 100, "multiplier": 1.0,
            "risk": "medium", "actions": ["restake"],
            "status": "active",
        },
        {
            "protocol": "ethena", "chain": "ethereum",
            "program_name": "Ethena Sats Campaign",
            "points_type": "sats", "estimated_value": 60,
            "min_deposit": 100, "multiplier": 20.0,
            "risk": "medium", "actions": ["hold_USDe", "provide_liquidity"],
            "status": "active",
        },
        {
            "protocol": "scroll", "chain": "scroll",
            "program_name": "Scroll Marks",
            "points_type": "marks", "estimated_value": 40,
            "min_deposit": 50, "multiplier": 1.0,
            "risk": "medium", "actions": ["bridge", "trade", "provide_liquidity"],
            "status": "active",
        },
        {
            "protocol": "linea", "chain": "linea",
            "program_name": "Linea Voyage",
            "points_type": "xp", "estimated_value": 35,
            "min_deposit": 50, "multiplier": 1.0,
            "risk": "medium", "actions": ["bridge", "trade", "deploy"],
            "status": "active",
        },
        {
            "protocol": "berachain", "chain": "berachain",
            "program_name": "Berachain BGT",
            "points_type": "bgt", "estimated_value": 100,
            "min_deposit": 100, "multiplier": 1.0,
            "risk": "high", "actions": ["provide_liquidity", "stake"],
            "status": "active",
        },
    ]

    def __init__(
        self,
        max_allocation_per_program_pct: float = 15.0,
        min_estimated_value: float = 20.0,  # 最低预估空投价值
        max_risk: str = "high",
    ):
        self.max_alloc_pct = max_allocation_per_program_pct
        self.min_value = min_estimated_value
        self.max_risk = max_risk

    def get_active_programs(self) -> list[PointsProgram]:
        """获取活跃的积分项目"""
        programs = []
        for p in self.KNOWN_PROGRAMS:
            if p["status"] not in ("active", "ending_soon"):
                continue
            if p["estimated_value"] < self.min_value:
                continue

            programs.append(PointsProgram(
                protocol=p["protocol"],
                chain=p["chain"],
                program_name=p["program_name"],
                points_type=p["points_type"],
                estimated_airdrop_value=p["estimated_value"],
                tvl_usd=0,  # 从链上获取
                min_deposit_usd=p["min_deposit"],
                multiplier=p["multiplier"],
                end_date=p.get("end_date"),
                risk_level=p["risk"],
                actions=p["actions"],
                status=p["status"],
            ))

        programs.sort(key=lambda p: p.estimated_airdrop_value, reverse=True)
        return programs

    def generate_signals(
        self,
        capital_usd: float,
        current_positions: list[dict] | None = None,
    ) -> list[PointsFarmingSignal]:
        """生成积分挖矿信号"""
        programs = self.get_active_programs()
        current_positions = current_positions or []
        signals = []

        # 已参与的协议
        active_protocols = {p.get("protocolId", "") for p in current_positions}

        max_per_program = capital_usd * self.max_alloc_pct / 100

        for program in programs:
            if program.protocol in active_protocols:
                continue

            amount = min(max_per_program, capital_usd * 0.1)
            if amount < program.min_deposit_usd:
                continue

            urgency = "high" if program.status == "ending_soon" else "medium"

            signals.append(PointsFarmingSignal(
                action="enter",
                protocol=program.protocol,
                chain=program.chain,
                amount_usd=amount,
                reason=(
                    f"{program.program_name}: 预估空投价值 ${program.estimated_airdrop_value}/k, "
                    f"倍数 {program.multiplier}x, 操作 {', '.join(program.actions)}"
                ),
                estimated_value=amount / 1000 * program.estimated_airdrop_value,
                urgency=urgency,
                confidence=0.5,  # 空投不确定性高
            ))

        logger.info(f"Points farming: {len(signals)} opportunities from {len(programs)} programs")
        return signals
