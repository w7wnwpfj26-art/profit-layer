"""
Multi-Agent 协作决策系统

将单一 think_loop 拆分为 4 个专业 Agent 协作:
1. MarketAnalystAgent - 市场情绪、宏观趋势分析
2. RiskAgent - 风险评估、异常检测、熔断判断
3. StrategyAgent - 策略选择、参数优化、分配决策
4. ExecutorAgent - 执行路径优化、MEV防护、gas优化

架构: 基于消息传递的协作模式 (无需外部框架依赖)
"""

import os
import json
import asyncio
import logging
import uuid
import time
from datetime import datetime, timezone
from dataclasses import dataclass, field, asdict
from typing import Optional
from enum import Enum

import psycopg2
import redis

from ..models.market_sentiment import MarketSentimentCollector
from ..models.alpha_scanner import AlphaScanner
from ..models.ai_advisor import AIAdvisor, MarketContext

logger = logging.getLogger(__name__)


class AgentRole(str, Enum):
    MARKET_ANALYST = "market_analyst"
    RISK = "risk"
    STRATEGY = "strategy"
    EXECUTOR = "executor"
    ORCHESTRATOR = "orchestrator"


@dataclass
class AgentMessage:
    """Agent 间通信消息"""
    from_agent: AgentRole
    to_agent: AgentRole
    msg_type: str  # "analysis", "risk_report", "signal", "veto", "approval"
    content: dict
    confidence: float = 0.0
    timestamp: str = ""
    msg_id: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()
        if not self.msg_id:
            self.msg_id = uuid.uuid4().hex[:8]


@dataclass
class ConsensusResult:
    """多Agent共识结果"""
    approved: bool
    signals: list[dict]
    risk_vetoes: list[str]
    confidence: float
    reasoning: str
    agent_reports: dict[str, dict]


def _get_conn():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5433")),
        dbname=os.getenv("POSTGRES_DB", "defi_yield"),
        user=os.getenv("POSTGRES_USER", "defi"),
        password=os.getenv("POSTGRES_PASSWORD", ""),
    )


class MarketAnalystAgent:
    """市场分析 Agent - 专注情绪和趋势"""

    def __init__(self):
        self.role = AgentRole.MARKET_ANALYST
        self.sentiment_collector = MarketSentimentCollector()
        self.alpha_scanner = AlphaScanner()

    async def analyze(self) -> AgentMessage:
        """执行市场分析"""
        try:
            sentiment = await self.sentiment_collector.get_composite_sentiment()
            alpha_signals = self.alpha_scanner.get_alpha_signals()

            # 市场 regime 判断
            regime = sentiment.market_regime
            risk_appetite = "aggressive" if sentiment.composite_score > 65 else \
                           "conservative" if sentiment.composite_score < 35 else "moderate"

            # 关键信号提取
            key_signals = []
            for sig in alpha_signals[:5]:
                key_signals.append({
                    "type": sig.signal_type,
                    "symbol": sig.symbol,
                    "chain": sig.chain,
                    "description": sig.description,
                    "severity": getattr(sig, 'severity', 'medium'),
                })

            analysis = {
                "sentiment": {
                    "composite_score": sentiment.composite_score,
                    "fear_greed": sentiment.fear_greed_index,
                    "fear_greed_label": sentiment.fear_greed_label,
                    "regime": regime,
                    "suggestion": sentiment.suggestion,
                },
                "prices": {
                    "btc": sentiment.btc_price_usd,
                    "btc_24h_change": sentiment.btc_24h_change_pct,
                    "eth": sentiment.eth_price_usd,
                    "eth_24h_change": sentiment.eth_24h_change_pct,
                },
                "gas": sentiment.gas_gwei,
                "alpha_signals": key_signals,
                "alpha_count": len(alpha_signals),
                "risk_appetite": risk_appetite,
                "recommendation": self._generate_recommendation(sentiment, alpha_signals),
            }

            confidence = min(0.9, sentiment.composite_score / 100 + 0.3)

            return AgentMessage(
                from_agent=self.role,
                to_agent=AgentRole.ORCHESTRATOR,
                msg_type="analysis",
                content=analysis,
                confidence=confidence,
            )
        except Exception as e:
            logger.error(f"MarketAnalyst error: {e}")
            return AgentMessage(
                from_agent=self.role, to_agent=AgentRole.ORCHESTRATOR,
                msg_type="error", content={"error": str(e)}, confidence=0.1,
            )

    def _generate_recommendation(self, sentiment, alpha_signals) -> str:
        score = sentiment.composite_score
        if score >= 70:
            return "市场情绪积极，可适度增加风险敞口"
        elif score >= 50:
            return "市场中性，维持当前配置"
        elif score >= 30:
            return "市场偏谨慎，建议降低风险敞口"
        else:
            return "市场恐慌，建议防御性配置，增加稳定币比例"


