"""
AI 自主思考循环 (Agent Think Loop)

每小时运行一次完整的思考循环:
1. 收集: 市场情绪 + Alpha 信号 + 持仓状态 + 历史记忆
2. 分析: 调用 DeepSeek 综合分析
3. 决策: 生成信号 / 调整参数 / 仅记录
4. 反馈: 保存到记忆 + 评估历史决策
"""

import os
import json
import asyncio
import logging
import uuid
import time
from datetime import datetime, timezone

import psycopg2
import redis

from ..models.market_sentiment import MarketSentimentCollector
from ..models.alpha_scanner import AlphaScanner
from ..models.ai_advisor import AIAdvisor, MarketContext
from ..agent.memory import MemoryManager, FeedbackLoop
from ..agent.multi_agent import MultiAgentOrchestrator
from ..models.realtime_feeds import RealTimeFeedAggregator
from ..models.local_llm import SmartLLMRouter
from ..risk.advanced_risk import AdvancedRiskManager

logger = logging.getLogger(__name__)

# 是否启用 Multi-Agent 模式 (2026 升级)
USE_MULTI_AGENT = os.getenv("USE_MULTI_AGENT", "true").lower() == "true"

# 动态思考间隔配置 (2026 升级)
THINK_LOOP_MIN_INTERVAL = int(os.getenv("THINK_LOOP_MIN_INTERVAL", "300"))   # 最小 5 分钟
THINK_LOOP_MAX_INTERVAL = int(os.getenv("THINK_LOOP_MAX_INTERVAL", "3600")) # 最大 1 小时
THINK_LOOP_VOLATILITY_WINDOW = int(os.getenv("THINK_LOOP_VOL_WINDOW", "6"))   # 波动率计算窗口(小时)
VOLATILITY_HIGH_THRESHOLD = float(os.getenv("THINK_LOOP_VOL_HIGH", "0.3"))   # 高波动阈值
VOLATILITY_LOW_THRESHOLD = float(os.getenv("THINK_LOOP_VOL_LOW", "0.1"))    # 低波动阈值

EXECUTE_QUEUE = "execute-tx"

# 冷钱包模式（通过 OKX 钱包签名而不是后端私钥）
USE_COLD_WALLET = os.getenv("USE_COLD_WALLET", "false").lower() == "true"


def _get_conn():
    host = os.getenv("POSTGRES_HOST", "localhost")
    return psycopg2.connect(
        host=host,
        port=int(os.getenv("POSTGRES_PORT", "5433")),
        dbname=os.getenv("POSTGRES_DB", "defi_yield"),
        user=os.getenv("POSTGRES_USER", "defi"),
        password=os.getenv("POSTGRES_PASSWORD", ""),
        sslmode="require" if "supabase" in host else "prefer",
    )


def _get_redis():
    return redis.Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        decode_responses=True,
    )


