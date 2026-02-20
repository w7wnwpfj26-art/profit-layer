// ============================================
// 从 DefiLlama 拉取真实数据写入数据库
// 运行: npx tsx scripts/seed-real-data.ts
// ============================================

import pg from "pg";

const DB = {
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5433"),
  database: process.env.POSTGRES_DB || "defi_yield",
  user: process.env.POSTGRES_USER || "defi",
  password: process.env.POSTGRES_PASSWORD || "change_me_in_production",
};

const DEFILLAMA_CHAIN_MAP: Record<string, string> = {
  Ethereum: "ethereum", Arbitrum: "arbitrum", BSC: "bsc",
  Polygon: "polygon", Base: "base", Optimism: "optimism",
  Avalanche: "avalanche", Aptos: "aptos", Solana: "solana", Sui: "sui",
};

const SUPPORTED_CHAINS = new Set(Object.values(DEFILLAMA_CHAIN_MAP));

async function main() {
  console.log("连接数据库...");
  const pool = new pg.Pool(DB);
  await pool.query("SELECT 1");
  console.log("数据库连接成功");

  // ---- 1. 拉取全部池子 ----
  console.log("\n从 DefiLlama 获取全球 DeFi 池子数据...");
  const res = await fetch("https://yields.llama.fi/pools");
  const json = await res.json() as { data: any[] };
  console.log(`获取到 ${json.data.length} 个原始池子`);

  // 筛选：TVL > $50k, APR > 0.5%, 支持的链
  const filtered = json.data.filter((p: any) => {
    const chain = DEFILLAMA_CHAIN_MAP[p.chain];
    if (!chain) return false;
    if (p.tvlUsd < 50000) return false;
    if ((p.apy || 0) < 0.5) return false;
    return true;
  });

  console.log(`筛选后 ${filtered.length} 个池子（TVL>$50k, APR>0.5%）`);

  // ---- 2. 确保协议存在 ----
  console.log("\n写入协议数据...");
  const protocolSet = new Set<string>();

  for (const p of filtered) {
    const chain = DEFILLAMA_CHAIN_MAP[p.chain];
    const key = p.project;
    if (protocolSet.has(key)) continue;
    protocolSet.add(key);

    await pool.query(
      `INSERT INTO protocols (protocol_id, name, category, chain_id, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (protocol_id) DO UPDATE SET updated_at = NOW()`,
      [p.project, p.project, "dex", chain]
    ).catch(() => {});
  }
  console.log(`写入 ${protocolSet.size} 个协议`);

  // ---- 3. 写入池子 ----
  console.log("\n写入池子数据...");
  let inserted = 0;
  let errors = 0;

  for (const p of filtered) {
    const chain = DEFILLAMA_CHAIN_MAP[p.chain];
    try {
      await pool.query(
        `INSERT INTO pools (
          pool_id, protocol_id, chain_id, symbol, tokens,
          pool_type, tvl_usd, apr_base, apr_reward, apr_total,
          volume_24h_usd, is_active, metadata, last_scanned_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, NOW(), NOW())
        ON CONFLICT (pool_id) DO UPDATE SET
          tvl_usd = EXCLUDED.tvl_usd,
          apr_base = EXCLUDED.apr_base,
          apr_reward = EXCLUDED.apr_reward,
          apr_total = EXCLUDED.apr_total,
          volume_24h_usd = EXCLUDED.volume_24h_usd,
          metadata = EXCLUDED.metadata,
          last_scanned_at = NOW(),
          updated_at = NOW()`,
        [
          p.pool,
          p.project,
          chain,
          p.symbol,
          JSON.stringify((p.underlyingTokens || []).map((t: string) => ({ address: t, symbol: "", decimals: 18 }))),
          null,
          p.tvlUsd || 0,
          p.apyBase || 0,
          p.apyReward || 0,
          p.apy || 0,
          p.volumeUsd1d || 0,
          JSON.stringify({
            stablecoin: p.stablecoin,
            ilRisk: p.ilRisk,
            exposure: p.exposure,
            poolMeta: p.poolMeta,
            apyPct1D: p.apyPct1D,
            apyPct7D: p.apyPct7D,
            apyPct30D: p.apyPct30D,
            apyMean30d: p.apyMean30d,
            mu: p.mu,
            sigma: p.sigma,
            outlier: p.outlier,
            il7d: p.il7d,
            rewardTokens: p.rewardTokens,
          }),
        ]
      );
      inserted++;
    } catch (err) {
      errors++;
    }
  }

  console.log(`写入完成: 成功 ${inserted}，失败 ${errors}`);

  // ---- 4. 写入快照 ----
  console.log("\n写入时序快照...");
  let snapshots = 0;
  for (const p of filtered.slice(0, 500)) { // 前500个写快照
    try {
      await pool.query(
        `INSERT INTO pool_snapshots (time, pool_id, tvl_usd, apr_base, apr_reward, apr_total, volume_24h_usd)
         VALUES (NOW(), $1, $2, $3, $4, $5, $6)`,
        [p.pool, p.tvlUsd || 0, p.apyBase || 0, p.apyReward || 0, p.apy || 0, p.volumeUsd1d || 0]
      );
      snapshots++;
    } catch {}
  }
  console.log(`写入 ${snapshots} 条快照`);

  // ---- 5. 统计 ----
  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM pools WHERE is_active = true) AS total_pools,
      (SELECT COUNT(DISTINCT protocol_id) FROM pools) AS total_protocols,
      (SELECT COUNT(DISTINCT chain_id) FROM pools) AS total_chains,
      (SELECT ROUND(SUM(tvl_usd)::numeric, 0) FROM pools) AS total_tvl,
      (SELECT ROUND(AVG(apr_total)::numeric, 2) FROM pools WHERE apr_total > 0) AS avg_apr,
      (SELECT ROUND(MAX(apr_total)::numeric, 2) FROM pools) AS max_apr
  `);

  const s = stats.rows[0];
  console.log("\n========== 数据库统计 ==========");
  console.log(`池子总数:     ${s.total_pools}`);
  console.log(`协议总数:     ${s.total_protocols}`);
  console.log(`链总数:       ${s.total_chains}`);
  console.log(`总锁仓量:     $${Number(s.total_tvl).toLocaleString()}`);
  console.log(`平均年化:     ${s.avg_apr}%`);
  console.log(`最高年化:     ${s.max_apr}%`);

  // Top 10
  const top10 = await pool.query(`
    SELECT symbol, protocol_id, chain_id, apr_total, tvl_usd
    FROM pools WHERE is_active = true
    ORDER BY apr_total DESC LIMIT 10
  `);
  console.log("\n========== Top 10 年化池子 ==========");
  for (const r of top10.rows) {
    console.log(`  ${r.symbol.padEnd(25)} ${r.protocol_id.padEnd(20)} ${r.chain_id.padEnd(12)} APR: ${Number(r.apr_total).toFixed(1)}%   TVL: $${Number(r.tvl_usd).toLocaleString()}`);
  }

  await pool.end();
  console.log("\n完成！");
}

main().catch((err) => { console.error("失败:", err); process.exit(1); });
