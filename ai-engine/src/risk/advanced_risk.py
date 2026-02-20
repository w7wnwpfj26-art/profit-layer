"""
高级风控系统

升级内容:
1. 动态止损 - 基于 ATR (Average True Range) 自动调整止损比例
2. 相关性风险 - 监控持仓间相关性，避免集中暴露
3. Black Swan 熔断 - 极端事件自动全仓退出
4. Gas Spike 保护 - gas 异常时暂停非紧急操作
5. 协议安全评分 - 动态调整协议信任度
"""

import os
import json
import logging
import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
from enum import Enum

import numpy as np
import aiohttp

logger = logging.getLogger(__name__)


# ---- Types ----

class RiskEvent(str, Enum):
    BLACK_SWAN = "black_swan"
    STABLECOIN_DEPEG = "stablecoin_depeg"
    PROTOCOL_EXPLOIT = "protocol_exploit"
    GAS_SPIKE = "gas_spike"
    CORRELATION_BREACH = "correlation_breach"
    LIQUIDATION_CASCADE = "liquidation_cascade"


@dataclass
class DynamicStopLoss:
    """动态止损参数"""
    position_id: str
    base_stop_pct: float       # 基础止损比例
    atr_multiplier: float      # ATR 倍数
    current_atr: float         # 当前 ATR
    adjusted_stop_pct: float   # 调整后止损比例
    volatility_regime: str     # "low", "normal", "high", "extreme"


@dataclass
class CorrelationRisk:
    """相关性风险"""
    position_pairs: list[tuple[str, str, float]]  # (pos_a, pos_b, correlation)
    max_correlation: float
    cluster_count: int  # 高相关性集群数
    risk_level: str
    recommendation: str


@dataclass
class BlackSwanAlert:
    """黑天鹅事件警报"""
    event_type: RiskEvent
    severity: str  # "warning", "critical", "emergency"
    description: str
    affected_positions: list[str]
    recommended_action: str  # "monitor", "reduce", "exit_all"
    auto_execute: bool
    timestamp: str = ""


@dataclass
class ProtocolSafety:
    """协议安全评分"""
    protocol_id: str
    safety_score: float  # 0-100
    audit_status: str    # "audited", "partial", "unaudited"
    tvl_usd: float
    age_days: int
    incident_count: int
    insurance_available: bool
    risk_tier: str       # "blue_chip", "established", "emerging", "risky"


# ---- Dynamic Stop Loss ----

class DynamicStopLossManager:
    """
    基于 ATR 的动态止损管理器

    原理: 波动率高时放宽止损，波动率低时收紧止损
    避免在正常波动中被误触发，同时在异常波动中快速反应

    公式: adjusted_stop = base_stop * (1 + atr_ratio * multiplier)
    """

    def __init__(
        self,
        base_stop_pct: float = 10.0,
        atr_period: int = 14,
        atr_multiplier: float = 1.5,
        min_stop_pct: float = 3.0,
        max_stop_pct: float = 25.0,
    ):
        self.base_stop_pct = base_stop_pct
        self.atr_period = atr_period
        self.atr_multiplier = atr_multiplier
        self.min_stop_pct = min_stop_pct
        self.max_stop_pct = max_stop_pct

    def calculate_atr(self, price_history: list[float]) -> float:
        """计算 Average True Range"""
        if len(price_history) < self.atr_period + 1:
            return 0

        true_ranges = []
        for i in range(1, len(price_history)):
            high = max(price_history[i], price_history[i - 1])
            low = min(price_history[i], price_history[i - 1])
            tr = high - low
            true_ranges.append(tr)

        # 取最近 N 期的平均
        recent_trs = true_ranges[-self.atr_period:]
        return sum(recent_trs) / len(recent_trs)

    def get_dynamic_stop(
        self,
        position_id: str,
        current_price: float,
        price_history: list[float],
    ) -> DynamicStopLoss:
        """计算动态止损"""
        atr = self.calculate_atr(price_history)

        if current_price <= 0:
            return DynamicStopLoss(
                position_id=position_id,
                base_stop_pct=self.base_stop_pct,
                atr_multiplier=self.atr_multiplier,
                current_atr=0,
                adjusted_stop_pct=self.base_stop_pct,
                volatility_regime="unknown",
            )

        # ATR 占价格的比例
        atr_ratio = atr / current_price if current_price > 0 else 0

        # 波动率 regime 判断
        if atr_ratio < 0.01:
            regime = "low"
            adjustment = 0.7  # 收紧 30%
        elif atr_ratio < 0.03:
            regime = "normal"
            adjustment = 1.0
        elif atr_ratio < 0.08:
            regime = "high"
            adjustment = 1.5  # 放宽 50%
        else:
            regime = "extreme"
            adjustment = 2.0  # 放宽 100%

        adjusted = self.base_stop_pct * adjustment
        adjusted = max(self.min_stop_pct, min(self.max_stop_pct, adjusted))

        return DynamicStopLoss(
            position_id=position_id,
            base_stop_pct=self.base_stop_pct,
            atr_multiplier=self.atr_multiplier,
            current_atr=round(atr, 4),
            adjusted_stop_pct=round(adjusted, 2),
            volatility_regime=regime,
        )


