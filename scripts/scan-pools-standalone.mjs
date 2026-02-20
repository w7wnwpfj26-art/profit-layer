/**
 * 独立池子扫描脚本 - 直接从 DefiLlama 拉数据写入 Supabase
 * 无需 Redis，可单独运行
 *
 * Usage: node scripts/scan-pools-standalone.mjs
 */

import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'defi_yield',
  user: process.env.POSTGRES_USER || 'defi',
  password: process.env.POSTGRES_PASSWORD || 'change_me_in_production',
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 5,
});

// 配置
const MIN_TVL_USD = 100_000;
const MIN_APR_PCT = 1.0;
const MAX_APR_PCT = 500; // 过滤异常高 APR

// DefiLlama 链名映射
const CHAIN_MAP = {
  'Ethereum': 'ethereum',
  'Arbitrum': 'arbitrum',
  'Polygon': 'polygon',
  'BSC': 'bsc',
  'Base': 'base',
  'Optimism': 'optimism',
  'Avalanche': 'avalanche',
  'Solana': 'solana',
  'Aptos': 'aptos',
};

// 支持的链 (必须与 chains 表一致)
const SUPPORTED_CHAINS = new Set([
  'ethereum', 'arbitrum', 'polygon', 'bsc', 'base', 'optimism', 'avalanche', 'solana', 'aptos'
]);

async function fetchDefiLlamaPools() {
  console.log('📡 正在从 DefiLlama 获取池子数据...');
  const res = await fetch('https://yields.llama.fi/pools');
  const json = await res.json();

  if (!json.data || !Array.isArray(json.data)) {
    throw new Error('DefiLlama API 返回格式异常');
  }

  console.log(`  获取到 ${json.data.length} 个池子`);
  return json.data;
}

function mapChain(defillamaChain) {
  return CHAIN_MAP[defillamaChain] || defillamaChain?.toLowerCase().replace(/\s+/g, '_');
}

function computeHealthScore(p) {
  let score = 50;

  // TVL 评分 (0-25)
  if (p.tvlUsd > 100_000_000) score += 25;
  else if (p.tvlUsd > 10_000_000) score += 20;
  else if (p.tvlUsd > 1_000_000) score += 15;
  else if (p.tvlUsd > 500_000) score += 10;
  else score += 5;

  // APR 稳定性 (0-15)
  if (p.apyMean30d && p.apy) {
    const ratio = Math.abs(p.apy - p.apyMean30d) / Math.max(p.apyMean30d, 1);
    if (ratio < 0.1) score += 15;
    else if (ratio < 0.3) score += 10;
    else if (ratio < 0.5) score += 5;
  }

  // IL 风险扣分
  if (p.ilRisk === 'yes') score -= 10;

  // 异常值扣分
  if (p.outlier === true) score -= 15;

  return Math.max(0, Math.min(100, score));
}

async function upsertProtocols(client, protocols) {
  console.log(`📦 写入 ${protocols.size} 个协议...`);
  let count = 0;
  let errors = 0;

  // protocol_id 全局唯一，同一协议多链只取第一个遇到的链
  const seen = new Set();
  for (const [key, proto] of protocols) {
    if (seen.has(proto.protocolId)) continue;
    seen.add(proto.protocolId);
    try {
      await client.query(`
        INSERT INTO protocols (protocol_id, chain_id, name, category, website_url, tvl_usd)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (protocol_id) DO UPDATE SET
          tvl_usd = GREATEST(protocols.tvl_usd, EXCLUDED.tvl_usd),
          updated_at = NOW()
      `, [proto.protocolId, proto.chain, proto.name, proto.category || 'yield', '', proto.tvl || 0]);
      count++;
    } catch (e) {
      errors++;
      if (errors <= 3) console.warn(`  ⚠ 协议写入失败: ${proto.protocolId} - ${e.message}`);
    }
  }
  console.log(`  ✓ 写入 ${count} 个协议${errors > 0 ? `, ${errors} 个失败` : ''}`);
}

async function upsertPools(client, pools) {
  console.log(`🏊 写入 ${pools.length} 个池子...`);
  let count = 0;
  let errors = 0;

  for (const p of pools) {
    try {
      await client.query(`
        INSERT INTO pools (
          pool_id, protocol_id, chain_id, symbol, tokens,
          tvl_usd, apr_base, apr_reward, apr_total,
          volume_24h_usd, health_score, is_active, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12)
        ON CONFLICT (pool_id) DO UPDATE SET
          tvl_usd = EXCLUDED.tvl_usd,
          apr_base = EXCLUDED.apr_base,
          apr_reward = EXCLUDED.apr_reward,
          apr_total = EXCLUDED.apr_total,
          volume_24h_usd = EXCLUDED.volume_24h_usd,
          health_score = EXCLUDED.health_score,
          is_active = true,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `, [
        p.poolId,
        p.protocolId,
        p.chain,
        p.symbol,
        JSON.stringify(p.tokens || []),
        p.tvlUsd,
        p.aprBase,
        p.aprReward,
        p.aprTotal,
        p.volume24h || 0,
        p.healthScore,
        JSON.stringify({
          ilRisk: p.ilRisk,
          exposure: p.exposure,
          stablecoin: p.stablecoin,
          apyMean30d: p.apyMean30d,
          apyPct1D: p.apyPct1D,
          apyPct7D: p.apyPct7D,
          apyPct30D: p.apyPct30D,
        }),
      ]);
      count++;
    } catch (e) {
      errors++;
      if (errors <= 3) console.warn(`  ⚠ 写入失败: ${p.poolId} - ${e.message}`);
    }
  }

  console.log(`  ✓ 写入 ${count} 个池子${errors > 0 ? `, ${errors} 个失败` : ''}`);
  return count;
}

