"""
AI 记忆系统 + 决策反馈闭环

功能:
1. MemoryManager: 存储/召回历史分析与决策
2. FeedbackLoop: 记录决策 → 评估结果 → 生成准确率报告
"""

import os
import json
import logging
from datetime import datetime, timezone
from dataclasses import dataclass

import psycopg2

logger = logging.getLogger(__name__)


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


class MemoryManager:
    """AI 记忆管理器"""

    def store(self, memory_type: str, summary: str, content: dict | None = None) -> int:
        """保存一条记忆"""
        conn = None
        try:
            conn = _get_conn()
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO ai_memory (memory_type, summary, content) VALUES (%s, %s, %s) RETURNING id",
                (memory_type, summary, json.dumps(content or {}, ensure_ascii=False)),
            )
            mem_id = cur.fetchone()[0]
            conn.commit()
            cur.close()
            return mem_id
        except Exception as e:
            logger.error(f"记忆存储失败: {e}")
            return -1
        finally:
            if conn:
                try:
                    conn.close()
                except:
                    pass

    def recall(self, n: int = 10, memory_type: str | None = None) -> list[dict]:
        """召回最近 N 条记忆"""
        conn = None
        try:
            conn = _get_conn()
            cur = conn.cursor()
            if memory_type:
                cur.execute(
                    "SELECT id, memory_type, summary, content, created_at FROM ai_memory WHERE memory_type = %s ORDER BY created_at DESC LIMIT %s",
                    (memory_type, n),
                )
            else:
                cur.execute(
                    "SELECT id, memory_type, summary, content, created_at FROM ai_memory ORDER BY created_at DESC LIMIT %s",
                    (n,),
                )
            memories = []
            for row in cur.fetchall():
                memories.append({
                    "id": row[0],
                    "type": row[1],
                    "summary": row[2],
                    "content": row[3] if isinstance(row[3], dict) else json.loads(row[3] or "{}"),
                    "time": row[4].isoformat() if row[4] else "",
                })
            cur.close()
            return memories
        except Exception as e:
            logger.error(f"记忆召回失败: {e}")
            return []
        finally:
            if conn:
                try:
                    conn.close()
                except:
                    pass

    def format_for_prompt(self, n: int = 5) -> str:
        """格式化记忆为 prompt 注入文本"""
        memories = self.recall(n)
        if not memories:
            return "（暂无历史记忆）"
        lines = []
        for m in memories:
            time_str = m["time"][:16] if m["time"] else "未知时间"
            lines.append(f"- [{time_str}] [{m['type']}] {m['summary']}")
        return "\n".join(lines)