# ---- Correlation Risk Monitor ----

class CorrelationRiskMonitor:
    """
    持仓相关性风险监控

    监控持仓之间的价格相关性，避免集中暴露于同一风险因子
    """

    def __init__(
        self,
        max_correlation: float = 0.8,
        max_cluster_pct: float = 0.5,
    ):
        self.max_correlation = max_correlation
        self.max_cluster_pct = max_cluster_pct

    def analyze(
        self,
        positions: list[dict],
        price_histories: dict[str, list[float]],
    ) -> CorrelationRisk:
        """分析持仓相关性"""
        n = len(positions)
        if n < 2:
            return CorrelationRisk(
                position_pairs=[], max_correlation=0,
                cluster_count=0, risk_level="low",
                recommendation="持仓数量不足，无需相关性分析",
            )

        # 计算相关性矩阵
        high_corr_pairs = []
        pool_ids = [p.get("poolId", "") for p in positions]

        for i in range(n):
            for j in range(i + 1, n):
                pid_a = pool_ids[i]
                pid_b = pool_ids[j]
                hist_a = price_histories.get(pid_a, [])
                hist_b = price_histories.get(pid_b, [])

                if len(hist_a) < 14 or len(hist_b) < 14:
                    continue

                # 对齐长度
                min_len = min(len(hist_a), len(hist_b))
                a = np.array(hist_a[-min_len:])
                b = np.array(hist_b[-min_len:])

                # 计算收益率相关性
                if len(a) > 1:
                    returns_a = np.diff(a) / a[:-1]
                    returns_b = np.diff(b) / b[:-1]
                    if len(returns_a) > 0 and np.std(returns_a) > 0 and np.std(returns_b) > 0:
                        corr = float(np.corrcoef(returns_a, returns_b)[0, 1])
                        if abs(corr) >= self.max_correlation:
                            high_corr_pairs.append((pid_a, pid_b, round(corr, 3)))

        # 集群检测 (简单: 高相关性对的数量)
        cluster_count = len(high_corr_pairs)
        max_corr = max((abs(c) for _, _, c in high_corr_pairs), default=0)

        if cluster_count == 0:
            risk_level = "low"
            rec = "持仓相关性良好，分散化充分"
        elif cluster_count <= 2:
            risk_level = "medium"
            rec = f"发现 {cluster_count} 对高相关持仓，建议适度分散"
        else:
            risk_level = "high"
            rec = f"发现 {cluster_count} 对高相关持仓，强烈建议分散到不同资产类别"

        return CorrelationRisk(
            position_pairs=high_corr_pairs,
            max_correlation=max_corr,
            cluster_count=cluster_count,
            risk_level=risk_level,
            recommendation=rec,
        )


# ---- Black Swan Detector ----

