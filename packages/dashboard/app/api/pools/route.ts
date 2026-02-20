import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";
import { queryAllNetworksProducts, formatAsPoolData } from "../../lib/okx-earn";

const pool = getPool();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chain = searchParams.get("chain") || "all";
    const sort = searchParams.get("sort") || "apr";
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "100");
    const minTvl = parseFloat(searchParams.get("minTvl") || "100000");
    const minHealth = searchParams.get("minHealth");

    let where = "WHERE is_active = true AND tvl_usd >= $1";
    const params: (string | number)[] = [minTvl];
    let paramIdx = 2;

    if (chain !== "all") {
      where += ` AND chain_id = $${paramIdx}`;
      params.push(chain);
      paramIdx++;
    }

    if (search) {
      where += ` AND (LOWER(symbol) LIKE $${paramIdx} OR LOWER(protocol_id) LIKE $${paramIdx})`;
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }

    if (minHealth != null && minHealth !== "") {
      const h = parseFloat(minHealth);
      if (!Number.isNaN(h)) {
        where += ` AND health_score >= $${paramIdx}`;
        params.push(h);
        paramIdx++;
      }
    }

    const orderBy =
      sort === "tvl"
        ? "tvl_usd DESC"
        : sort === "health"
          ? "health_score DESC NULLS LAST"
          : "apr_total DESC";

    // 同时获取数据库池子和 OKX Earn 产品
    const [dbResult, okxProducts] = await Promise.all([
      pool.query(
        `SELECT pool_id, protocol_id, chain_id, symbol, apr_base, apr_reward, apr_total,
                tvl_usd, volume_24h_usd, health_score, metadata
         FROM pools ${where}
         ORDER BY ${orderBy}
         LIMIT $${paramIdx}`,
        [...params, limit]
      ),
      queryAllNetworksProducts(30).catch(() => []), // OKX Earn 数据
    ]);

    const result = dbResult;

    const pools = result.rows.map((r) => {
      const meta = typeof r.metadata === "string" ? JSON.parse(r.metadata) : (r.metadata || {});
      let riskLevel = "low";
      if (Number(r.apr_total) > 100) riskLevel = "high";
      else if (Number(r.apr_total) > 30 || meta.ilRisk === "yes") riskLevel = "medium";

      return {
        poolId: r.pool_id,
        protocolId: r.protocol_id,
        chain: r.chain_id,
        symbol: r.symbol,
        aprBase: Number(r.apr_base),
        aprReward: Number(r.apr_reward),
        aprTotal: Number(r.apr_total),
        tvlUsd: Number(r.tvl_usd),
        volume24hUsd: Number(r.volume_24h_usd),
        healthScore: r.health_score != null ? Number(r.health_score) : null,
        riskLevel,
        stablecoin: meta.stablecoin || false,
      };
    });

    // 转换 OKX Earn 产品为池子格式
    const okxPools = okxProducts.map((p) => {
      const formatted = formatAsPoolData(p);
      return {
        poolId: formatted.id,
        protocolId: formatted.protocol.toLowerCase().replace(/\s+/g, "-"),
        chain: formatted.chain,
        symbol: formatted.pool,
        aprBase: formatted.apr,
        aprReward: 0,
        aprTotal: formatted.apr,
        tvlUsd: formatted.tvl,
        volume24hUsd: 0,
        healthScore: formatted.healthScore,
        riskLevel: formatted.apr > 100 ? "high" : formatted.apr > 30 ? "medium" : "low",
        stablecoin: formatted.type === "savings",
        source: "okx-earn",
        protocol: formatted.protocol,
        type: formatted.type,
      };
    });

    // 合并并排序
    const allPools = [...pools, ...okxPools];
    
    // 根据排序参数重新排序
    if (sort === "tvl") {
      allPools.sort((a, b) => b.tvlUsd - a.tvlUsd);
    } else if (sort === "health") {
      allPools.sort((a, b) => (b.healthScore || 0) - (a.healthScore || 0));
    } else {
      allPools.sort((a, b) => b.aprTotal - a.aprTotal);
    }

    return NextResponse.json({ pools: allPools.slice(0, limit), total: allPools.length });
  } catch (err) {
    console.error("Pools API error:", err);
    return NextResponse.json(
      { error: "数据库连接失败", pools: [], total: 0 },
      { status: 500 }
    );
  }
}
