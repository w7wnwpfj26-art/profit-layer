"""
交易磨损计算器 (Transaction Friction Calculator)

计算 DeFi 操作中的全部隐性成本：
1. Gas 费用 - 链上交易的燃料费
2. DEX 交易手续费 - 协议收取的交易费（如 Uniswap 0.3%）
3. 滑点 (Slippage) - 实际成交价与预期价的偏差
4. 价格冲击 (Price Impact) - 大额交易对价格的影响
5. 跨链桥费 - 资产跨链转移的费用
6. MEV 损耗 - 被矿工/验证者前跑造成的额外成本
7. Token 授权成本 - 首次 approve 的 Gas
8. 复投盈亏平衡 - 计算最优复投频率

核心原则：只有扣除全部磨损后仍然盈利的操作才值得执行。
"""

import math
from dataclasses import dataclass, field
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class OperationType(str, Enum):
    SWAP = "swap"
    ADD_LIQUIDITY = "add_liquidity"
    REMOVE_LIQUIDITY = "remove_liquidity"
    HARVEST = "harvest"
    COMPOUND = "compound"
    STAKE = "stake"
    UNSTAKE = "unstake"
    BRIDGE = "bridge"
    APPROVE = "approve"
    SUPPLY = "supply"        # lending
    WITHDRAW = "withdraw"    # lending
    BORROW = "borrow"
    REPAY = "repay"


# ---- 各链 Gas 成本基准（美元） ----
# 基于 2025-2026 年平均值，实际运行时会从链上实时获取
DEFAULT_GAS_COST_USD: dict[str, dict[str, float]] = {
    "ethereum": {
        "swap": 15.0,
        "add_liquidity": 25.0,
        "remove_liquidity": 20.0,
        "harvest": 12.0,
        "compound": 35.0,    # harvest + swap + add_liq
        "approve": 8.0,
        "supply": 12.0,
        "withdraw": 10.0,
        "borrow": 3.5,
        "repay": 2.5,
        "bridge": 20.0,
        "stake": 10.0,
        "unstake": 10.0,
    },
    "arbitrum": {
        "swap": 0.15,
        "add_liquidity": 0.25,
        "remove_liquidity": 0.20,
        "harvest": 0.12,
        "compound": 0.40,
        "approve": 0.05,
        "supply": 0.12,
        "withdraw": 0.10,
        "borrow": 0.08,
        "repay": 0.06,
        "bridge": 5.0,
        "stake": 0.10,
        "unstake": 0.10,
    },
    "polygon": {
        "swap": 0.02,
        "add_liquidity": 0.04,
        "remove_liquidity": 0.03,
        "harvest": 0.02,
        "compound": 0.06,
        "approve": 0.01,
        "supply": 0.02,
        "withdraw": 0.02,
        "borrow": 0.02,
        "repay": 0.015,
        "bridge": 3.0,
        "stake": 0.02,
        "unstake": 0.02,
    },
    "base": {
        "swap": 0.05,
        "add_liquidity": 0.10,
        "remove_liquidity": 0.08,
        "harvest": 0.05,
        "compound": 0.15,
        "approve": 0.02,
        "supply": 0.05,
        "withdraw": 0.04,
        "borrow": 0.08,
        "repay": 0.06,
        "bridge": 5.0,
        "stake": 0.05,
        "unstake": 0.05,
    },
    "optimism": {
        "swap": 0.05,
        "add_liquidity": 0.10,
        "remove_liquidity": 0.08,
        "harvest": 0.05,
        "compound": 0.15,
        "approve": 0.02,
        "supply": 0.05,
        "withdraw": 0.04,
        "borrow": 0.08,
        "repay": 0.06,
        "bridge": 5.0,
        "stake": 0.05,
        "unstake": 0.05,
    },
    "bsc": {
        "swap": 0.10,
        "add_liquidity": 0.20,
        "remove_liquidity": 0.15,
        "harvest": 0.10,
        "compound": 0.30,
        "approve": 0.05,
        "supply": 0.10,
        "withdraw": 0.08,
        "borrow": 0.15,
        "repay": 0.12,
        "bridge": 3.0,
        "stake": 0.10,
        "unstake": 0.10,
    },
    "avalanche": {
        "swap": 0.08,
        "add_liquidity": 0.15,
        "remove_liquidity": 0.12,
        "harvest": 0.08,
        "compound": 0.25,
        "approve": 0.03,
        "supply": 0.08,
        "withdraw": 0.06,
        "borrow": 0.12,
        "repay": 0.10,
        "bridge": 4.0,
        "stake": 0.08,
        "unstake": 0.08,
    },
    "aptos": {
        "swap": 0.005,
        "add_liquidity": 0.008,
        "remove_liquidity": 0.006,
        "harvest": 0.004,
        "compound": 0.012,
        "approve": 0.002,
        "supply": 0.004,
        "withdraw": 0.004,
        "borrow": 0.005,
        "repay": 0.004,
        "bridge": 2.0,
        "stake": 0.004,
        "unstake": 0.004,
    },
    "solana": {
        "swap": 0.003,
        "add_liquidity": 0.005,
        "remove_liquidity": 0.004,
        "harvest": 0.003,
        "compound": 0.008,
        "approve": 0.001,
        "supply": 0.003,
        "withdraw": 0.003,
        "borrow": 0.003,
        "repay": 0.002,
        "bridge": 2.0,
        "stake": 0.003,
        "unstake": 0.003,
    },
}