class BlackSwanDetector:
    """
    黑天鹅事件检测器

    监控:
    - BTC/ETH 极端波动 (>15% 24h)
    - 稳定币脱锚 (>2% 偏差)
    - 协议被黑 (TVL 骤降 >50%)
    - 清算级联 (大规模清算事件)
    - Gas 异常飙升 (>5x 正常水平)
    """

    def __init__(
        self,
        btc_crash_threshold: float = 15.0,
        depeg_threshold: float = 2.0,
        tvl_crash_threshold: float = 50.0,
        gas_spike_multiplier: float = 5.0,
    ):
        self.btc_crash_threshold = btc_crash_threshold
        self.depeg_threshold = depeg_threshold
        self.tvl_crash_threshold = tvl_crash_threshold
        self.gas_spike_multiplier = gas_spike_multiplier

    async def scan(
        self,
        market_data: dict,
        positions: list[dict],
        pool_data: dict[str, dict],
    ) -> list[BlackSwanAlert]:
        """扫描黑天鹅事件"""
        alerts = []
        now = datetime.now(timezone.utc).isoformat()

        # 1. BTC/ETH 极端波动
        btc_change = abs(market_data.get("btc_24h_change", 0))
        eth_change = abs(market_data.get("eth_24h_change", 0))

        if btc_change > self.btc_crash_threshold:
            direction = "暴跌" if market_data.get("btc_24h_change", 0) < 0 else "暴涨"
            alerts.append(BlackSwanAlert(
                event_type=RiskEvent.BLACK_SWAN,
                severity="emergency",
                description=f"BTC 24h {direction} {btc_change:.1f}%",
                affected_positions=[p.get("positionId", "") for p in positions],
                recommended_action="exit_all",
                auto_execute=True,
                timestamp=now,
            ))

        if eth_change > self.btc_crash_threshold:
            direction = "暴跌" if market_data.get("eth_24h_change", 0) < 0 else "暴涨"
            alerts.append(BlackSwanAlert(
                event_type=RiskEvent.BLACK_SWAN,
                severity="emergency",
                description=f"ETH 24h {direction} {eth_change:.1f}%",
                affected_positions=[p.get("positionId", "") for p in positions],
                recommended_action="exit_all",
                auto_execute=True,
                timestamp=now,
            ))

        # 2. 稳定币脱锚检测
        stablecoin_prices = await self._check_stablecoin_pegs()
        for coin, price in stablecoin_prices.items():
            deviation = abs(price - 1.0) * 100
            if deviation > self.depeg_threshold:
                affected = [
                    p.get("positionId", "") for p in positions
                    if coin.upper() in (p.get("symbol", "") or "").upper()
                ]
                if affected:
                    alerts.append(BlackSwanAlert(
                        event_type=RiskEvent.STABLECOIN_DEPEG,
                        severity="critical",
                        description=f"{coin} 脱锚: ${price:.4f} (偏差 {deviation:.2f}%)",
                        affected_positions=affected,
                        recommended_action="exit_all",
                        auto_execute=deviation > 5.0,
                        timestamp=now,
                    ))

        # 3. 协议 TVL 骤降 (可能被黑)
        for pos in positions:
            pool_id = pos.get("poolId", "")
            pool = pool_data.get(pool_id, {})
            current_tvl = pool.get("tvlUsd", 0)
            prev_tvl = pool.get("tvlUsd24hAgo", current_tvl)

            if prev_tvl > 0:
                tvl_drop = (prev_tvl - current_tvl) / prev_tvl * 100
                if tvl_drop > self.tvl_crash_threshold:
                    alerts.append(BlackSwanAlert(
                        event_type=RiskEvent.PROTOCOL_EXPLOIT,
                        severity="critical",
                        description=f"Pool {pool_id} TVL 骤降 {tvl_drop:.0f}% (可能被攻击)",
                        affected_positions=[pos.get("positionId", "")],
                        recommended_action="exit_all",
                        auto_execute=True,
                        timestamp=now,
                    ))

        # 4. Gas 异常检测
        gas_gwei = market_data.get("gas_gwei", {})
        eth_gas = gas_gwei.get("ethereum", 0)
        normal_gas = 20  # 基准 gas
        if eth_gas > normal_gas * self.gas_spike_multiplier:
            alerts.append(BlackSwanAlert(
                event_type=RiskEvent.GAS_SPIKE,
                severity="warning",
                description=f"ETH Gas 异常: {eth_gas} Gwei (正常 ~{normal_gas})",
                affected_positions=[],
                recommended_action="monitor",
                auto_execute=False,
                timestamp=now,
            ))

        if alerts:
            logger.warning(f"🚨 Black Swan 检测: {len(alerts)} 个警报")
            for a in alerts:
                logger.warning(f"  [{a.severity}] {a.description} → {a.recommended_action}")

        return alerts

    async def _check_stablecoin_pegs(self) -> dict[str, float]:
        """检查稳定币锚定状态"""
        stablecoins = {
            "USDT": "tether",
            "USDC": "usd-coin",
            "DAI": "dai",
            "FRAX": "frax",
            "LUSD": "liquity-usd",
        }

        try:
            async with aiohttp.ClientSession() as session:
                ids = ",".join(stablecoins.values())
                url = f"https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=usd"
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status != 200:
                        return {}
                    data = await resp.json()

            result = {}
            for symbol, cg_id in stablecoins.items():
                if cg_id in data:
                    result[symbol] = data[cg_id].get("usd", 1.0)
            return result
        except Exception as e:
            logger.warning(f"Stablecoin peg check failed: {e}")
            return {}


