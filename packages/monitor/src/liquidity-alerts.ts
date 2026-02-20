import pg from 'pg';
import { createLogger } from '@defi-yield/common';

const logger = createLogger('monitor:liquidity');

// 配置
const THRESHOLD_DROP_PCT = 30; // TVL 24h 降幅超过 30% 告警
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5分钟检查一次
const WEBHOOK_URL = process.env.LIQUIDITY_ALERT_WEBHOOK || '';

interface PoolSnapshot {
  pool_id: string;
  tvl_usd: number;
  tvl_24h_ago: number;
  timestamp: Date;
}

async function checkLiquidity() {
  const client = new pg.Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'defi_yield',
    user: process.env.POSTGRES_USER || 'defi',
    password: process.env.POSTGRES_PASSWORD || 'change_me_in_production',
    ssl: (process.env.POSTGRES_HOST || '').includes('supabase') 
      ? { rejectUnauthorized: false } 
      : undefined,
  });

  try {
    await client.connect();

    // 查询池子当前 TVL 和 24h 前 TVL
    const result = await client.query(`
      SELECT 
        p.pool_id,
        p.tvl_usd as current_tvl,
        ps.tvl_usd as tvl_24h_ago
      FROM pools p
      LEFT JOIN pool_snapshots ps ON p.pool_id = ps.pool_id 
        AND ps.timestamp >= NOW() - INTERVAL '24 hours'
        AND ps.timestamp = (
          SELECT MIN(timestamp) 
          FROM pool_snapshots 
          WHERE pool_id = p.pool_id 
          AND timestamp >= NOW() - INTERVAL '24 hours'
        )
      WHERE p.tvl_usd > 10000  -- 只监控大池子
    `);

    const alerts: string[] = [];

    for (const row of result.rows) {
      if (!row.tvl_24h_ago || row.tvl_24h_ago <= 0) continue;

      const dropPct = ((row.tvl_24h_ago - row.current_tvl) / row.tvl_24h_ago) * 100;
      
      if (dropPct >= THRESHOLD_DROP_PCT) {
        alerts.push(
          `🔴 **[${row.pool_id}]** TVL 24h 降幅 **${dropPct.toFixed(1)}%**\n` +
          `当前: $${row.current_tvl.toLocaleString()}\n` +
          `24h前: $${row.tvl_24h_ago.toLocaleString()}`
        );
        
        logger.warn('流动性风险告警', {
          poolId: row.pool_id,
          currentTvl: row.current_tvl,
          tvl24hAgo: row.tvl_24h_ago,
          dropPct,
        });
      }
    }

    // 发送告警
    if (alerts.length > 0 && WEBHOOK_URL) {
      const message = `## 🚨 流动性风险告警\n\n${alerts.join('\n\n')}`;
      
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message }),
      }).catch(err => {
        logger.error('发送告警失败', { error: err.message });
      });
    }

    if (alerts.length === 0) {
      logger.info('✅ 所有池子流动性正常');
    }

  } catch (err) {
    logger.error('流动性检查失败', { error: (err as Error).message });
  } finally {
    await client.end();
  }
}

// 定时执行
async function startMonitor() {
  logger.info('🚀 流动性监控启动', {
    threshold: `${THRESHOLD_DROP_PCT}%`,
    interval: `${CHECK_INTERVAL_MS / 1000 / 60}分钟`,
  });

  await checkLiquidity(); // 立即执行一次
  
  setInterval(checkLiquidity, CHECK_INTERVAL_MS);
}

// 单次执行模式
if (process.argv.includes('--once')) {
  checkLiquidity().then(() => process.exit(0));
} else {
  startMonitor().catch(err => {
    logger.error('监控启动失败', { error: err.message });
    process.exit(1);
  });
}
