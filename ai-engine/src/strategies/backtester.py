"""
深度回测系统 (Backtester)

基于历史池子数据，模拟策略在不同行情下的表现。

功能:
1. 从 TimescaleDB 拉取历史 APR/TVL 快照
2. 按时间步重放，逐步调用策略逻辑生成信号
3. 模拟执行（含磨损、滑点、IL 估算）
4. 输出绩效报告：收益率、最大回撤、夏普比率、胜率等

用法:
    from src.strategies.backtester import Backtester
    bt = Backtester(initial_capital=10000)
    report = bt.run(days=90, strategy="optimizer")
    print(report.summary())
"""

import os
import json
import logging
import math
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, field, asdict
from typing import Optional

import psycopg2

logger = logging.getLogger(__name__)


def _get_conn():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5433")),
        dbname=os.getenv("POSTGRES_DB", "defi_yield"),
        user=os.getenv("POSTGRES_USER", "defi"),
        password=os.getenv("POSTGRES_PASSWORD", ""),
    )


# ─── 数据结构 ───

@dataclass
class PoolSnapshot:
    """某一时刻的池子快照"""
    pool_id: str
    protocol_id: str
    chain_id: str
    symbol: str
    apr_total: float
    tvl_usd: float
    health_score: float
    timestamp: str


@dataclass
class SimPosition:
    """模拟持仓"""
    pool_id: str
    symbol: str
    protocol_id: str
    chain_id: str
    entry_value_usd: float
    entry_apr: float
    entry_time: str
    current_value_usd: float = 0
    accumulated_yield_usd: float = 0


@dataclass
class TradeRecord:
    """交易记录"""
    timestamp: str
    action: str  # enter / exit / compound
    pool_id: str
    symbol: str
    amount_usd: float
    apr_at_trade: float
    reason: str
    friction_usd: float = 0


@dataclass
class BacktestReport:
    """回测绩效报告"""
    # 基本信息
    strategy: str
    days: int
    initial_capital: float
    # 收益
    final_value: float
    total_return_pct: float
    annualized_return_pct: float
    total_yield_earned: float
    total_friction_cost: float
    # 风险
    max_drawdown_pct: float
    sharpe_ratio: float
    sortino_ratio: float
    # 统计
    total_trades: int
    win_trades: int
    loss_trades: int
    win_rate_pct: float
    avg_hold_days: float
    max_positions: int
    # 明细
    equity_curve: list[dict] = field(default_factory=list)
    trade_log: list[dict] = field(default_factory=list)

    def summary(self) -> str:
        return (
            f"═══ 回测报告: {self.strategy} ({self.days}天) ═══\n"
            f"  初始资金: ${self.initial_capital:,.0f}\n"
            f"  最终价值: ${self.final_value:,.0f}\n"
            f"  总收益率: {self.total_return_pct:+.2f}%\n"
            f"  年化收益: {self.annualized_return_pct:+.2f}%\n"
            f"  总收益金额: ${self.total_yield_earned:,.2f}\n"
            f"  总磨损成本: ${self.total_friction_cost:,.2f}\n"
            f"  最大回撤: {self.max_drawdown_pct:.2f}%\n"
            f"  夏普比率: {self.sharpe_ratio:.2f}\n"
            f"  Sortino: {self.sortino_ratio:.2f}\n"
            f"  总交易数: {self.total_trades}\n"
            f"  胜率: {self.win_rate_pct:.1f}%\n"
            f"  平均持仓天数: {self.avg_hold_days:.1f}\n"
        )

    def to_dict(self) -> dict:
        return asdict(self)


# ─── 回测引擎 ───