class RiskAgent:
    """风险管理 Agent - 专注风险评估和异常检测"""

    def __init__(self):
        self.role = AgentRole.RISK

    async def evaluate(self, market_analysis: dict, portfolio_data: dict) -> AgentMessage:
        """评估当前风险状况"""
        try:
            risk_report = {
                "overall_risk": "low",
                "vetoes": [],
                "warnings": [],
                "adjustments": {},
            }

            sentiment_score = market_analysis.get("sentiment", {}).get("composite_score", 50)
            btc_change = market_analysis.get("prices", {}).get("btc_24h_change", 0)
            positions = portfolio_data.get("positions", [])
            portfolio_value = portfolio_data.get("portfolio_value", 0)

            # 1. 极端市场检测 (Black Swan)
            if abs(btc_change) > 15:
                risk_report["vetoes"].append(f"BTC 24h 变化 {btc_change:+.1f}% - 极端波动，暂停所有操作")
                risk_report["overall_risk"] = "critical"

            # 2. 恐慌指数检测
            fear_greed = market_analysis.get("sentiment", {}).get("fear_greed", 50)
            if fear_greed < 15:
                risk_report["warnings"].append(f"极度恐慌 (FG={fear_greed})，建议减仓")
                risk_report["adjustments"]["max_risk_score"] = 30

            # 3. Gas 异常检测
            gas = market_analysis.get("gas") or {}
            eth_gas = gas.get("ethereum", 0) if gas else 0
            if eth_gas > 100:
                risk_report["warnings"].append(f"ETH Gas 异常高 ({eth_gas} Gwei)，暂停非紧急操作")
                risk_report["adjustments"]["pause_non_urgent"] = True

            # 4. 持仓集中度检测
            if positions and portfolio_value > 0:
                max_position_pct = max(
                    (p.get("valueUsd", 0) / portfolio_value * 100 for p in positions), default=0
                )
                if max_position_pct > 40:
                    risk_report["warnings"].append(
                        f"单一持仓占比 {max_position_pct:.0f}% > 40%，建议分散"
                    )

            # 5. 相关性风险检测
            chains = [p.get("chain", "") for p in positions]
            if chains:
                from collections import Counter
                chain_counts = Counter(chains)
                dominant_chain = chain_counts.most_common(1)[0]
                if len(positions) > 2 and dominant_chain[1] / len(positions) > 0.6:
                    risk_report["warnings"].append(
                        f"链集中度过高: {dominant_chain[0]} 占 {dominant_chain[1]}/{len(positions)}"
                    )

            # 6. Alpha 信号中的风险信号
            for sig in market_analysis.get("alpha_signals", []):
                if sig.get("type") in ("rug_pull", "tvl_crash", "exploit"):
                    risk_report["vetoes"].append(
                        f"高危信号: {sig['type']} - {sig.get('symbol', '')} ({sig.get('description', '')})"
                    )

            # 综合风险等级
            if risk_report["vetoes"]:
                risk_report["overall_risk"] = "critical"
            elif len(risk_report["warnings"]) >= 3:
                risk_report["overall_risk"] = "high"
            elif risk_report["warnings"]:
                risk_report["overall_risk"] = "medium"

            confidence = 0.85 if not risk_report["vetoes"] else 0.95

            return AgentMessage(
                from_agent=self.role, to_agent=AgentRole.ORCHESTRATOR,
                msg_type="risk_report", content=risk_report, confidence=confidence,
            )
        except Exception as e:
            logger.error(f"RiskAgent error: {e}")
            return AgentMessage(
                from_agent=self.role, to_agent=AgentRole.ORCHESTRATOR,
                msg_type="error", content={"error": str(e), "vetoes": ["Risk evaluation failed"]},
                confidence=0.5,
            )