class AIThinkLoop:
    """AI 自主思考循环 (2026 升级: Multi-Agent + 实时数据 + 高级风控)"""

    def __init__(self):
        self.sentiment_collector = MarketSentimentCollector()
        self.alpha_scanner = AlphaScanner()
        self.advisor = AIAdvisor()
        self.memory = MemoryManager()
        self.feedback = FeedbackLoop()

        # 2026 新模块
        self.multi_agent = MultiAgentOrchestrator() if USE_MULTI_AGENT else None
        self.realtime_feeds = RealTimeFeedAggregator()
        self.advanced_risk = AdvancedRiskManager()
        self.llm_router = SmartLLMRouter()

    async def run_cycle(self) -> dict:
        """运行一次完整的思考循环"""
        cycle_id = f"think-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
        start_time = time.time()
        logger.info(f"🧠 思考循环启动: {cycle_id}")

        result = {
            "cycle_id": cycle_id,
            "status": "success",
            "actions_taken": 0,
            "summary": "",
        }

        try:
            # ---- 1. 收集数据 ----
            logger.info("  [1/5] 收集市场情绪...")
            sentiment = await self.sentiment_collector.get_composite_sentiment()

            logger.info("  [2/5] 扫描 Alpha 信号...")
            alpha_signals = self.alpha_scanner.get_alpha_signals()

            logger.info("  [3/5] 读取持仓和池子数据...")
            portfolio_data = self._get_portfolio_data()

            logger.info("  [4/5] 召回历史记忆...")
            recent_memories = self.memory.format_for_prompt(n=5)
            accuracy_report = self.feedback.format_for_prompt(days=30)

            # ---- 1.5 收集实时增强数据 (2026 新增) ----
            logger.info("  [1.5/6] 收集实时数据源 (巨鲸/情绪/预言机)...")
            try:
                realtime_data = await self.realtime_feeds.get_all_feeds()
                realtime_text = self.realtime_feeds.format_for_prompt(realtime_data)
            except Exception as e:
                logger.warning(f"实时数据源获取失败: {e}")
                realtime_data = {}
                realtime_text = ""

            # ---- 1.6 高级风控扫描 (2026 新增) ----
            logger.info("  [1.6/6] 高级风控扫描...")
            try:
                risk_scan = await self.advanced_risk.full_risk_scan(
                    positions=portfolio_data.get("positions", []),
                    pool_data={},  # 从 DB 获取
                    market_data={
                        "btc_24h_change": sentiment.btc_24h_change_pct,
                        "eth_24h_change": sentiment.eth_24h_change_pct,
                        "gas_gwei": sentiment.gas_gwei,
                    },
                    price_histories={},
                )
                if risk_scan.get("action_required"):
                    logger.warning(f"🚨 高级风控警报: {risk_scan.get('overall_risk')}")
            except Exception as e:
                logger.warning(f"高级风控扫描失败: {e}")
                risk_scan = {}

            # ---- 2. 决策路径: Multi-Agent 或 单一 LLM ----
            actions_taken = 0

            if USE_MULTI_AGENT and self.multi_agent:
                # ===== Multi-Agent 协作决策 (2026 升级) =====
                logger.info("  [2/6] 🤖 Multi-Agent 协作决策...")
                consensus = await self.multi_agent.run_cycle(
                    portfolio_data=portfolio_data,
                    memory_text=recent_memories,
                    accuracy_text=accuracy_report,
                )

                # 处理共识结果
                if consensus.approved and consensus.signals:
                    actions_taken += self._process_recommendations(consensus.signals, cycle_id)

                # 应用参数调整
                strategy_report = consensus.agent_reports.get("strategy", {})
                if strategy_report.get("parameter_adjustments"):
                    self._apply_parameter_adjustments(strategy_report["parameter_adjustments"])
                    actions_taken += 1

                # 构建 advice-like 对象用于后续记忆存储
                class _AdviceLike:
                    pass
                advice = _AdviceLike()
                advice.summary = consensus.reasoning
                advice.recommendations = consensus.signals
                advice.confidence = consensus.confidence
                advice.parameter_adjustments = strategy_report.get("parameter_adjustments", {})
                advice.market_regime = consensus.agent_reports.get("market", {}).get("sentiment", {}).get("regime", "unknown")
                advice.risk_level = consensus.agent_reports.get("risk", {}).get("overall_risk", "medium")
                advice.analysis = json.dumps(consensus.agent_reports, ensure_ascii=False, default=str)

            else:
                # ===== 原有单一 LLM 决策路径 =====
                enhanced_prompt = self._build_enhanced_prompt(
                    sentiment, alpha_signals, portfolio_data, recent_memories, accuracy_report
                )
                # 注入实时数据
                if realtime_text:
                    enhanced_prompt = f"{enhanced_prompt}\n\n{realtime_text}"

                logger.info("  [2/6] 调用 LLM 综合分析...")
                context = MarketContext(
                    total_pools=portfolio_data["pool_count"],
                    avg_apr=portfolio_data["avg_apr"],
                    median_apr=portfolio_data["median_apr"],
                    total_tvl_usd=portfolio_data["total_tvl"],
                    top_pools=portfolio_data["top_pools"],
                    active_positions=portfolio_data["positions"],
                    portfolio_value_usd=portfolio_data["portfolio_value"],
                    portfolio_pnl_usd=portfolio_data["portfolio_pnl"],
                )

                base_user = self.advisor._build_analysis_prompt(context)
                full_user_prompt = f"{enhanced_prompt.strip()}\n\n---\n\n{base_user}"
                advice = await self.advisor.analyze(context, user_prompt_override=full_user_prompt)

                # 执行决策
                if advice.recommendations:
                    actions_taken += self._process_recommendations(advice.recommendations, cycle_id)
                if advice.parameter_adjustments:
                    self._apply_parameter_adjustments(advice.parameter_adjustments)
                    actions_taken += 1

            # ---- 5. 保存记忆 ----
            memory_summary = (
                f"[市场:{sentiment.market_regime}|情绪:{sentiment.composite_score}|"
                f"BTC:{sentiment.btc_24h_change_pct:+.1f}%] "
                f"{advice.summary} "
                f"(建议 {len(advice.recommendations)} 条, 信心 {advice.confidence:.0%})"
            )
            self.memory.store("analysis", memory_summary, {
                "sentiment": {
                    "composite": sentiment.composite_score,
                    "fear_greed": sentiment.fear_greed_index,
                    "regime": sentiment.market_regime,
                },
                "alpha_count": len(alpha_signals),
                "advice_summary": advice.summary,
                "recommendations_count": len(advice.recommendations),
                "confidence": advice.confidence,
            })

            # 记录决策
            for rec in advice.recommendations[:5]:
                self.feedback.record_decision(
                    decision_type=rec.get("action", "hold"),
                    pool_id=rec.get("pool_id", ""),
                    symbol=rec.get("symbol", ""),
                    chain="",
                    expected_apr=0,
                    confidence=advice.confidence,
                    reasoning=rec.get("reason", ""),
                )

            # 评估历史决策
            self.feedback.evaluate_decisions()

            # ---- 6. 保存思考日志 ----
            duration_ms = int((time.time() - start_time) * 1000)
            self._save_think_log(cycle_id, sentiment, alpha_signals, advice, actions_taken, duration_ms)

            result["actions_taken"] = actions_taken
            result["summary"] = memory_summary

            logger.info(
                f"🧠 思考循环完成: {cycle_id} | 耗时 {duration_ms}ms | "
                f"情绪 {sentiment.composite_score} ({sentiment.market_regime}) | "
                f"Alpha {len(alpha_signals)} 个 | 建议 {len(advice.recommendations)} 条 | "
                f"执行 {actions_taken} 个动作"
            )

        except Exception as e:
            result["status"] = "error"
            result["summary"] = f"思考循环异常: {str(e)}"
            logger.error(f"🧠 思考循环失败: {cycle_id} | {e}", exc_info=True)
            self.memory.store("error", f"思考循环异常: {str(e)}")

        return result

    def _get_portfolio_data(self) -> dict:
        """从数据库获取当前投资组合数据"""
        conn = None
        try:
            conn = _get_conn()
            cur = conn.cursor()

            # 池子概览
            cur.execute("""
                SELECT COUNT(*), ROUND(AVG(apr_total)::numeric, 2), 
                       ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY apr_total)::numeric, 2),
                       ROUND(SUM(tvl_usd)::numeric, 0)
                FROM pools WHERE is_active = true AND tvl_usd > 100000
            """)
            row = cur.fetchone()
            pool_count = int(row[0] or 0)
            avg_apr = float(row[1] or 0)
            median_apr = float(row[2] or 0)
            total_tvl = float(row[3] or 0)

            # Top 池子
            cur.execute("""
                SELECT pool_id, protocol_id, chain_id, symbol, apr_total, tvl_usd, health_score
                FROM pools WHERE is_active = true AND tvl_usd > 500000 AND apr_total >= 1000
                ORDER BY apr_total DESC LIMIT 15
            """)
            top_pools = [
                {"poolId": r[0], "protocolId": r[1], "chain": r[2], "symbol": r[3],
                 "aprTotal": float(r[4]), "tvlUsd": float(r[5]), "healthScore": float(r[6] or 0)}
                for r in cur.fetchall()
            ]

            # 持仓
            cur.execute("""
                SELECT p.position_id, p.pool_id, p.chain_id, p.value_usd, p.unrealized_pnl_usd,
                       pl.symbol, pl.apr_total
                FROM positions p LEFT JOIN pools pl ON p.pool_id = pl.pool_id
                WHERE p.status = 'active'
            """)
            positions = [
                {"positionId": r[0], "poolId": r[1], "chain": r[2], "valueUsd": float(r[3]),
                 "unrealizedPnlUsd": float(r[4]), "symbol": r[5] or "", "apr": float(r[6] or 0)}
                for r in cur.fetchall()
            ]

            portfolio_value = sum(p["valueUsd"] for p in positions)
            portfolio_pnl = sum(p["unrealizedPnlUsd"] for p in positions)

            cur.close()

            return {
                "pool_count": pool_count, "avg_apr": avg_apr, "median_apr": median_apr,
                "total_tvl": total_tvl, "top_pools": top_pools, "positions": positions,
                "portfolio_value": portfolio_value, "portfolio_pnl": portfolio_pnl,
            }
        except Exception as e:
            logger.error(f"获取投资组合数据失败: {e}")
            return {"pool_count": 0, "avg_apr": 0, "median_apr": 0, "total_tvl": 0,
                    "top_pools": [], "positions": [], "portfolio_value": 0, "portfolio_pnl": 0}
        finally:
            if conn:
                try:
                    conn.close()
                except:
                    pass

    def _build_enhanced_prompt(self, sentiment, alpha_signals, portfolio, memories_text, accuracy_text) -> str:
        """构建增强版 prompt（注入情绪 + Alpha + 记忆 + 准确率）"""
        alpha_text = ""
        for sig in alpha_signals[:8]:
            alpha_text += f"  - [{sig.signal_type}] {sig.symbol} ({sig.protocol_id}/{sig.chain}): {sig.description}\n"

        return f"""
## 市场情绪
- 恐惧贪婪指数: {sentiment.fear_greed_index} ({sentiment.fear_greed_label})
- BTC: ${sentiment.btc_price_usd:,.0f} (24h {sentiment.btc_24h_change_pct:+.1f}%)
- ETH: ${sentiment.eth_price_usd:,.0f} (24h {sentiment.eth_24h_change_pct:+.1f}%)
- Gas: {', '.join(f'{k}={v}Gwei' for k, v in sentiment.gas_gwei.items())}
- 综合情绪: {sentiment.composite_score}/100 ({sentiment.market_regime})
- 建议: {sentiment.suggestion}

## Alpha 信号 ({len(alpha_signals)} 个)
{alpha_text if alpha_text else "  （暂无异常信号）"}

## 你的历史记忆
{memories_text}

## 你的历史决策准确率
{accuracy_text}
"""

    def _process_recommendations(self, recommendations: list[dict], cycle_id: str) -> int:
        """处理 AI 建议，生成交易信号推送到 Redis 或冷钱包队列"""
        count = 0
        try:
            for rec in recommendations[:3]:  # 每次最多执行 3 条
                action = rec.get("action", "")
                if action not in ("enter", "exit", "decrease", "increase", "compound"):
                    continue

                signal = {
                    "signalId": f"{cycle_id}-{count}",
                    "strategyId": "ai_think_loop",
                    "action": action,
                    "poolId": rec.get("pool_id", ""),
                    "chain": rec.get("chain", "ethereum"),
                    "protocolId": rec.get("protocol", ""),
                    "amountUsd": rec.get("amount_usd", 0),
                    "params": {
                        "source": "ai_think_loop",
                        "reason": rec.get("reason", ""),
                        "urgency": rec.get("urgency", "medium"),
                    },
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }

                # 根据 USE_COLD_WALLET 配置决定信号去向
                if USE_COLD_WALLET:
                    # 冷钱包模式：插入数据库等待 OKX 签名
                    conn = None
                    try:
                        conn = _get_conn()
                        cur = conn.cursor()
                        cur.execute("""
                            INSERT INTO pending_signatures (chain_id, tx_type, amount_usd, payload, status)
                            VALUES (%s, %s, %s, %s, 'pending')
                        """, (
                            signal.get("chain", "ethereum"),
                            action,
                            signal.get("amountUsd", 0),
                            json.dumps(signal),
                        ))
                        conn.commit()
                        cur.close()
                        logger.info(f"  → 冷钱包信号已入队: {action} {rec.get('symbol', rec.get('pool_id', '?'))}")
                        
                        # 2026 升级：注册实时评估回调
                        self._schedule_realtime_evaluation(signal)
                    finally:
                        if conn:
                            try:
                                conn.close()
                            except:
                                pass
                else:
                    # 普通模式：发送到 Redis
                    r = None
                    try:
                        r = _get_redis()
                        r.xadd(f"bull:{EXECUTE_QUEUE}:events", {"data": json.dumps(signal)})
                        logger.info(f"  → 信号已推送: {action} {rec.get('symbol', rec.get('pool_id', '?'))}")
                        
                        # 2026 升级：注册实时评估回调
                        self._schedule_realtime_evaluation(signal)
                    finally:
                        if r:
                            try:
                                r.close()
                            except:
                                pass
                
                count += 1
        except Exception as e:
            logger.error(f"推送信号失败: {e}")
        return count

    def _schedule_realtime_evaluation(self, signal: dict) -> None:
        """2026 升级：注册实时评估回调
        
        在交易推送后 5 分钟自动评估决策效果，
        大幅缩短反馈闭环时间。
        """
        try:
            # 使用 Redis 延迟队列实现定时评估
            r = _get_redis()
            eval_payload = {
                "signal_id": signal.get("signalId", ""),
                "pool_id": signal.get("poolId", ""),
                "action": signal.get("action", ""),
                "expected_apr": signal.get("params", {}).get("expected_apr", 0),
                "scheduled_at": datetime.now(timezone.utc).isoformat(),
            }
            # 5分钟后执行评估 (300秒)
            r.zadd("eval:scheduled", {json.dumps(eval_payload): time.time() + 300})
            r.close()
            logger.info(f"  → 已注册实时评估: {signal.get('signalId')} (5分钟后)")
        except Exception as e:
            logger.warning(f"注册实时评估失败: {e}")

    async def process_pending_evaluations(self) -> int:
        """2026 升级：处理待执行的实时评估"""
        count = 0
        r = None
        try:
            r = _get_redis()
            now = time.time()
            
            # 获取已到期的评估任务
            ready = r.zrangebyscore("eval:scheduled", 0, now)
            
            for eval_data in ready:
                try:
                    task = json.loads(eval_data)
                    signal_id = task.get("signal_id", "")
                    pool_id = task.get("pool_id", "")
                    
                    # 查询实际结果
                    conn = _get_conn()
                    cur = conn.cursor()
                    cur.execute("""
                        SELECT tx_hash, status, gas_used, slippage_pct, 
                               actual_amount_in, actual_amount_out, created_at
                        FROM transactions 
                        WHERE signal_id = %s 
                        ORDER BY created_at DESC LIMIT 1
                    """, (signal_id,))
                    row = cur.fetchone()
                    cur.close()
                    conn.close()
                    
                    if row and row[1] == "confirmed":
                        # 交易已确认，进行评估
                        actual_slippage = float(row[3] or 0) if row[3] else 0
                        actual_gas = float(row[2] or 0) if row[2] else 0
                        
                        # 评估结果记录
                        conn = _get_conn()
                        cur = conn.cursor()
                        cur.execute("""
                            UPDATE ai_decisions 
                            SET actual_outcome = 'pending_realtime',
                                reasoning = reasoning || ' | 实时评估: slippage=' || %s || '%, gas=' || %s
                            WHERE pool_id = %s AND created_at > NOW() - INTERVAL '1 hour'
                            RETURNING id
                        """, (str(actual_slippage), str(actual_gas), pool_id))
                        if cur.fetchone():
                            conn.commit()
                            logger.info(f"  ✓ 实时评估完成: {signal_id}, slippage={actual_slippage}%")
                            count += 1
                        cur.close()
                        conn.close()
                    
                    # 从队列移除
                    r.zrem("eval:scheduled", eval_data)
                    
                except Exception as e:
                    logger.warning(f"评估任务执行失败: {e}")
            
            r.close()
            return count
            
        except Exception as e:
            logger.error(f"处理实时评估队列失败: {e}")
            return 0
        finally:
            if r:
                try:
                    r.close()
                except:
                    pass

    def _apply_parameter_adjustments(self, adjustments: dict) -> None:
        """自动调整系统参数"""
        allowed = {"max_risk_score", "min_health_score", "compound_interval_hr", "stop_loss_pct", "rebalance_threshold_pct"}
        conn = None
        try:
            conn = _get_conn()
            cur = conn.cursor()
            for key, value in adjustments.items():
                if key in allowed:
                    cur.execute(
                        "UPDATE system_config SET value = %s, updated_at = NOW() WHERE key = %s",
                        (str(value), key),
                    )
                    logger.info(f"  → 参数自动调整: {key} = {value}")
            conn.commit()
            cur.close()
        except Exception as e:
            logger.error(f"参数调整失败: {e}")
        finally:
            if conn:
                try:
                    conn.close()
                except:
                    pass

    def _save_think_log(self, cycle_id, sentiment, alpha_signals, advice, actions, duration_ms):
        """保存思考日志到数据库"""
        conn = None
        try:
            conn = _get_conn()
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO ai_think_log 
                   (cycle_id, input_summary, output_summary, full_input, full_output, tokens_used, duration_ms, actions_taken) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    cycle_id,
                    f"情绪{sentiment.composite_score}({sentiment.market_regime}) | Alpha {len(alpha_signals)}个",
                    advice.summary,
                    json.dumps({
                        "sentiment": {"score": sentiment.composite_score, "regime": sentiment.market_regime,
                                      "btc_change": sentiment.btc_24h_change_pct, "fear_greed": sentiment.fear_greed_index},
                        "alpha_count": len(alpha_signals),
                        "alpha_top3": [{"type": s.signal_type, "symbol": s.symbol, "desc": s.description} for s in alpha_signals[:3]],
                    }, ensure_ascii=False),
                    json.dumps({
                        "regime": advice.market_regime, "risk_level": advice.risk_level,
                        "confidence": advice.confidence, "summary": advice.summary,
                        "analysis": advice.analysis,
                        "recommendations": advice.recommendations[:5],
                        "parameter_adjustments": advice.parameter_adjustments,
                    }, ensure_ascii=False),
                    0,  # tokens_used (DeepSeek 不一定返回)
                    duration_ms,
                    actions,
                ),
            )
            conn.commit()
            cur.close()
        except Exception as e:
            logger.error(f"思考日志保存失败: {e}")
        finally:
            if conn:
                try:
                    conn.close()
                except:
                    pass


