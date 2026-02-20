"""
Alpha 信号扫描器

信号源:
1. TVL 动量: 从 pool_snapshots 计算加速流入的池子
2. 新池发现: 最近 24h 新上线的高 TVL 池子
3. 鲸鱼活动: 单池 TVL 24h 变化超过 20% 的异常信号
"""

import os
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import psycopg2

logger = logging.getLogger(__name__)


@dataclass
class AlphaSignal:
    signal_type: str       # "tvl_momentum" | "new_pool" | "whale_activity"
    pool_id: str
    symbol: str
    protocol_id: str
    chain: str
    description: str       # 中文描述
    strength: float        # 信号强度 0-1
    data: dict = field(default_factory=dict)  # 附加数据
    timestamp: str = ""


class AlphaScanner:

    def _get_conn(self):
        return psycopg2.connect(
            host=os.getenv("POSTGRES_HOST", "localhost"),
            port=int(os.getenv("POSTGRES_PORT", "5433")),
            dbname=os.getenv("POSTGRES_DB", "defi_yield"),
            user=os.getenv("POSTGRES_USER", "defi"),
            password=os.getenv("POSTGRES_PASSWORD", ""),
        )

    def detect_tvl_momentum(self, min_tvl: float = 500_000, top_n: int = 10) -> list[AlphaSignal]:
        """检测 TVL 加速流入的池子（24h 变化率排名前 N）"""
        signals = []
        try:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("""
                WITH latest AS (
                    SELECT pool_id, tvl_usd as current_tvl
                    FROM pool_snapshots
                    WHERE time > NOW() - INTERVAL '1 hour'
                    AND tvl_usd > %s
                ),
                past AS (
                    SELECT pool_id, AVG(tvl_usd) as avg_tvl_24h
                    FROM pool_snapshots
                    WHERE time BETWEEN NOW() - INTERVAL '25 hours' AND NOW() - INTERVAL '23 hours'
                    GROUP BY pool_id
                )
                SELECT l.pool_id, l.current_tvl, p.avg_tvl_24h,
                       ((l.current_tvl - p.avg_tvl_24h) / NULLIF(p.avg_tvl_24h, 0) * 100) as change_pct,
                       pl.symbol, pl.protocol_id, pl.chain_id
                FROM latest l
                JOIN past p ON l.pool_id = p.pool_id
                JOIN pools pl ON l.pool_id = pl.pool_id
                WHERE p.avg_tvl_24h > 0
                AND ((l.current_tvl - p.avg_tvl_24h) / p.avg_tvl_24h * 100) > 10
                ORDER BY change_pct DESC
                LIMIT %s
            """, (min_tvl, top_n))

            for row in cur.fetchall():
                pool_id, current, past_avg, change, symbol, protocol, chain = row
                signals.append(AlphaSignal(
                    signal_type="tvl_momentum",
                    pool_id=pool_id,
                    symbol=symbol or pool_id[:12],
                    protocol_id=protocol or "",
                    chain=chain or "",
                    description=f"TVL 24h 增长 {change:.1f}%，从 ${past_avg/1e6:.1f}M → ${current/1e6:.1f}M，资金加速流入",
                    strength=min(1.0, abs(change) / 100),
                    data={"current_tvl": float(current), "change_pct": float(change)},
                    timestamp=datetime.now(timezone.utc).isoformat(),
                ))
            cur.close()
            conn.close()
        except Exception as e:
            logger.warning(f"TVL 动量检测失败: {e}")
        return signals

    def detect_new_opportunities(self, min_tvl: float = 100_000) -> list[AlphaSignal]:
        """发现最近 24h 新上线的高 TVL 池子"""
        signals = []
        try:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("""
                SELECT pool_id, symbol, protocol_id, chain_id, tvl_usd, apr_total, health_score, created_at
                FROM pools
                WHERE created_at > NOW() - INTERVAL '24 hours'
                AND tvl_usd > %s
                AND is_active = true
                ORDER BY tvl_usd DESC
                LIMIT 10
            """, (min_tvl,))

            for row in cur.fetchall():
                pool_id, symbol, protocol, chain, tvl, apr, health, created = row
                signals.append(AlphaSignal(
                    signal_type="new_pool",
                    pool_id=pool_id,
                    symbol=symbol or "",
                    protocol_id=protocol or "",
                    chain=chain or "",
                    description=f"新池上线: TVL ${float(tvl)/1e6:.1f}M, APR {float(apr):.1f}%, 健康分 {float(health or 0):.0f}",
                    strength=min(1.0, float(tvl) / 5_000_000),
                    data={"tvl_usd": float(tvl), "apr_total": float(apr), "health_score": float(health or 0)},
                    timestamp=datetime.now(timezone.utc).isoformat(),
                ))
            cur.close()
            conn.close()
        except Exception as e:
            logger.warning(f"新池发现失败: {e}")
        return signals

    def detect_whale_activity(self, threshold_pct: float = 20) -> list[AlphaSignal]:
        """检测单池 TVL 突然暴增/暴跌（可能是大户进出）"""
        signals = []
        try:
            conn = self._get_conn()
            cur = conn.cursor()
            cur.execute("""
                WITH recent AS (
                    SELECT pool_id, tvl_usd as recent_tvl
                    FROM pool_snapshots
                    WHERE time > NOW() - INTERVAL '2 hours'
                ),
                older AS (
                    SELECT pool_id, AVG(tvl_usd) as older_tvl
                    FROM pool_snapshots
                    WHERE time BETWEEN NOW() - INTERVAL '26 hours' AND NOW() - INTERVAL '22 hours'
                    GROUP BY pool_id
                    HAVING AVG(tvl_usd) > 200000
                )
                SELECT r.pool_id, r.recent_tvl, o.older_tvl,
                       ((r.recent_tvl - o.older_tvl) / NULLIF(o.older_tvl, 0) * 100) as change_pct,
                       pl.symbol, pl.protocol_id, pl.chain_id
                FROM recent r
                JOIN older o ON r.pool_id = o.pool_id
                JOIN pools pl ON r.pool_id = pl.pool_id
                WHERE ABS((r.recent_tvl - o.older_tvl) / NULLIF(o.older_tvl, 0) * 100) > %s
                ORDER BY ABS(change_pct) DESC
                LIMIT 15
            """, (threshold_pct,))

            for row in cur.fetchall():
                pool_id, recent, older, change, symbol, protocol, chain = row
                direction = "流入" if change > 0 else "流出"
                emoji = "鲸鱼买入" if change > 0 else "鲸鱼卖出"
                signals.append(AlphaSignal(
                    signal_type="whale_activity",
                    pool_id=pool_id,
                    symbol=symbol or pool_id[:12],
                    protocol_id=protocol or "",
                    chain=chain or "",
                    description=f"疑似{emoji}: TVL 24h {direction} {abs(change):.1f}%，变化 ${abs(float(recent)-float(older))/1e6:.2f}M",
                    strength=min(1.0, abs(change) / 50),
                    data={"change_pct": float(change), "recent_tvl": float(recent), "older_tvl": float(older)},
                    timestamp=datetime.now(timezone.utc).isoformat(),
                ))
            cur.close()
            conn.close()
        except Exception as e:
            logger.warning(f"鲸鱼活动检测失败: {e}")
        return signals

    def get_alpha_signals(self) -> list[AlphaSignal]:
        """获取所有 Alpha 信号（合并去重排序）"""
        all_signals = []
        all_signals.extend(self.detect_tvl_momentum())
        all_signals.extend(self.detect_new_opportunities())
        all_signals.extend(self.detect_whale_activity())

        # 按强度排序
        all_signals.sort(key=lambda s: s.strength, reverse=True)
        logger.info(f"Alpha 扫描完成: {len(all_signals)} 个信号 (动量 {sum(1 for s in all_signals if s.signal_type=='tvl_momentum')}, 新池 {sum(1 for s in all_signals if s.signal_type=='new_pool')}, 鲸鱼 {sum(1 for s in all_signals if s.signal_type=='whale_activity')})")
        return all_signals[:20]  # 最多返回 20 个