class StrategyAgent:
    """策略 Agent - 专注策略选择和分配优化"""

    def __init__(self):
        self.role = AgentRole.STRATEGY
        self.advisor = AIAdvisor()

    async def decide(
        self, market_analysis: dict, risk_report: dict, portfolio_data: dict, memory_text: str
    ) -> AgentMessage:
        """基于市场分析和风险报告做出策略决策"""
        try:
            # 如果有 veto，只返回防御性建议
            if risk_report.get("vetoes"):
                return AgentMessage(
                    from_agent=self.role, to_agent=AgentRole.ORCHESTRATOR,
                    msg_type="strategy",
                    content={
                        "action": "defensive",
                        "recommendations": [{"action": "hold", "reason": v} for v in risk_report["vetoes"]],
                        "parameter_adjustments": risk_report.get("adjustments", {}),
                    },
                    confidence=0.9,
                )

            # 构建 LLM context
            context = MarketContext(
                total_pools=portfolio_data.get("pool_count", 0),
                avg_apr=portfolio_data.get("avg_apr", 0),
                median_apr=portfolio_data.get("median_apr", 0),
                total_tvl_usd=portfolio_data.get("total_tvl", 0),
                top_pools=portfolio_data.get("top_pools", []),
                active_positions=portfolio_data.get("positions", []),
                portfolio_value_usd=portfolio_data.get("portfolio_value", 0),
                portfolio_pnl_usd=portfolio_data.get("portfolio_pnl", 0),
            )

            # 增强 prompt
            risk_appetite = market_analysis.get("risk_appetite", "moderate")
            risk_level = risk_report.get("overall_risk", "medium")
            warnings_text = "\n".join(f"  ⚠️ {w}" for w in risk_report.get("warnings", []))

            enhanced_prompt = f"""
## 市场分析 (来自 MarketAnalystAgent)
- 情绪: {market_analysis.get('sentiment', {}).get('composite_score', 50)}/100 ({market_analysis.get('sentiment', {}).get('regime', 'unknown')})
- 风险偏好: {risk_appetite}
- BTC: {market_analysis.get('prices', {}).get('btc_24h_change', 0):+.1f}%
- Alpha 信号: {market_analysis.get('alpha_count', 0)} 个

## 风险评估 (来自 RiskAgent)
- 风险等级: {risk_level}
{warnings_text if warnings_text else '  ✅ 无重大风险警告'}

## 历史记忆
{memory_text}

## 指令
根据以上多Agent分析结果，给出具体的投资建议。风险等级为 {risk_level}，请相应调整激进程度。
"""
            base_prompt = self.advisor._build_analysis_prompt(context)
            full_prompt = f"{enhanced_prompt}\n\n---\n\n{base_prompt}"

            advice = await self.advisor.analyze(context, user_prompt_override=full_prompt)

            strategy_result = {
                "action": "active" if risk_level in ("low", "medium") else "cautious",
                "recommendations": advice.recommendations[:5],
                "parameter_adjustments": advice.parameter_adjustments or {},
                "summary": advice.summary,
                "confidence": advice.confidence,
                "risk_level": advice.risk_level,
                "market_regime": advice.market_regime,
            }

            return AgentMessage(
                from_agent=self.role, to_agent=AgentRole.ORCHESTRATOR,
                msg_type="strategy", content=strategy_result,
                confidence=advice.confidence,
            )
        except Exception as e:
            logger.error(f"StrategyAgent error: {e}")
            return AgentMessage(
                from_agent=self.role, to_agent=AgentRole.ORCHESTRATOR,
                msg_type="error", content={"error": str(e)}, confidence=0.1,
            )