# ---- Protocol Safety Scorer ----

class ProtocolSafetyScorer:
    """
    协议安全评分系统

    评分维度:
    - TVL 规模 (越大越安全)
    - 审计状态 (已审计 > 部分审计 > 未审计)
    - 运行时间 (越久越安全)
    - 历史事故 (越少越安全)
    - 保险覆盖 (有保险加分)
    """

    # 已知协议安全数据 (可从 DeFiSafety / Immunefi 获取)
    KNOWN_PROTOCOLS = {
        "aave-v3": {"audit": "audited", "age_days": 900, "incidents": 0, "insurance": True, "tier": "blue_chip"},
        "uniswap-v3": {"audit": "audited", "age_days": 1200, "incidents": 0, "insurance": False, "tier": "blue_chip"},
        "compound-v3": {"audit": "audited", "age_days": 800, "incidents": 1, "insurance": True, "tier": "blue_chip"},
        "curve-dex": {"audit": "audited", "age_days": 1500, "incidents": 1, "insurance": False, "tier": "blue_chip"},
        "lido": {"audit": "audited", "age_days": 1000, "incidents": 0, "insurance": False, "tier": "blue_chip"},
        "gmx-v2": {"audit": "audited", "age_days": 600, "incidents": 0, "insurance": False, "tier": "established"},
        "pendle": {"audit": "audited", "age_days": 500, "incidents": 0, "insurance": False, "tier": "established"},
        "eigenlayer": {"audit": "partial", "age_days": 400, "incidents": 0, "insurance": False, "tier": "emerging"},
        "hyperliquid": {"audit": "partial", "age_days": 500, "incidents": 0, "insurance": False, "tier": "established"},
    }

    def score(self, protocol_id: str, tvl_usd: float = 0) -> ProtocolSafety:
        """计算协议安全评分"""
        known = self.KNOWN_PROTOCOLS.get(protocol_id.lower(), {})

        audit = known.get("audit", "unaudited")
        age = known.get("age_days", 0)
        incidents = known.get("incidents", 0)
        insurance = known.get("insurance", False)
        tier = known.get("tier", "risky")

        # 评分计算
        score = 0

        # TVL 分 (30%)
        if tvl_usd > 1_000_000_000:
            score += 30
        elif tvl_usd > 100_000_000:
            score += 25
        elif tvl_usd > 10_000_000:
            score += 15
        elif tvl_usd > 1_000_000:
            score += 8
        else:
            score += 2

        # 审计分 (25%)
        if audit == "audited":
            score += 25
        elif audit == "partial":
            score += 15
        else:
            score += 3

        # 运行时间分 (20%)
        if age > 1000:
            score += 20
        elif age > 500:
            score += 15
        elif age > 180:
            score += 10
        else:
            score += 3

        # 事故扣分 (15%)
        incident_score = max(0, 15 - incidents * 5)
        score += incident_score

        # 保险加分 (10%)
        if insurance:
            score += 10
        else:
            score += 3

        return ProtocolSafety(
            protocol_id=protocol_id,
            safety_score=min(100, score),
            audit_status=audit,
            tvl_usd=tvl_usd,
            age_days=age,
            incident_count=incidents,
            insurance_available=insurance,
            risk_tier=tier,
        )