# ---- 各协议 DEX 手续费率 ----
PROTOCOL_FEE_RATES: dict[str, float] = {
    "uniswap-v3-500": 0.0005,    # 0.05% fee tier
    "uniswap-v3-3000": 0.003,    # 0.3% fee tier (最常见)
    "uniswap-v3-10000": 0.01,    # 1% fee tier
    "uniswap-v3": 0.003,         # 默认 0.3%
    "sushiswap": 0.003,
    "pancakeswap-v3": 0.0025,
    "curve": 0.0004,             # Curve 稳定币池超低
    "curve-crypto": 0.003,       # Curve crypto 池
    "thala": 0.003,
    "raydium": 0.0025,
    "orca": 0.003,
    "jupiter": 0.0,              # 聚合器本身不收费，但底层 DEX 收
    "lido": 0.0,                 # 质押无交易费
    "marinade": 0.0,
    "aave-v3": 0.0,              # 借贷无交易费
    "compound-v3": 0.0,
}


@dataclass
class FrictionBreakdown:
    """单次操作的磨损明细"""
    operation: str
    chain: str
    protocol: str
    amount_usd: float

    # 各项磨损
    gas_cost_usd: float = 0.0
    dex_fee_usd: float = 0.0
    slippage_usd: float = 0.0
    price_impact_usd: float = 0.0
    bridge_fee_usd: float = 0.0
    mev_cost_usd: float = 0.0
    approval_cost_usd: float = 0.0

    # 汇总
    total_friction_usd: float = 0.0
    friction_pct: float = 0.0       # 磨损占交易金额的百分比
    net_amount_usd: float = 0.0     # 扣除磨损后的实际金额

    warnings: list[str] = field(default_factory=list)


@dataclass
class CompoundOptimal:
    """最优复投频率计算结果"""
    pool_id: str
    position_value_usd: float
    apr_pct: float
    chain: str
    compound_gas_usd: float

    optimal_frequency_hours: float   # 最优复投间隔（小时）
    optimal_frequency_days: float    # 最优复投间隔（天）
    compounds_per_year: int
    gas_cost_per_year_usd: float
    extra_yield_from_compound_usd: float  # 复利比单利多赚的
    net_benefit_usd: float           # 扣除 Gas 后复投的净收益
    is_worth_compounding: bool       # 是否值得复投


@dataclass
class NetYieldEstimate:
    """扣除全部磨损后的真实净收益"""
    pool_id: str
    chain: str
    protocol: str
    gross_apr_pct: float             # 表面年化
    entry_friction_pct: float        # 入场磨损
    exit_friction_pct: float         # 出场磨损
    compound_friction_annual_pct: float  # 年化复投磨损
    annual_gas_drag_pct: float       # 年化 Gas 拖累
    net_apr_pct: float               # 真实净年化
    breakeven_days: int              # 持仓多少天才能回本（覆盖入场+出场磨损）
    min_position_usd: float          # 最低有意义的持仓金额
    verdict: str                     # "profitable" / "marginal" / "unprofitable"