class ExecutorAgent:
    """执行 Agent - 专注执行路径优化"""

    def __init__(self):
        self.role = AgentRole.EXECUTOR

    async def plan_execution(self, signals: list[dict], risk_report: dict) -> AgentMessage:
        """规划最优执行路径"""
        try:
            execution_plan = []
            for sig in signals:
                action = sig.get("action", "")
                chain = sig.get("chain", "ethereum")
                amount = sig.get("amount_usd", 0)

                plan = {
                    **sig,
                    "execution_method": self._select_execution_method(chain, amount),
                    "mev_protection": self._select_mev_protection(chain),
                    "priority": self._calculate_priority(sig, risk_report),
                    "max_slippage_bps": self._calculate_slippage(chain, amount),
                }
                execution_plan.append(plan)

            # 按优先级排序
            execution_plan.sort(key=lambda x: x.get("priority", 0), reverse=True)

            return AgentMessage(
                from_agent=self.role, to_agent=AgentRole.ORCHESTRATOR,
                msg_type="execution_plan",
                content={"plans": execution_plan, "total_signals": len(execution_plan)},
                confidence=0.85,
            )
        except Exception as e:
            logger.error(f"ExecutorAgent error: {e}")
            return AgentMessage(
                from_agent=self.role, to_agent=AgentRole.ORCHESTRATOR,
                msg_type="error", content={"error": str(e)}, confidence=0.1,
            )

    def _select_execution_method(self, chain: str, amount_usd: float) -> str:
        if chain == "ethereum" and amount_usd > 5000:
            return "cow_protocol"  # Batch auction, best MEV protection
        elif chain in ("ethereum", "arbitrum", "base", "optimism"):
            return "uniswapx"  # Intent-based with Dutch auction
        elif chain == "solana":
            return "jupiter"
        else:
            return "direct"  # Standard DEX interaction

    def _select_mev_protection(self, chain: str) -> str:
        if chain == "ethereum":
            return "flashbots_protect+mev_blocker"
        elif chain in ("arbitrum", "optimism", "base"):
            return "private_rpc"
        else:
            return "standard"

    def _calculate_priority(self, signal: dict, risk_report: dict) -> int:
        action = signal.get("action", "")
        urgency = signal.get("params", {}).get("urgency", "medium")
        if action == "exit" or urgency == "high":
            return 10
        elif action in ("decrease", "compound"):
            return 5
        else:
            return 3

    def _calculate_slippage(self, chain: str, amount_usd: float) -> int:
        base = 50  # 0.5%
        if amount_usd > 10000:
            base = 100  # 1% for large trades
        if chain in ("ethereum",):
            base += 20  # Higher for mainnet
        return base


