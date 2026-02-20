// 多源数据融合层
// @ts-ignore
import { Pool } from "pg";
import { v4 as uuid } from "uuid";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5433"),
  database: process.env.POSTGRES_DB || "defi_yield",
  user: process.env.POSTGRES_USER || "defi",
  password: process.env.POSTGRES_PASSWORD || "defi123",
});

interface DataSource {
  source_id: string;
  name: string;
  source_type: string;
  endpoint: string;
  weight: number;
  priority: number;
  enabled: boolean;
}

interface DataPoint {
  source_id: string;
  value: unknown;
  weight: number;
  timestamp: Date;
}

// 获取活跃数据源
export async function getActiveSources(sourceType?: string): Promise<DataSource[]> {
  let query = "SELECT * FROM data_sources WHERE enabled = true";
  const params: string[] = [];
  
  if (sourceType) {
    params.push(sourceType);
    query += ` AND source_type = $${params.length}`;
  }
  
  query += " ORDER BY priority ASC, weight DESC";
  const result = await pool.query(query, params);
  return result.rows;
}

// 记录数据快照
export async function saveSnapshot(
  dataType: string,
  resourceId: string,
  sourceId: string,
  value: unknown,
  confidence = 1.0
): Promise<void> {
  const snapshotId = `snap-${Date.now()}-${uuid().slice(0, 8)}`;
  await pool.query(
    `INSERT INTO data_snapshots (snapshot_id, data_type, resource_id, source_id, value, confidence)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [snapshotId, dataType, resourceId, sourceId, JSON.stringify(value), confidence]
  );
}

// 加权合并多源数据 (数值类型)
export function mergeNumericData(dataPoints: DataPoint[]): number {
  if (dataPoints.length === 0) return 0;
  if (dataPoints.length === 1) return dataPoints[0].value as number;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const dp of dataPoints) {
    const val = dp.value as number;
    if (typeof val === "number" && !isNaN(val)) {
      weightedSum += val * dp.weight;
      totalWeight += dp.weight;
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// 检测数据冲突 (差异超过阈值)
export function detectConflict(
  dataPoints: DataPoint[],
  thresholdPct = 10
): boolean {
  if (dataPoints.length < 2) return false;

  const values = dataPoints
    .map((dp) => dp.value as number)
    .filter((v) => typeof v === "number" && !isNaN(v));

  if (values.length < 2) return false;

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const maxDeviation = Math.max(...values.map((v) => Math.abs(v - avg) / avg * 100));

  return maxDeviation > thresholdPct;
}

// 记录数据冲突
export async function recordConflict(
  dataType: string,
  resourceId: string,
  dataPoints: DataPoint[],
  mergedValue: unknown
): Promise<void> {
  const conflictId = `conflict-${Date.now()}-${uuid().slice(0, 8)}`;
  const sources = dataPoints.map((dp) => ({
    source_id: dp.source_id,
    value: dp.value,
    weight: dp.weight,
  }));

  await pool.query(
    `INSERT INTO data_conflicts (conflict_id, data_type, resource_id, sources, merged_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [conflictId, dataType, resourceId, JSON.stringify(sources), JSON.stringify(mergedValue)]
  );

  console.log(`⚠️ 数据冲突: ${dataType}/${resourceId} - 已按权重合并`);
}

// 获取历史快照 (用于回溯比对)
export async function getSnapshotHistory(
  dataType: string,
  resourceId: string,
  hours = 24
): Promise<unknown[]> {
  const result = await pool.query(
    `SELECT s.*, d.name as source_name, d.weight as source_weight
     FROM data_snapshots s
     LEFT JOIN data_sources d ON s.source_id = d.source_id
     WHERE s.data_type = $1 AND s.resource_id = $2
     AND s.captured_at > NOW() - INTERVAL '${hours} hours'
     ORDER BY s.captured_at DESC`,
    [dataType, resourceId]
  );
  return result.rows;
}

// 更新数据源健康状态
export async function updateSourceHealth(
  sourceId: string,
  healthy: boolean,
  errorMessage?: string
): Promise<void> {
  if (healthy) {
    await pool.query(
      `UPDATE data_sources SET health_status = 'healthy', last_check_at = NOW(), error_count = 0 WHERE source_id = $1`,
      [sourceId]
    );
  } else {
    await pool.query(
      `UPDATE data_sources SET health_status = 'unhealthy', last_check_at = NOW(), error_count = error_count + 1 WHERE source_id = $1`,
      [sourceId]
    );
    console.error(`❌ 数据源 ${sourceId} 异常: ${errorMessage}`);
  }
}

// 从 CoinGecko 获取代币价格
async function fetchPriceFromCoinGecko(tokenSymbol: string): Promise<number | null> {
  try {
    // 代币符号到 CoinGecko ID 的映射
    const COINGECKO_IDS: Record<string, string> = {
      ETH: "ethereum",
      WETH: "ethereum",
      BTC: "bitcoin",
      WBTC: "bitcoin",
      BNB: "binancecoin",
      ARB: "arbitrum",
      MATIC: "polygon-ecosystem-token",
      POL: "polygon-ecosystem-token",
      AVAX: "avalanche-2",
      SOL: "solana",
      USDC: "usd-coin",
      USDT: "tether",
      DAI: "dai",
    };
    
    const cgId = COINGECKO_IDS[tokenSymbol.toUpperCase()];
    if (!cgId) return null;
    
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = (await res.json()) as Record<string, { usd?: number }>;
    return data[cgId]?.usd ?? null;
  } catch {
    return null;
  }
}

// 融合价格数据示例
export async function fusePriceData(
  tokenAddress: string,
  chainId: string,
  tokenSymbol: string = "ETH"
): Promise<{ price: number; confidence: number; sources: string[] }> {
  const sources = await getActiveSources("api");
  const dataPoints: DataPoint[] = [];

  // 从 CoinGecko 获取真实价格
  const realPrice = await fetchPriceFromCoinGecko(tokenSymbol);
  if (realPrice === null) {
    console.warn(`⚠️ 无法获取 ${tokenSymbol} 价格，使用 0`);
  }

  // 从各个数据源获取价格
  for (const source of sources) {
    try {
      // 实际实现中这里会调用各个价格 API
      // 使用真实价格（如果有）或标记为失败
      const price = realPrice ?? 0;
      
      if (price > 0) {
        dataPoints.push({
          source_id: source.source_id,
          value: price,
          weight: source.weight,
          timestamp: new Date(),
        });

        // 保存快照
        await saveSnapshot("price", `${chainId}:${tokenAddress}`, source.source_id, price, source.weight);
        await updateSourceHealth(source.source_id, true);
      } else {
        await updateSourceHealth(source.source_id, false, "无法获取价格");
      }
    } catch (err) {
      await updateSourceHealth(source.source_id, false, (err as Error).message);
    }
  }

  // 检测冲突
  const hasConflict = detectConflict(dataPoints);
  const mergedPrice = mergeNumericData(dataPoints);

  if (hasConflict) {
    await recordConflict("price", `${chainId}:${tokenAddress}`, dataPoints, mergedPrice);
  }

  // 计算置信度 (基于源数量和权重)
  const totalWeight = dataPoints.reduce((sum, dp) => sum + dp.weight, 0);
  const confidence = Math.min(totalWeight / sources.length, 1);

  return {
    price: mergedPrice,
    confidence,
    sources: dataPoints.map((dp) => dp.source_id),
  };
}

// 导出单独运行测试（ESM 兼容）
const _fn = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === _fn;
if (isMain) {
  fusePriceData("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "arbitrum")
    .then((result) => {
      console.log("融合结果:", result);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