class FrictionCalculator:
    """
    交易磨损计算器

    使用方法：
    1. calculate_friction() - 计算单次操作的磨损
    2. optimal_compound_frequency() - 计算最优复投频率
    3. net_yield_after_friction() - 计算扣除全部磨损后的真实净收益
    4. minimum_profitable_amount() - 计算最低盈利金额
    """

    def __init__(
        self,
        gas_costs: dict[str, dict[str, float]] | None = None,
        fee_rates: dict[str, float] | None = None,
        mev_rate: float = 0.001,  # 默认 0.1% MEV 损耗
    ):
        self.gas_costs = gas_costs or DEFAULT_GAS_COST_USD
        self.fee_rates = fee_rates or PROTOCOL_FEE_RATES
        self.mev_rate = mev_rate

    def calculate_friction(
        self,
        operation: OperationType,
        chain: str,
        protocol: str,
        amount_usd: float,
        pool_tvl_usd: float = 0,
        needs_approval: bool = False,
        is_cross_chain: bool = False,
        custom_slippage_pct: float | None = None,
    ) -> FrictionBreakdown:
        """
        计算单次操作的全部磨损。

        Args:
            operation: 操作类型
            chain: 区块链
            protocol: 协议
            amount_usd: 交易金额（美元）
            pool_tvl_usd: 池子锁仓量（用于计算价格冲击）
            needs_approval: 是否需要首次 Token 授权
            is_cross_chain: 是否涉及跨链
            custom_slippage_pct: 自定义滑点百分比
        """
        fb = FrictionBreakdown(
            operation=operation.value,
            chain=chain,
            protocol=protocol,
            amount_usd=amount_usd,
        )

        # 1. Gas 费
        chain_gas = self.gas_costs.get(chain, self.gas_costs.get("ethereum", {}))
        fb.gas_cost_usd = chain_gas.get(operation.value, chain_gas.get("swap", 1.0))

        # 2. Token 授权 Gas（首次需要）
        if needs_approval:
            fb.approval_cost_usd = chain_gas.get("approve", 0.05)

        # 3. DEX 交易手续费（只有 swap/add_liq/remove_liq 才产生）
        if operation in (
            OperationType.SWAP,
            OperationType.ADD_LIQUIDITY,
            OperationType.REMOVE_LIQUIDITY,
            OperationType.COMPOUND,
        ):
            fee_rate = self.fee_rates.get(protocol, 0.003)
            fb.dex_fee_usd = amount_usd * fee_rate

        # 4. 滑点（按协议类型区分）
        if custom_slippage_pct is not None:
            fb.slippage_usd = amount_usd * custom_slippage_pct / 100
        elif operation in (OperationType.SWAP, OperationType.ADD_LIQUIDITY, OperationType.COMPOUND):
            # 根据金额、池子深度和协议类型估算滑点
            fb.slippage_usd = self._estimate_slippage(amount_usd, pool_tvl_usd, protocol)

        # 5. 价格冲击（大额交易）
        if pool_tvl_usd > 0 and operation in (OperationType.SWAP, OperationType.ADD_LIQUIDITY):
            fb.price_impact_usd = self._estimate_price_impact(amount_usd, pool_tvl_usd)

        # 7. MEV 损耗（只有链上交易有）
        if operation in (OperationType.SWAP, OperationType.ADD_LIQUIDITY, OperationType.COMPOUND):
            if chain in ("ethereum", "bsc", "polygon"):
                # 以太坊主网 MEV 最严重
                mev_rate = self.mev_rate * (2 if chain == "ethereum" else 1)
                fb.mev_cost_usd = amount_usd * mev_rate

        # 7. 跨链桥费
        if is_cross_chain:
            fb.bridge_fee_usd = chain_gas.get("bridge", 5.0)

        # ---- 汇总 ----
        fb.total_friction_usd = (
            fb.gas_cost_usd
            + fb.dex_fee_usd
            + fb.slippage_usd
            + fb.price_impact_usd
            + fb.bridge_fee_usd
            + fb.mev_cost_usd
            + fb.approval_cost_usd
        )

        fb.friction_pct = (fb.total_friction_usd / amount_usd * 100) if amount_usd > 0 else 0
        fb.net_amount_usd = amount_usd - fb.total_friction_usd

        # ---- 警告 ----
        if fb.friction_pct > 5:
            fb.warnings.append(f"磨损过高！占交易金额的 {fb.friction_pct:.2f}%")
        if fb.price_impact_usd > amount_usd * 0.01:
            fb.warnings.append(f"价格冲击严重：${fb.price_impact_usd:.2f}，建议拆分交易")
        if fb.net_amount_usd <= 0:
            fb.warnings.append("交易磨损超过交易金额，这笔交易会亏钱！")

        logger.info(
            f"磨损计算: {operation.value} {chain}/{protocol} "
            f"${amount_usd:.2f} -> 净额 ${fb.net_amount_usd:.2f} "
            f"(磨损 {fb.friction_pct:.3f}%)"
        )

        return fb

    def _estimate_slippage(self, amount_usd: float, pool_tvl_usd: float, protocol: str = "") -> float:
        """
        根据交易金额和池子深度估算滑点，按协议类型区分。
        
        协议类型影响：
        - Curve 稳定币池：滑点极低（使用 StablSwap 算法）
        - Uniswap V3 集中流动性：滑点取决于价格范围宽度
        - 标准 AMM (x*y=k)：中等滑点
        """
        if pool_tvl_usd <= 0:
            return amount_usd * 0.005  # 默认 0.5%

        ratio = amount_usd / pool_tvl_usd
        
        # 根据协议类型调整滑点系数
        protocol_lower = protocol.lower()
        
        if "curve" in protocol_lower:
            # Curve 稳定币池使用 StableSwap，滑点极低
            # 公式：slippage ≈ ratio² / A (A 是放大系数，通常 100-10000)
            if ratio < 0.01:
                slippage_pct = ratio * 100 * 0.1   # 极低滑点
            else:
                slippage_pct = ratio * ratio * 100 * 10  # 大额时滑点上升
        elif "uniswap-v3" in protocol_lower or "uniswap" in protocol_lower:
            # Uniswap V3 集中流动性：假设平均 4 倍资本效率
            # 实际滑点取决于 tick 范围，这里取平均值
            if ratio < 0.001:
                slippage_pct = ratio * 100 * 0.3
            elif ratio < 0.01:
                slippage_pct = ratio * 100 * 0.8
            else:
                slippage_pct = ratio * 100 * 1.5  # 集中流动性大额时滑点更高
        elif "balancer" in protocol_lower:
            # Balancer 加权池，滑点介于 Curve 和 Uniswap 之间
            if ratio < 0.001:
                slippage_pct = ratio * 100 * 0.4
            else:
                slippage_pct = ratio * 100 * 1.0
        else:
            # 标准 AMM (x*y=k)
            if ratio < 0.001:
                slippage_pct = ratio * 100 * 0.5   # 小额：约 0.05%
            elif ratio < 0.01:
                slippage_pct = ratio * 100 * 1.0   # 中额
            else:
                slippage_pct = ratio * 100 * 2.0   # 大额：非线性增加

        return amount_usd * slippage_pct / 100

    def _estimate_price_impact(self, amount_usd: float, pool_tvl_usd: float) -> float:
        """
        价格冲击估算。
        公式：impact ≈ (amount / tvl)^2 * amount（二次方关系）
        """
        if pool_tvl_usd <= 0:
            return 0

        ratio = amount_usd / pool_tvl_usd
        impact_pct = ratio * ratio * 100  # 二次方
        return amount_usd * impact_pct / 100

    def optimal_compound_frequency(
        self,
        pool_id: str,
        position_value_usd: float,
        apr_pct: float,
        chain: str,
    ) -> CompoundOptimal:
        """
        计算最优复投频率。

        数学推导：
        复利收益 = P * (1 + r/n)^n - P   （n = 年复投次数）
        Gas 成本 = n * gas_per_compound

        最优 n 使得 (复利收益 - Gas成本) 最大化。

        对于小额持仓，复投可能完全不值得（Gas 会吃掉全部多余收益）。
        """
        chain_gas = self.gas_costs.get(chain, self.gas_costs.get("ethereum", {}))
        compound_gas = chain_gas.get("compound", 0.15)

        r = apr_pct / 100  # 年利率

        if r <= 0 or position_value_usd <= 0:
            return CompoundOptimal(
                pool_id=pool_id,
                position_value_usd=position_value_usd,
                apr_pct=apr_pct,
                chain=chain,
                compound_gas_usd=compound_gas,
                optimal_frequency_hours=float("inf"),
                optimal_frequency_days=float("inf"),
                compounds_per_year=0,
                gas_cost_per_year_usd=0,
                extra_yield_from_compound_usd=0,
                net_benefit_usd=0,
                is_worth_compounding=False,
            )

        # 搜索最优 n（年复投次数）
        best_n = 0
        best_net = 0.0

        for n in range(1, 8761):  # 最多每小时复投一次
            # 复利收益（相比单利多出的部分）
            compound_yield = position_value_usd * ((1 + r / n) ** n - 1)
            simple_yield = position_value_usd * r
            extra = compound_yield - simple_yield

            # Gas 成本
            gas_total = n * compound_gas

            net = extra - gas_total

            if net > best_net:
                best_net = net
                best_n = n

        if best_n == 0:
            return CompoundOptimal(
                pool_id=pool_id,
                position_value_usd=position_value_usd,
                apr_pct=apr_pct,
                chain=chain,
                compound_gas_usd=compound_gas,
                optimal_frequency_hours=float("inf"),
                optimal_frequency_days=float("inf"),
                compounds_per_year=0,
                gas_cost_per_year_usd=0,
                extra_yield_from_compound_usd=0,
                net_benefit_usd=0,
                is_worth_compounding=False,
            )

        hours = 8760 / best_n  # 8760 = 365 * 24
        compound_yield = position_value_usd * ((1 + r / best_n) ** best_n - 1)
        simple_yield = position_value_usd * r
        extra = compound_yield - simple_yield
        gas_total = best_n * compound_gas

        logger.info(
            f"最优复投: {pool_id} 每 {hours:.1f} 小时一次 "
            f"(年 {best_n} 次), 净收益 ${best_net:.2f}"
        )

        return CompoundOptimal(
            pool_id=pool_id,
            position_value_usd=position_value_usd,
            apr_pct=apr_pct,
            chain=chain,
            compound_gas_usd=compound_gas,
            optimal_frequency_hours=round(hours, 1),
            optimal_frequency_days=round(hours / 24, 1),
            compounds_per_year=best_n,
            gas_cost_per_year_usd=round(gas_total, 2),
            extra_yield_from_compound_usd=round(extra, 2),
            net_benefit_usd=round(best_net, 2),
            is_worth_compounding=best_net > 0,
        )

    def net_yield_after_friction(
        self,
        pool_id: str,
        chain: str,
        protocol: str,
        gross_apr_pct: float,
        position_usd: float,
        pool_tvl_usd: float = 0,
        holding_days: int = 365,
    ) -> NetYieldEstimate:
        """
        计算扣除全部磨损后的真实净年化收益。

        考虑：
        - 入场成本（add_liquidity + approve + 滑点 + 价格冲击 + MEV）
        - 出场成本（remove_liquidity + swap + 滑点 + MEV）
        - 定期复投成本（根据最优频率）
        """
        # 入场磨损
        entry = self.calculate_friction(
            OperationType.ADD_LIQUIDITY, chain, protocol,
            position_usd, pool_tvl_usd, needs_approval=True,
        )
        entry_friction_pct = entry.friction_pct

        # 出场磨损
        exit_fb = self.calculate_friction(
            OperationType.REMOVE_LIQUIDITY, chain, protocol,
            position_usd, pool_tvl_usd,
        )
        exit_friction_pct = exit_fb.friction_pct

        # 复投磨损
        compound_opt = self.optimal_compound_frequency(
            pool_id, position_usd, gross_apr_pct, chain,
        )
        compound_annual_cost = compound_opt.gas_cost_per_year_usd
        compound_friction_annual_pct = (
            (compound_annual_cost / position_usd * 100) if position_usd > 0 else 0
        )

        # 年化 Gas 拖累 = (入场 + 出场) 分摊到持有期 + 复投成本
        entry_exit_annual = (
            (entry.total_friction_usd + exit_fb.total_friction_usd)
            / position_usd * 100 * 365 / max(holding_days, 1)
        ) if position_usd > 0 else 0
        annual_gas_drag_pct = entry_exit_annual + compound_friction_annual_pct

        # 真实净年化
        net_apr = gross_apr_pct - annual_gas_drag_pct

        # 回本天数：需要多少天的收益才能覆盖入场+出场磨损
        daily_gross_yield = position_usd * gross_apr_pct / 100 / 365
        total_entry_exit = entry.total_friction_usd + exit_fb.total_friction_usd
        breakeven_days = (
            math.ceil(total_entry_exit / daily_gross_yield)
            if daily_gross_yield > 0 else 9999
        )

        # 最低有意义持仓金额（磨损 < 年收益的 10%）
        # gas_cost < 0.1 * position * apr / 100
        annual_gas_fixed = (
            entry.gas_cost_usd + entry.approval_cost_usd
            + exit_fb.gas_cost_usd + compound_annual_cost
        )
        min_position = (
            annual_gas_fixed / (0.1 * gross_apr_pct / 100)
            if gross_apr_pct > 0 else float("inf")
        )

        # 判定
        if net_apr >= gross_apr_pct * 0.7:
            verdict = "profitable"      # 磨损 < 30%，值得做
        elif net_apr > 0:
            verdict = "marginal"        # 有微利，但磨损占比大
        else:
            verdict = "unprofitable"    # 净亏损

        logger.info(
            f"净收益: {pool_id} 表面APR={gross_apr_pct:.1f}% -> "
            f"净APR={net_apr:.2f}% (磨损拖累 {annual_gas_drag_pct:.2f}%), "
            f"回本 {breakeven_days} 天, 最低持仓 ${min_position:.0f}"
        )

        return NetYieldEstimate(
            pool_id=pool_id,
            chain=chain,
            protocol=protocol,
            gross_apr_pct=round(gross_apr_pct, 4),
            entry_friction_pct=round(entry_friction_pct, 4),
            exit_friction_pct=round(exit_friction_pct, 4),
            compound_friction_annual_pct=round(compound_friction_annual_pct, 4),
            annual_gas_drag_pct=round(annual_gas_drag_pct, 4),
            net_apr_pct=round(net_apr, 4),
            breakeven_days=breakeven_days,
            min_position_usd=round(min_position, 2),
            verdict=verdict,
        )

    def minimum_profitable_amount(
        self,
        chain: str,
        protocol: str,
        apr_pct: float,
        holding_days: int = 30,
    ) -> float:
        """
        计算在给定链/协议/年化下，最低多少钱才能覆盖交易磨损。

        公式：min_amount = total_fixed_gas / (apr * holding_days / 365 - variable_rate)
        """
        chain_gas = self.gas_costs.get(chain, self.gas_costs.get("ethereum", {}))

        # 固定成本：入场 + 出场 + 授权
        fixed_cost = (
            chain_gas.get("add_liquidity", 0.1)
            + chain_gas.get("remove_liquidity", 0.08)
            + chain_gas.get("approve", 0.02)
        )

        # 变动成本率：DEX手续费 + 滑点 + MEV
        fee_rate = self.fee_rates.get(protocol, 0.003)
        variable_rate = fee_rate + 0.001 + self.mev_rate  # 手续费 + 滑点 + MEV

        # 收益率（持有期内）
        yield_rate = apr_pct / 100 * holding_days / 365

        net_rate = yield_rate - variable_rate * 2  # 入场+出场各扣一次

        if net_rate <= 0:
            return float("inf")  # 年化太低，无论多少钱都不够

        min_amount = fixed_cost / net_rate

        logger.info(
            f"最低盈利金额: {chain}/{protocol} APR={apr_pct:.1f}% "
            f"持有{holding_days}天 -> 最少 ${min_amount:.2f}"
        )

        return round(min_amount, 2)