async def start_think_loop(interval_seconds: int = 3600):
    """启动 AI 思考循环（2026升级: 动态间隔）
    
    根据市场波动率自动调整思考间隔:
    - 高波动 (CV > 0.3): 最短 5 分钟
    - 中波动 (0.1 < CV < 0.3): 15-30 分钟
    - 低波动 (CV < 0.1): 最长 1 小时
    """
    loop_instance = AIThinkLoop()
    current_interval = interval_seconds
    logger.info(f"🧠 AI 思考循环已启动，初始间隔 {interval_seconds} 秒")

    while True:
        try:
            result = await loop_instance.run_cycle()
            logger.info(f"🧠 循环结果: {result['status']} | {result['summary'][:80]}")
            
            # 动态计算下轮间隔
            try:
                current_interval = await calculate_next_interval(loop_instance)
                logger.info(f"🧠 下轮思考间隔: {current_interval}秒 ({current_interval/60:.1f}分钟)")
            except Exception as e:
                logger.warning(f"动态间隔计算失败，使用固定间隔: {e}")
                current_interval = interval_seconds
                
        except Exception as e:
            logger.error(f"🧠 思考循环异常: {e}")
        await asyncio.sleep(current_interval)


async def calculate_next_interval(think_loop: AIThinkLoop) -> int:
    """根据市场波动率动态计算思考间隔"""
    conn = None
    try:
        conn = _get_conn()
        cur = conn.cursor()
        
        # 查询近期 APR 波动率
        cur.execute("""
            SELECT 
                AVG(apr_total) as avg_apr,
                STDDEV(apr_total) as std_apr,
                COUNT(*) as pool_count
            FROM pools 
            WHERE is_active = true 
            AND updated_at > NOW() - INTERVAL '%s hours'
            AND apr_total IS NOT NULL
        """, (THINK_LOOP_VOLATILITY_WINDOW,))
        
        row = cur.fetchone()
        if not row or not row[0]:
            return THINK_LOOP_MAX_INTERVAL
            
        avg_apr = float(row[0] or 0)
        std_apr = float(row[1] or 0)
        pool_count = int(row[2] or 0)
        
        cur.close()
        conn.close()
        
        if avg_apr <= 0 or pool_count < 10:
            return THINK_LOOP_MAX_INTERVAL
        
        # 计算变异系数 (Coefficient of Variation)
        cv = std_apr / avg_apr  # 归一化波动率
        
        # 线性映射: CV=0.3+ → 最短间隔, CV=0 → 最长间隔
        if cv >= VOLATILITY_HIGH_THRESHOLD:
            # 高波动: 最短间隔
            interval = THINK_LOOP_MIN_INTERVAL
        elif cv <= VOLATILITY_LOW_THRESHOLD:
            # 低波动: 最长间隔  
            interval = THINK_LOOP_MAX_INTERVAL
        else:
            # 中波动: 线性插值
            normalized = (cv - VOLATILITY_LOW_THRESHOLD) / (VOLATILITY_HIGH_THRESHOLD - VOLATILITY_LOW_THRESHOLD)
            interval = int(THINK_LOOP_MAX_INTERVAL - normalized * (THINK_LOOP_MAX_INTERVAL - THINK_LOOP_MIN_INTERVAL))
        
        logger.info(f"🧠 波动率分析: avg_apr={avg_apr:.1f}%, std={std_apr:.1f}, CV={cv:.3f} → 间隔={interval}秒")
        return max(THINK_LOOP_MIN_INTERVAL, min(THINK_LOOP_MAX_INTERVAL, interval))
        
    except Exception as e:
        logger.warning(f"波动率计算异常: {e}")
        return THINK_LOOP_MAX_INTERVAL
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass
