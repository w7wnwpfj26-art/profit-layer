"""
Strategy Worker - BullMQ Consumer

Processes strategy computation jobs from the scanner.
Generates execution signals and publishes them.
"""

import json
import asyncio
import logging
import os
from datetime import datetime, timezone

import redis
import psycopg2
from bullmq import Worker, Job

from ..strategies.yield_farming import YieldFarmingStrategy
from ..strategies.lending_arb import LendingArbStrategy
from ..strategies.staking import LiquidStakingStrategy
from ..models.ai_advisor import AIAdvisor, MarketContext

logger = logging.getLogger(__name__)

# Queue/Job names (must match TypeScript side)
STRATEGY_QUEUE = "strategy-compute"
EXECUTE_QUEUE = "execute-tx"
ALERTS_QUEUE = "alerts"

# 单池健康分阈值（0=忽略）
MIN_HEALTH_SCORE = 0

# 冷钱包模式（通过 OKX 钱包签名而不是后端私钥）
USE_COLD_WALLET = os.getenv("USE_COLD_WALLET", "false").lower() == "true"


def get_db_connection():
    """Get a PostgreSQL connection."""
    host = os.getenv("POSTGRES_HOST", "localhost")
    return psycopg2.connect(
        host=host,
        port=int(os.getenv("POSTGRES_PORT", "5433")),
        dbname=os.getenv("POSTGRES_DB", "defi_yield"),
        user=os.getenv("POSTGRES_USER", "defi"),
        password=os.getenv("POSTGRES_PASSWORD", ""),
        sslmode="require" if "supabase" in host else "prefer",
    )


def get_redis_client():
    """Get a Redis client."""
    return redis.Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        decode_responses=True,
    )


def get_config_from_db() -> dict:
    """Read system_config from DB."""
    config = {
        "total_capital_usd": 10000,
        "compound_interval_hr": 6,
        "max_risk_score": 60,
    }
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT key, value FROM system_config")
        for key, value in cur.fetchall():
            config[key] = value
        cur.close()
        conn.close()
    except Exception as e:
        logger.warning(f"Failed to read config from DB: {e}")
    return config


def dispatch_signal(signal_data: dict):
    """
    分发信号：
    - 冷钱包模式：插入 pending_signatures 表，等待 OKX 钱包签名
    - 普通模式：发送到 Redis 队列，由 Executor 直接执行
    """
    if USE_COLD_WALLET:
        # 冷钱包模式：插入数据库等待签名
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO pending_signatures (chain_id, tx_type, amount_usd, payload, status)
                VALUES (%s, %s, %s, %s, 'pending')
            """, (
                signal_data.get("chain", "ethereum"),
                signal_data.get("action", "enter"),
                signal_data.get("amountUsd", 0),
                json.dumps(signal_data),
            ))
            conn.commit()
            cur.close()
            conn.close()
            logger.info(f"冷钱包信号已入队: {signal_data.get('signalId')} -> pending_signatures")
        except Exception as e:
            logger.error(f"插入冷钱包队列失败: {e}")
    else:
        # 普通模式：发送到 Redis
        r = get_redis_client()
        r.xadd(f"bull:{EXECUTE_QUEUE}:events", {"data": json.dumps(signal_data)})
        r.close()
        logger.info(f"信号已发送到 Redis: {signal_data.get('signalId')} -> {EXECUTE_QUEUE}")


def get_active_positions() -> list[dict]:
    """Read active positions from DB."""
    positions = []
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT position_id, pool_id, chain_id, strategy_id, value_usd,
                   unrealized_pnl_usd, opened_at
            FROM positions WHERE status = 'active'
        """)
        for row in cur.fetchall():
            positions.append({
                "positionId": row[0],
                "poolId": row[1],
                "chain": row[2],
                "strategyId": row[3],
                "valueUsd": float(row[4]),
                "unrealizedPnlUsd": float(row[5]),
                "openedAt": row[6].isoformat() if row[6] else "",
            })
        cur.close()
        conn.close()
    except Exception as e:
        logger.warning(f"Failed to read positions: {e}")
    return positions


async def process_strategy_job(job: Job, token: str | None = None):
    """Process a strategy computation job."""
    data = job.data
    job_type = data.get("type", "")
    timestamp = data.get("timestamp", "")

    logger.info(f"Processing strategy job: type={job_type}, timestamp={timestamp}")

    if job_type == "optimize":
        await handle_optimize(data)
    elif job_type == "rebalance":
        await handle_rebalance(data)
    elif job_type == "compound_check":
        await handle_compound_check(data)
    else:
        logger.warning(f"Unknown job type: {job_type}")


async def handle_optimize(data: dict):
    """Run portfolio optimization on new pool data."""
    raw_pools = data.get("poolData", [])
    min_apr = float(get_config_from_db().get("min_apr_total", 1000))
    pool_data = [
        p for p in raw_pools
        if (p.get("healthScore") is None or p.get("healthScore") >= MIN_HEALTH_SCORE)
        and p.get("aprTotal", 0) >= min_apr
    ]
    if not pool_data:
        logger.info("No pool data to optimize (after apr/health filter)")
        return
    if len(pool_data) < len(raw_pools):
        logger.info(
            f"Filter: {len(raw_pools)} -> {len(pool_data)} pools (min_apr>={min_apr}, health>={MIN_HEALTH_SCORE})"
        )
    logger.info(f"Optimizing with {len(pool_data)} pools")

    config = get_config_from_db()
    total_capital = float(config.get("total_capital_usd", 50000))
    current_positions = get_active_positions()

    yield_strategy = YieldFarmingStrategy()

    pools = []
    for p in pool_data:
        pools.append({
            "poolId": p.get("poolId", ""),
            "protocolId": p.get("protocolId", ""),
            "chain": p.get("chain", ""),
            "symbol": "",
            "aprTotal": p.get("aprTotal", 0),
            "aprBase": p.get("aprTotal", 0) * 0.7,
            "aprReward": p.get("aprTotal", 0) * 0.3,
            "tvlUsd": p.get("tvlUsd", 0),
            "healthScore": p.get("healthScore"),
            "metadata": {},
        })

    signals = yield_strategy.analyze_pools(
        pools=pools,
        total_capital_usd=total_capital,
        current_positions=current_positions,
    )

    logger.info(f"Generated {len(signals)} strategy signals")

    if signals:
        # AI 顾问审批：每个信号经过 LLM 二次确认
        advisor = AIAdvisor()
        context = MarketContext(
            total_pools=len(pool_data),
            portfolio_value_usd=total_capital,
        )

        approved_count = 0

        for signal in signals[:5]:
            signal_data = {
                "signalId": signal.signal_id,
                "strategyId": signal.strategy_id,
                "action": signal.action,
                "poolId": signal.pool_id,
                "chain": signal.chain,
                "protocolId": signal.protocol_id,
                "amountUsd": signal.amount_usd,
                "params": {},
                "timestamp": signal.timestamp,
            }

            # AI 审批（如果配置了 API Key）
            try:
                eval_result = await advisor.evaluate_signal(signal_data, context)
                if not eval_result.get("approved", True):
                    logger.info(
                        f"AI 驳回信号 {signal.signal_id}: {eval_result.get('reason', '未知原因')}"
                    )
                    continue
                signal_data["params"]["ai_confidence"] = eval_result.get("confidence", 0)
                signal_data["params"]["ai_reason"] = eval_result.get("reason", "")
            except Exception as e:
                logger.warning(f"AI 审批异常，默认通过: {e}")

            # 分发信号（根据 USE_COLD_WALLET 配置决定走冷钱包还是 Redis）
            dispatch_signal(signal_data)
            approved_count += 1

        logger.info(f"AI 审批结果: {approved_count}/{len(signals[:5])} 信号通过")
        if USE_COLD_WALLET:
            logger.info("冷钱包模式已启用，请在 Dashboard 开启「冷钱包自动化桥接」签名")


async def handle_rebalance(data: dict):
    """Check if positions need rebalancing and generate rebalance signals."""
    logger.info("Running rebalance check")

    config = get_config_from_db()
    rebalance_threshold_pct = float(config.get("rebalance_threshold_pct", "20"))
    positions = get_active_positions()

    if not positions:
        logger.info("No active positions to rebalance")
        return

    # 从数据库获取最新池子数据
    pool_data = {}
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        pool_ids = [p["poolId"] for p in positions]
        placeholders = ",".join(["%s"] * len(pool_ids))
        cur.execute(
            f"SELECT pool_id, apr_total, tvl_usd, health_score FROM pools WHERE pool_id IN ({placeholders})",
            pool_ids,
        )
        for row in cur.fetchall():
            pool_data[row[0]] = {
                "aprTotal": float(row[1]),
                "tvlUsd": float(row[2]),
                "healthScore": float(row[3]) if row[3] else None,
            }
        cur.close()
        conn.close()
    except Exception as e:
        logger.error(f"Failed to fetch pool data for rebalance: {e}")
        return

    total_value = sum(p["valueUsd"] for p in positions)
    if total_value <= 0:
        return

    signals = []

    for pos in positions:
        pool_id = pos["poolId"]
        current_pct = (pos["valueUsd"] / total_value) * 100
        pool_info = pool_data.get(pool_id, {})

        # 检查：健康分下降到阈值以下 → 退出
        health = pool_info.get("healthScore")
        if health is not None and health < MIN_HEALTH_SCORE:
            signal = {
                "signalId": f"rebal-exit-{pool_id}-{datetime.now(timezone.utc).timestamp():.0f}",
                "strategyId": pos.get("strategyId", "yield_farming_v1"),
                "action": "exit",
                "poolId": pool_id,
                "chain": pos["chain"],
                "protocolId": "",
                "amountUsd": pos["valueUsd"],
                "params": {"reason": f"health_score={health:.0f} < {MIN_HEALTH_SCORE}"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            dispatch_signal(signal)
            signals.append(signal)
            logger.info(f"Rebalance: EXIT {pool_id} (health={health:.0f})")
            continue

        # 检查：APR 大幅下降 → 减仓
        apr = pool_info.get("aprTotal", 0)
        if apr < 1.0 and pos["valueUsd"] > 100:
            signal = {
                "signalId": f"rebal-reduce-{pool_id}-{datetime.now(timezone.utc).timestamp():.0f}",
                "strategyId": pos.get("strategyId", "yield_farming_v1"),
                "action": "decrease",
                "poolId": pool_id,
                "chain": pos["chain"],
                "protocolId": "",
                "amountUsd": pos["valueUsd"] * 0.5,
                "params": {"reason": f"apr_dropped_to={apr:.2f}%"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            dispatch_signal(signal)
            signals.append(signal)
            logger.info(f"Rebalance: DECREASE {pool_id} 50% (apr={apr:.2f}%)")

    logger.info(f"Rebalance check complete: {len(signals)} signals generated")


async def handle_compound_check(data: dict):
    """Check if positions are ready for compounding (harvest + re-invest)."""
    logger.info("Running compound check")

    config = get_config_from_db()
    compound_interval_hr = float(config.get("compound_interval_hr", "6"))
    positions = get_active_positions()

    if not positions:
        logger.info("No active positions to compound")
        return

    now = datetime.now(timezone.utc)
    signals = []

    # 查最近一次 compound 时间
    last_compound_map = {}
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT pool_id, MAX(created_at) as last_compound
            FROM transactions
            WHERE tx_type IN ('compound', 'harvest')
            GROUP BY pool_id
        """)
        for row in cur.fetchall():
            last_compound_map[row[0]] = row[1]
        cur.close()
        conn.close()
    except Exception as e:
        logger.warning(f"Failed to fetch last compound times: {e}")

    for pos in positions:
        pool_id = pos["poolId"]
        last_compound = last_compound_map.get(pool_id)

        # 检查是否已超过复投间隔
        should_compound = True
        if last_compound:
            elapsed_hours = (now - last_compound.replace(tzinfo=timezone.utc)).total_seconds() / 3600
            if elapsed_hours < compound_interval_hr:
                should_compound = False

        if should_compound and pos["valueUsd"] >= 10:  # 最低 $10 才值得复投
            signal = {
                "signalId": f"compound-{pool_id}-{now.timestamp():.0f}",
                "strategyId": pos.get("strategyId", "yield_farming_v1"),
                "action": "compound",
                "poolId": pool_id,
                "chain": pos["chain"],
                "protocolId": "",
                "amountUsd": 0,  # Compound 不需要额外资金
                "params": {"reason": "scheduled_compound"},
                "timestamp": now.isoformat(),
            }
            dispatch_signal(signal)
            signals.append(signal)
            logger.info(f"Compound: {pool_id} (value=${pos['valueUsd']:.0f})")

    logger.info(f"Compound check complete: {len(signals)} signals generated")


def start_strategy_worker():
    """Start the BullMQ strategy worker."""
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))

    logger.info(f"Starting strategy worker, connecting to Redis at {redis_host}:{redis_port}")

    worker = Worker(
        STRATEGY_QUEUE,
        process_strategy_job,
        {
            "connection": {"host": redis_host, "port": int(redis_port)},
            "concurrency": 3,
        },
    )

    logger.info("Strategy worker started")
    return worker


if __name__ == "__main__":
    import asyncio
    logging.basicConfig(level=logging.INFO)
    logger.info("Strategy Worker 独立进程启动")
    worker = start_strategy_worker()
    try:
        asyncio.get_event_loop().run_forever()
    except KeyboardInterrupt:
        logger.info("Strategy Worker 关闭")