# ---- Integrated Advanced Risk Manager ----

class AdvancedRiskManager:
    """
    高级风控管理器 - 整合所有风控模块
    """

    def __init__(self):
        self.dynamic_sl = DynamicStopLossManager()
        self.correlation = CorrelationRiskMonitor()
        self.black_swan = BlackSwanDetector()
        self.protocol_safety = ProtocolSafetyScorer()

    async def full_risk_scan(
        self,
        positions: list[dict],
        pool_data: dict[str, dict],
        market_data: dict,
        price_histories: dict[str, list[float]],
    ) -> dict:
        """执行完整风险扫描"""
        results = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "dynamic_stops": [],
            "correlation": None,
            "black_swan_alerts": [],
            "protocol_scores": [],
            "overall_risk": "low",
            "action_required": False,
        }

        # 1. 动态止损
        for pos in positions:
            pool_id = pos.get("poolId", "")
            history = price_histories.get(pool_id, [])
            current_price = pos.get("valueUsd", 0)
            if history and current_price > 0:
                stop = self.dynamic_sl.get_dynamic_stop(
                    pos.get("positionId", ""), current_price, history
                )
                results["dynamic_stops"].append({
                    "position_id": stop.position_id,
                    "base_stop": stop.base_stop_pct,
                    "adjusted_stop": stop.adjusted_stop_pct,
                    "regime": stop.volatility_regime,
                    "atr": stop.current_atr,
                })

        # 2. 相关性风险
        corr = self.correlation.analyze(positions, price_histories)
        results["correlation"] = {
            "risk_level": corr.risk_level,
            "max_correlation": corr.max_correlation,
            "high_corr_pairs": len(corr.position_pairs),
            "recommendation": corr.recommendation,
        }

        # 3. 黑天鹅检测
        alerts = await self.black_swan.scan(market_data, positions, pool_data)
        results["black_swan_alerts"] = [
            {
                "type": a.event_type.value,
                "severity": a.severity,
                "description": a.description,
                "action": a.recommended_action,
                "auto_execute": a.auto_execute,
            }
            for a in alerts
        ]

        # 4. 协议安全评分
        seen_protocols = set()
        for pos in positions:
            protocol = pos.get("protocolId", "")
            if protocol and protocol not in seen_protocols:
                seen_protocols.add(protocol)
                pool = pool_data.get(pos.get("poolId", ""), {})
                safety = self.protocol_safety.score(protocol, pool.get("tvlUsd", 0))
                results["protocol_scores"].append({
                    "protocol": safety.protocol_id,
                    "score": safety.safety_score,
                    "tier": safety.risk_tier,
                    "audit": safety.audit_status,
                })

        # 综合风险等级
        emergency_alerts = [a for a in alerts if a.severity == "emergency"]
        critical_alerts = [a for a in alerts if a.severity == "critical"]

        if emergency_alerts:
            results["overall_risk"] = "emergency"
            results["action_required"] = True
        elif critical_alerts:
            results["overall_risk"] = "critical"
            results["action_required"] = True
        elif corr.risk_level == "high" or any(a.severity == "warning" for a in alerts):
            results["overall_risk"] = "high"
        elif corr.risk_level == "medium":
            results["overall_risk"] = "medium"

        return results