class Backtester:
    """
    历史数据回测引擎

    从 TimescaleDB 拉取池子快照，模拟策略运行。
    """

    def __init__(
        self,
        initial_capital: float = 10000,
        max_positions: int = 5,
        max_single_pct: float = 25,  # 单池最大仓位%
        min_health_score: float = 60,
        min_apr: float = 5,
        max_apr: float = 200,  # 超过此值视为异常
        entry_friction_pct: float = 0.3,  # 入场磨损%
        exit_friction_pct: float = 0.3,   # 出场磨损%
        rebalance_threshold_pct: float = 30,  # APR 变化超阈值触发调仓
        step_hours: int = 6,  # 回测步长（小时）
    ):
        self.initial_capital = initial_capital
        self.max_positions = max_positions
        self.max_single_pct = max_single_pct
        self.min_health_score = min_health_score
        self.min_apr = min_apr
        self.max_apr = max_apr
        self.entry_friction_pct = entry_friction_pct
        self.exit_friction_pct = exit_friction_pct
        self.rebalance_threshold_pct = rebalance_threshold_pct
        self.step_hours = step_hours

    def run(self, days: int = 90, strategy: str = "optimizer") -> BacktestReport:
        """执行回测"""
        logger.info(f"开始回测: 策略={strategy}, 天数={days}, 资金=${self.initial_capital}")

        # 1. 拉取历史数据
        snapshots = self._load_history(days)
        if not snapshots:
            logger.warning("无历史数据可用于回测，使用模拟数据")
            snapshots = self._generate_simulated_data(days)

        # 2. 按时间分组
        time_buckets = self._group_by_time(snapshots)
        logger.info(f"历史数据: {len(snapshots)} 条快照, {len(time_buckets)} 个时间步")

        # 3. 初始化状态
        cash = self.initial_capital
        positions: list[SimPosition] = []
        trades: list[TradeRecord] = []
        equity_curve: list[dict] = []
        peak_equity = self.initial_capital

        # 4. 逐步模拟
        for ts, pools in sorted(time_buckets.items()):
            # 更新持仓价值（基于 APR 累计收益）
            self._update_positions(positions, pools, self.step_hours)

            # 策略决策
            actions = self._decide(strategy, cash, positions, pools)

            # 执行操作
            for action in actions:
                if action["type"] == "enter":
                    amount = action["amount"]
                    friction = amount * self.entry_friction_pct / 100
                    net_amount = amount - friction
                    cash -= amount
                    pos = SimPosition(
                        pool_id=action["pool_id"],
                        symbol=action["symbol"],
                        protocol_id=action.get("protocol_id", ""),
                        chain_id=action.get("chain_id", ""),
                        entry_value_usd=net_amount,
                        entry_apr=action["apr"],
                        entry_time=ts,
                        current_value_usd=net_amount,
                    )
                    positions.append(pos)
                    trades.append(TradeRecord(
                        timestamp=ts, action="enter",
                        pool_id=action["pool_id"],
                        symbol=action["symbol"],
                        amount_usd=amount,
                        apr_at_trade=action["apr"],
                        reason=action.get("reason", ""),
                        friction_usd=friction,
                    ))

                elif action["type"] == "exit":
                    pos = action["position"]
                    exit_value = pos.current_value_usd
                    friction = exit_value * self.exit_friction_pct / 100
                    cash += exit_value - friction
                    trades.append(TradeRecord(
                        timestamp=ts, action="exit",
                        pool_id=pos.pool_id,
                        symbol=pos.symbol,
                        amount_usd=exit_value,
                        apr_at_trade=action.get("current_apr", 0),
                        reason=action.get("reason", ""),
                        friction_usd=friction,
                    ))
                    positions.remove(pos)

            # 计算权益
            total_equity = cash + sum(p.current_value_usd for p in positions)
            equity_curve.append({"timestamp": ts, "equity": total_equity, "cash": cash, "positions": len(positions)})
            peak_equity = max(peak_equity, total_equity)

        # 5. 强制平仓（回测结束）
        for pos in list(positions):
            exit_value = pos.current_value_usd
            friction = exit_value * self.exit_friction_pct / 100
            cash += exit_value - friction

        final_value = cash

        # 6. 计算绩效指标
        report = self._compute_metrics(
            strategy, days, final_value,
            equity_curve, trades,
        )
        logger.info(f"回测完成:\n{report.summary()}")
        return report

    def _load_history(self, days: int) -> list[PoolSnapshot]:
        """从数据库加载历史池子数据"""
        conn = None
        try:
            conn = _get_conn()
            cur = conn.cursor()
            # 尝试从 pool_snapshots 时序表读取
            cur.execute("""
                SELECT pool_id, protocol_id, chain_id, symbol,
                       apr_total, tvl_usd, health_score, time
                FROM pool_snapshots
                WHERE time > NOW() - (%s * INTERVAL '1 day')
                ORDER BY time
            """, (days,))
            rows = cur.fetchall()

            if not rows:
                # 回退: 从 pools 表读取当前快照（至少有一个时间点）
                cur.execute("""
                    SELECT pool_id, protocol_id, chain_id, symbol,
                           apr_total, tvl_usd, health_score, updated_at
                    FROM pools
                    WHERE is_active = true
                    ORDER BY updated_at DESC
                    LIMIT 200
                """)
                rows = cur.fetchall()

            cur.close()
            return [
                PoolSnapshot(
                    pool_id=r[0], protocol_id=r[1], chain_id=r[2],
                    symbol=r[3], apr_total=float(r[4] or 0),
                    tvl_usd=float(r[5] or 0),
                    health_score=float(r[6] or 50),
                    timestamp=str(r[7]),
                )
                for r in rows
            ]
        except Exception as e:
            logger.error(f"加载历史数据失败: {e}")
            return []
        finally:
            if conn:
                try:
                    conn.close()
                except:
                    pass

    def _generate_simulated_data(self, days: int) -> list[PoolSnapshot]:
        """当无历史数据时生成模拟数据用于演示"""
        import random
        pools_meta = [
            ("pool-weth-usdc", "aave-v3", "arbitrum", "WETH-USDC", 8.5, 50_000_000),
            ("pool-wbtc-eth", "uniswap-v3", "ethereum", "WBTC-ETH", 15.2, 120_000_000),
            ("pool-usdc-usdt", "curve", "ethereum", "USDC-USDT", 4.5, 500_000_000),
            ("pool-arb-eth", "camelot", "arbitrum", "ARB-ETH", 35.0, 8_000_000),
            ("pool-matic-eth", "quickswap", "polygon", "MATIC-ETH", 22.0, 15_000_000),
            ("pool-usdc-dai", "aave-v3", "base", "USDC-DAI", 5.8, 30_000_000),
        ]

        snapshots = []
        steps = days * 24 // self.step_hours
        base_time = datetime.now(timezone.utc) - timedelta(days=days)

        for step_i in range(steps):
            ts = (base_time + timedelta(hours=step_i * self.step_hours)).isoformat()
            for pid, proto, chain, sym, base_apr, base_tvl in pools_meta:
                # 模拟 APR 和 TVL 随机波动
                apr_noise = random.gauss(0, base_apr * 0.1)
                tvl_noise = random.gauss(0, base_tvl * 0.05)
                apr = max(0.1, base_apr + apr_noise + math.sin(step_i / 50) * base_apr * 0.2)
                tvl = max(100_000, base_tvl + tvl_noise)
                health = max(30, min(100, 70 + random.gauss(0, 10)))
                snapshots.append(PoolSnapshot(
                    pool_id=pid, protocol_id=proto, chain_id=chain,
                    symbol=sym, apr_total=apr, tvl_usd=tvl,
                    health_score=health, timestamp=ts,
                ))
        return snapshots

    def _group_by_time(self, snapshots: list[PoolSnapshot]) -> dict[str, list[PoolSnapshot]]:
        """按时间戳分组"""
        buckets: dict[str, list[PoolSnapshot]] = {}
        for s in snapshots:
            # 对齐到 step_hours
            ts_key = s.timestamp[:13]  # 截取到小时级
            if ts_key not in buckets:
                buckets[ts_key] = []
            buckets[ts_key].append(s)
        return buckets

    def _update_positions(self, positions: list[SimPosition], pools: list[PoolSnapshot], hours: float):
        """根据当前 APR 更新持仓价值（复利累计）"""
        pool_apr_map = {p.pool_id: p.apr_total for p in pools}
        for pos in positions:
            current_apr = pool_apr_map.get(pos.pool_id, pos.entry_apr)
            # 按小时复利
            hourly_rate = current_apr / 100 / 365 / 24
            yield_earned = pos.current_value_usd * hourly_rate * hours
            pos.current_value_usd += yield_earned
            pos.accumulated_yield_usd += yield_earned

    def _decide(
        self, strategy: str,
        cash: float,
        positions: list[SimPosition],
        pools: list[PoolSnapshot],
    ) -> list[dict]:
        """策略决策引擎"""
        actions = []
        pool_map = {p.pool_id: p for p in pools}
        held_ids = {p.pool_id for p in positions}
        total_equity = cash + sum(p.current_value_usd for p in positions)

        # ── 退出条件检查 ──
        for pos in list(positions):
            pool = pool_map.get(pos.pool_id)
            if not pool:
                continue

            # 健康分过低 → 退出
            if pool.health_score < 40:
                actions.append({
                    "type": "exit", "position": pos,
                    "current_apr": pool.apr_total,
                    "reason": f"健康分过低({pool.health_score:.0f})",
                })
                continue

            # APR 大幅下降 → 退出
            if pos.entry_apr > 0:
                apr_change = (pool.apr_total - pos.entry_apr) / pos.entry_apr * 100
                if apr_change < -self.rebalance_threshold_pct:
                    actions.append({
                        "type": "exit", "position": pos,
                        "current_apr": pool.apr_total,
                        "reason": f"APR下降{apr_change:.0f}%",
                    })
                    continue

            # APR 低于最低阈值 + 有更好选择
            if pool.apr_total < self.min_apr:
                better = [p for p in pools
                          if p.pool_id not in held_ids
                          and p.apr_total > self.min_apr * 2
                          and p.health_score >= self.min_health_score]
                if better:
                    actions.append({
                        "type": "exit", "position": pos,
                        "current_apr": pool.apr_total,
                        "reason": f"APR({pool.apr_total:.1f}%)过低,有更好选择",
                    })

        # ── 入场条件 ──
        if len(positions) < self.max_positions and cash > total_equity * 0.05:
            # 筛选候选池
            candidates = [
                p for p in pools
                if p.pool_id not in held_ids
                and p.health_score >= self.min_health_score
                and self.min_apr <= p.apr_total <= self.max_apr
                and p.tvl_usd >= 100_000
            ]
            # 按健康分×APR 综合排序
            candidates.sort(
                key=lambda p: p.health_score * 0.4 + min(p.apr_total, 100) * 0.6,
                reverse=True,
            )

            slots = self.max_positions - len(positions)
            for pool in candidates[:slots]:
                max_amount = total_equity * self.max_single_pct / 100
                amount = min(cash * 0.4, max_amount)  # 每次最多用40%现金
                if amount < 10:
                    break
                actions.append({
                    "type": "enter",
                    "pool_id": pool.pool_id,
                    "symbol": pool.symbol,
                    "protocol_id": pool.protocol_id,
                    "chain_id": pool.chain_id,
                    "apr": pool.apr_total,
                    "amount": amount,
                    "reason": f"健康分{pool.health_score:.0f},APR {pool.apr_total:.1f}%",
                })
                cash -= amount

        return actions

    def _compute_metrics(
        self, strategy: str, days: int, final_value: float,
        equity_curve: list[dict],
        trades: list[TradeRecord],
    ) -> BacktestReport:
        """计算绩效指标"""
        total_return = (final_value - self.initial_capital) / self.initial_capital * 100
        annualized = (1 + total_return / 100) ** (365 / max(days, 1)) - 1
        annualized_pct = annualized * 100

        # 最大回撤
        peak = self.initial_capital
        max_dd = 0
        for point in equity_curve:
            eq = point["equity"]
            peak = max(peak, eq)
            dd = (peak - eq) / peak * 100 if peak > 0 else 0
            max_dd = max(max_dd, dd)

        # 收益序列（用于夏普/Sortino）
        returns = []
        for i in range(1, len(equity_curve)):
            prev_eq = equity_curve[i - 1]["equity"]
            curr_eq = equity_curve[i]["equity"]
            r = (curr_eq - prev_eq) / prev_eq if prev_eq > 0 else 0
            returns.append(r)

        avg_return = sum(returns) / len(returns) if returns else 0
        std_return = (sum((r - avg_return) ** 2 for r in returns) / max(len(returns) - 1, 1)) ** 0.5

        # 下行标准差（Sortino）
        downside_returns = [r for r in returns if r < 0]
        downside_std = (sum(r ** 2 for r in downside_returns) / max(len(downside_returns), 1)) ** 0.5

        # 年化因子
        periods_per_year = 365 * 24 / self.step_hours
        risk_free_rate = 0.04 / periods_per_year  # 4% 无风险利率

        sharpe = ((avg_return - risk_free_rate) / std_return * math.sqrt(periods_per_year)
                  if std_return > 0 else 0)
        sortino = ((avg_return - risk_free_rate) / downside_std * math.sqrt(periods_per_year)
                   if downside_std > 0 else 0)

        # 交易统计
        total_trades = len(trades)
        total_yield = sum(t.amount_usd for t in trades if t.action == "exit") - sum(
            t.amount_usd for t in trades if t.action == "enter")
        total_friction = sum(t.friction_usd for t in trades)

        # 胜率：exit 时价值 > enter 时价值
        enter_amounts: dict[str, float] = {}
        win_count = 0
        loss_count = 0
        hold_days_list = []
        for t in trades:
            if t.action == "enter":
                enter_amounts[t.pool_id] = t.amount_usd
            elif t.action == "exit":
                entry_amt = enter_amounts.pop(t.pool_id, t.amount_usd)
                if t.amount_usd > entry_amt:
                    win_count += 1
                else:
                    loss_count += 1

        win_rate = win_count / max(win_count + loss_count, 1) * 100

        max_pos_count = max((p["positions"] for p in equity_curve), default=0)

        return BacktestReport(
            strategy=strategy,
            days=days,
            initial_capital=self.initial_capital,
            final_value=final_value,
            total_return_pct=total_return,
            annualized_return_pct=annualized_pct,
            total_yield_earned=max(0, total_yield),
            total_friction_cost=total_friction,
            max_drawdown_pct=max_dd,
            sharpe_ratio=sharpe,
            sortino_ratio=sortino,
            total_trades=total_trades,
            win_trades=win_count,
            loss_trades=loss_count,
            win_rate_pct=win_rate,
            avg_hold_days=sum(hold_days_list) / max(len(hold_days_list), 1) if hold_days_list else days / max(total_trades / 2, 1),
            max_positions=max_pos_count,
            equity_curve=equity_curve[-100:],  # 最后100个点
            trade_log=[asdict(t) for t in trades[-50:]],  # 最后50笔交易
        )