class FeedbackLoop:
    """决策反馈闭环"""

    def record_decision(
        self,
        decision_type: str,
        pool_id: str,
        symbol: str,
        chain: str,
        expected_apr: float,
        confidence: float,
        reasoning: str,
    ) -> int:
        """记录一个决策"""
        conn = None
        try:
            conn = _get_conn()
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO ai_decisions 
                   (decision_type, pool_id, symbol, chain, expected_apr, confidence, reasoning, actual_outcome) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending') RETURNING id""",
                (decision_type, pool_id, symbol, chain, expected_apr, confidence, reasoning),
            )
            dec_id = cur.fetchone()[0]
            conn.commit()
            cur.close()
            logger.info(f"决策已记录: #{dec_id} {decision_type} {symbol} (预期 APR {expected_apr:.1f}%)")
            return dec_id
        except Exception as e:
            logger.error(f"决策记录失败: {e}")
            return -1
        finally:
            if conn:
                try:
                    conn.close()
                except:
                    pass

    def evaluate_decisions(self) -> dict:
        """评估所有待评估的决策（对比预期 vs 实际 APR + 实际 PnL）"""
        conn = None
        try:
            conn = _get_conn()
            cur = conn.cursor()

            # 找出超过 24h 的 pending 决策，拉取持仓的实际 PnL（活跃=未实现，已关闭=已实现）
            cur.execute("""
                SELECT d.id, d.pool_id, d.expected_apr, d.decision_type,
                       p.apr_total as current_apr, p.tvl_usd,
                       pos.unrealized_pnl_usd,
                       COALESCE(pos.unrealized_pnl_usd, closed.realized_pnl_usd) as pnl_usd,
                       pos.value_usd
                FROM ai_decisions d
                LEFT JOIN pools p ON d.pool_id = p.pool_id
                LEFT JOIN positions pos ON d.pool_id = pos.pool_id AND pos.status = 'active'
                LEFT JOIN LATERAL (
                    SELECT realized_pnl_usd FROM positions
                    WHERE pool_id = d.pool_id AND status = 'closed'
                    ORDER BY closed_at DESC LIMIT 1
                ) closed ON true
                WHERE d.actual_outcome = 'pending'
                AND d.created_at < NOW() - INTERVAL '24 hours'
            """)

            evaluated = 0
            for row in cur.fetchall():
                dec_id, pool_id, expected_apr, dec_type, current_apr, tvl, _, pnl_usd, value_usd = row
                current_apr = float(current_apr or 0)
                expected_apr = float(expected_apr or 0)
                pnl_usd = float(pnl_usd or 0)
                value_usd = float(value_usd or 0)

                # 综合判断：APR 达标 + 实际美元盈亏（含退出时的已实现 PnL）
                if dec_type in ("enter", "hold", "increase"):
                    pnl_positive = pnl_usd >= 0
                    apr_ok = current_apr >= expected_apr * 0.8

                    if apr_ok and pnl_positive:
                        outcome = "profit"
                    elif apr_ok or pnl_positive:
                        outcome = "neutral"
                    else:
                        outcome = "loss"
                elif dec_type in ("exit", "decrease"):
                    # 退出决策：结合已实现 PnL + 池子 APR 变化
                    pnl_positive = pnl_usd >= 0
                    apr_dropped = current_apr < expected_apr * 0.5
                    if pnl_positive and apr_dropped:
                        outcome = "profit"  # 退出时机好
                    elif pnl_positive:
                        outcome = "neutral"
                    elif not pnl_positive and apr_dropped:
                        outcome = "neutral"  # 虽亏但 APR 已崩，退出也算及时
                    else:
                        outcome = "loss"
                else:
                    outcome = "neutral"

                cur.execute(
                    """UPDATE ai_decisions SET actual_apr = %s, actual_outcome = %s, evaluated_at = NOW(),
                       reasoning = reasoning || ' | 实际PnL: $' || %s || ', 实际APR: ' || %s || '%%'
                       WHERE id = %s""",
                    (current_apr, outcome, str(round(pnl_usd, 2)), str(round(current_apr, 1)), dec_id),
                )
                evaluated += 1

            conn.commit()
            cur.close()
            logger.info(f"决策评估完成: {evaluated} 条")
            return {"evaluated": evaluated}
        except Exception as e:
            logger.error(f"决策评估失败: {e}")
            return {"evaluated": 0, "error": str(e)}
        finally:
            if conn:
                try:
                    conn.close()
                except:
                    pass

    def get_accuracy_report(self, days: int = 30) -> dict:
        """生成准确率报告"""
        conn = None
        try:
            conn = _get_conn()
            cur = conn.cursor()
            cur.execute("""
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE actual_outcome = 'profit') as profit_count,
                    COUNT(*) FILTER (WHERE actual_outcome = 'loss') as loss_count,
                    COUNT(*) FILTER (WHERE actual_outcome = 'neutral') as neutral_count,
                    COUNT(*) FILTER (WHERE actual_outcome = 'pending') as pending_count,
                    AVG(confidence) FILTER (WHERE actual_outcome = 'profit') as avg_confidence_win,
                    AVG(confidence) FILTER (WHERE actual_outcome = 'loss') as avg_confidence_lose
                FROM ai_decisions
                WHERE created_at > NOW() - (%s * INTERVAL '1 day')
            """, (days,))
            row = cur.fetchone()
            total = row[0] or 0
            profit = row[1] or 0
            loss = row[2] or 0
            evaluated = profit + loss + (row[3] or 0)
            accuracy = (profit / evaluated * 100) if evaluated > 0 else 0

            cur.close()

            return {
                "days": days,
                "total_decisions": total,
                "evaluated": evaluated,
                "profit": profit,
                "loss": loss,
                "neutral": row[3] or 0,
                "pending": row[4] or 0,
                "accuracy_pct": round(accuracy, 1),
                "avg_confidence_win": round(float(row[5] or 0), 3),
                "avg_confidence_lose": round(float(row[6] or 0), 3),
            }
        except Exception as e:
            logger.error(f"准确率报告生成失败: {e}")
            return {"accuracy_pct": 0, "error": str(e)}
        finally:
            if conn:
                try:
                    conn.close()
                except:
                    pass

    def format_for_prompt(self, days: int = 30) -> str:
        """格式化准确率报告为 prompt 注入文本（含实际 PnL 维度）"""
        report = self.get_accuracy_report(days)
        if report.get("total_decisions", 0) == 0:
            return "（暂无历史决策数据）"
        # 尝试获取累计实际盈亏（供 LLM 参考）
        pnl_summary = ""
        try:
            conn = _get_conn()
            cur = conn.cursor()
            cur.execute(
                """SELECT COALESCE(SUM(realized_pnl_usd), 0), COALESCE(SUM(unrealized_pnl_usd), 0)
                   FROM positions WHERE status IN ('active', 'closed')"""
            )
            row = cur.fetchone()
            if row and (float(row[0] or 0) != 0 or float(row[1] or 0) != 0):
                pnl_summary = f" 累计已实现: ${float(row[0] or 0):.2f}, 未实现: ${float(row[1] or 0):.2f}."
            cur.close()
            conn.close()
        except Exception:
            pass
        return (
            f"过去 {days} 天决策统计: 共 {report['total_decisions']} 条, "
            f"盈利 {report['profit']} 条, 亏损 {report['loss']} 条, "
            f"准确率 {report['accuracy_pct']}%。"
            f"盈利决策平均信心度 {report['avg_confidence_win']}, "
            f"亏损决策平均信心度 {report['avg_confidence_lose']}。"
            f"{pnl_summary}"
        )