class MultiAgentOrchestrator:
    """
    多Agent编排器 - 协调所有Agent的工作流

    流程:
    1. MarketAnalyst → 市场分析
    2. RiskAgent → 风险评估 (基于市场分析)
    3. StrategyAgent → 策略决策 (基于市场+风险)
    4. ExecutorAgent → 执行规划 (基于策略+风险)
    5. 共识机制 → 最终决策
    """

    def __init__(self):
        self.market_agent = MarketAnalystAgent()
        self.risk_agent = RiskAgent()
        self.strategy_agent = StrategyAgent()
        self.executor_agent = ExecutorAgent()
        self.message_log: list[AgentMessage] = []

    async def run_cycle(self, portfolio_data: dict, memory_text: str, accuracy_text: str) -> ConsensusResult:
        """运行一次完整的多Agent决策循环"""
        cycle_start = time.time()
        logger.info("🤖 Multi-Agent 决策循环启动")

        # Phase 1: 市场分析 (独立)
        logger.info("  [Phase 1] MarketAnalystAgent 分析中...")
        market_msg = await self.market_agent.analyze()
        self.message_log.append(market_msg)
        market_analysis = market_msg.content

        # Phase 2: 风险评估 (依赖市场分析)
        logger.info("  [Phase 2] RiskAgent 评估中...")
        risk_msg = await self.risk_agent.evaluate(market_analysis, portfolio_data)
        self.message_log.append(risk_msg)
        risk_report = risk_msg.content

        # Phase 3: 策略决策 (依赖市场+风险)
        logger.info("  [Phase 3] StrategyAgent 决策中...")
        combined_memory = f"{memory_text}\n\n## 决策准确率\n{accuracy_text}"
        strategy_msg = await self.strategy_agent.decide(
            market_analysis, risk_report, portfolio_data, combined_memory
        )
        self.message_log.append(strategy_msg)
        strategy_result = strategy_msg.content

        # Phase 4: 执行规划 (依赖策略+风险)
        signals = strategy_result.get("recommendations", [])
        logger.info(f"  [Phase 4] ExecutorAgent 规划 {len(signals)} 个信号...")
        executor_msg = await self.executor_agent.plan_execution(signals, risk_report)
        self.message_log.append(executor_msg)

        # Phase 5: 共识机制
        consensus = self._build_consensus(market_msg, risk_msg, strategy_msg, executor_msg)

        duration_ms = int((time.time() - cycle_start) * 1000)
        logger.info(
            f"🤖 Multi-Agent 决策完成 | {duration_ms}ms | "
            f"approved={consensus.approved} | signals={len(consensus.signals)} | "
            f"vetoes={len(consensus.risk_vetoes)} | confidence={consensus.confidence:.2f}"
        )

        return consensus

    def _build_consensus(
        self,
        market_msg: AgentMessage,
        risk_msg: AgentMessage,
        strategy_msg: AgentMessage,
        executor_msg: AgentMessage,
    ) -> ConsensusResult:
        """构建多Agent共识"""
        risk_report = risk_msg.content
        strategy_result = strategy_msg.content
        executor_plans = executor_msg.content.get("plans", [])

        vetoes = risk_report.get("vetoes", [])
        approved = len(vetoes) == 0

        # 如果有 veto，只保留退出信号
        if not approved:
            signals = [p for p in executor_plans if p.get("action") == "exit"]
        else:
            signals = executor_plans

        # 综合置信度 (加权平均)
        confidence = (
            market_msg.confidence * 0.2 +
            risk_msg.confidence * 0.3 +
            strategy_msg.confidence * 0.35 +
            executor_msg.confidence * 0.15
        )

        reasoning_parts = []
        if market_msg.content.get("sentiment"):
            s = market_msg.content["sentiment"]
            reasoning_parts.append(f"市场{s.get('regime', '?')}(情绪{s.get('composite_score', 0)})")
        reasoning_parts.append(f"风险{risk_report.get('overall_risk', '?')}")
        if vetoes:
            reasoning_parts.append(f"否决{len(vetoes)}项")
        reasoning_parts.append(f"信号{len(signals)}个")

        return ConsensusResult(
            approved=approved,
            signals=signals,
            risk_vetoes=vetoes,
            confidence=round(confidence, 3),
            reasoning=" | ".join(reasoning_parts),
            agent_reports={
                "market": market_msg.content,
                "risk": risk_msg.content,
                "strategy": strategy_msg.content,
                "executor": executor_msg.content,
            },
        )