async function insertSnapshots(client, pools) {
  console.log(`📸 写入池子快照...`);
  let count = 0;

  for (const p of pools) {
    try {
      await client.query(`
        INSERT INTO pool_snapshots (time, pool_id, tvl_usd, apr_base, apr_reward, apr_total, volume_24h_usd)
        VALUES (NOW(), $1, $2, $3, $4, $5, $6)
      `, [p.poolId, p.tvlUsd, p.aprBase, p.aprReward, p.aprTotal, p.volume24h || 0]);
      count++;
    } catch (e) {
      // 忽略快照写入错误
    }
  }
  console.log(`  ✓ 写入 ${count} 条快照`);
}

async function main() {
  console.log('🚀 独立池子扫描启动');
  console.log(`  最低 TVL: $${MIN_TVL_USD.toLocaleString()}`);
  console.log(`  APR 范围: ${MIN_APR_PCT}% - ${MAX_APR_PCT}%`);
  console.log(`  支持链: ${[...SUPPORTED_CHAINS].join(', ')}`);
  console.log('');

  try {
    // 1. 从 DefiLlama 获取数据
    const rawPools = await fetchDefiLlamaPools();

    // 2. 过滤和转换
    const protocols = new Map();
    const filteredPools = [];

    for (const p of rawPools) {
      const chain = mapChain(p.chain);
      if (!SUPPORTED_CHAINS.has(chain)) continue;
      if ((p.tvlUsd || 0) < MIN_TVL_USD) continue;

      const aprTotal = p.apy || 0;
      if (aprTotal < MIN_APR_PCT || aprTotal > MAX_APR_PCT) continue;

      const aprBase = p.apyBase || 0;
      const aprReward = p.apyReward || 0;

      // 收集协议
      const protoKey = `${p.project}_${chain}`;
      if (!protocols.has(protoKey)) {
        protocols.set(protoKey, {
          protocolId: p.project,
          chain,
          name: p.project,
          category: p.category || 'yield',
          tvl: p.tvlUsd || 0,
        });
      } else {
        protocols.get(protoKey).tvl += (p.tvlUsd || 0);
      }

      filteredPools.push({
        poolId: p.pool,
        protocolId: p.project,
        chain,
        symbol: p.symbol || '',
        tokens: p.underlyingTokens || [],
        tvlUsd: p.tvlUsd || 0,
        aprBase,
        aprReward,
        aprTotal,
        volume24h: p.volumeUsd1d || 0,
        healthScore: computeHealthScore(p),
        ilRisk: p.ilRisk || 'no',
        exposure: p.exposure || 'single',
        stablecoin: p.stablecoin || false,
        apyMean30d: p.apyMean30d || 0,
        apyPct1D: p.apyPct1D || 0,
        apyPct7D: p.apyPct7D || 0,
        apyPct30D: p.apyPct30D || 0,
      });
    }

    console.log(`\n📊 过滤结果: ${rawPools.length} → ${filteredPools.length} 个池子, ${protocols.size} 个协议`);

    // 按链统计
    const chainStats = {};
    for (const p of filteredPools) {
      chainStats[p.chain] = (chainStats[p.chain] || 0) + 1;
    }
    console.log('  各链分布:', Object.entries(chainStats).map(([k,v]) => `${k}:${v}`).join(', '));

    // 3. 写入数据库
    console.log('\n💾 写入 Supabase...');
    const client = await pool.connect();

    try {
      await upsertProtocols(client, protocols);
      const poolCount = await upsertPools(client, filteredPools);
      await insertSnapshots(client, filteredPools);

      // 4. 验证
      const verify = await client.query('SELECT COUNT(*) as c FROM pools WHERE is_active = true');
      const protoVerify = await client.query('SELECT COUNT(*) as c FROM protocols');

      console.log(`\n✅ 扫描完成!`);
      console.log(`  pools 表: ${verify.rows[0].c} 条活跃记录`);
      console.log(`  protocols 表: ${protoVerify.rows[0].c} 条记录`);
    } finally {
      client.release();
    }

  } catch (e) {
    console.error('❌ 扫描失败:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
