import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const getDb = () => getPool();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const strategyId = url.searchParams.get("strategyId");
    const statusFilter = url.searchParams.get("status") || "active"; // active | closed | all

    let query = `
      SELECT p.position_id, p.pool_id, p.wallet_address, p.chain_id,
             p.strategy_id, p.value_usd, p.unrealized_pnl_usd, p.realized_pnl_usd,
             p.amount_token0, p.amount_token1, p.entry_price_token0, p.entry_price_token1,
             p.entry_value_usd,
             p.status, p.opened_at, p.closed_at, p.updated_at,
             pl.symbol, pl.protocol_id, pl.apr_base, pl.apr_reward, pl.apr_total,
             pl.tvl_usd AS pool_tvl, pl.volume_24h_usd, pl.fee_tier, pl.health_score, pl.tokens,
             s.name AS strategy_name,
             pr.name AS protocol_name, pr.category AS protocol_category, pr.website_url, pr.logo_url,
             ch.explorer_url
      FROM positions p
      LEFT JOIN pools pl ON p.pool_id = pl.pool_id
      LEFT JOIN strategies s ON p.strategy_id = s.strategy_id
      LEFT JOIN protocols pr ON pl.protocol_id = pr.protocol_id
      LEFT JOIN chains ch ON p.chain_id = ch.chain_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (statusFilter !== "all") {
      params.push(statusFilter);
      query += ` AND p.status = $${params.length}`;
    }

    if (strategyId) {
      params.push(strategyId);
      query += ` AND p.strategy_id = $${params.length}`;
    }

    query += ` ORDER BY p.value_usd DESC`;

    const result = await getDb().query(query, params);

    const positions = result.rows.map((r) => {
      const openedAt = r.opened_at ? new Date(r.opened_at) : null;
      const holdingDays = openedAt ? Math.floor((Date.now() - openedAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      
      return {
        positionId: r.position_id,
        poolId: r.pool_id,
        symbol: r.symbol || r.pool_id,
        protocolId: r.protocol_id || "",
        protocolName: r.protocol_name || r.protocol_id || "",
        protocolCategory: r.protocol_category || "",
        protocolLogo: r.logo_url || null,
        protocolWebsite: r.website_url || null,
        chain: r.chain_id,
        explorerUrl: r.explorer_url || null,
        walletAddress: r.wallet_address,
        strategyId: r.strategy_id,
        strategyName: r.strategy_name || null,
        // 数量和价格
        amountToken0: r.amount_token0 != null ? Number(r.amount_token0) : null,
        amountToken1: r.amount_token1 != null ? Number(r.amount_token1) : null,
        entryPriceToken0: r.entry_price_token0 != null ? Number(r.entry_price_token0) : null,
        entryPriceToken1: r.entry_price_token1 != null ? Number(r.entry_price_token1) : null,
        tokens: r.tokens || [],
        // 价值和盈亏
        entryValueUsd: r.entry_value_usd != null ? Number(r.entry_value_usd) : null,
        valueUsd: Number(r.value_usd),
        unrealizedPnlUsd: Number(r.unrealized_pnl_usd),
        realizedPnlUsd: Number(r.realized_pnl_usd),
        // APR 明细
        aprBase: Number(r.apr_base) || 0,
        aprReward: Number(r.apr_reward) || 0,
        apr: Number(r.apr_total) || 0,
        // 池子信息
        poolTvl: r.pool_tvl != null ? Number(r.pool_tvl) : null,
        volume24h: r.volume_24h_usd != null ? Number(r.volume_24h_usd) : null,
        feeTier: r.fee_tier != null ? Number(r.fee_tier) : null,
        healthScore: r.health_score != null ? Number(r.health_score) : null,
        // 时间
        status: r.status,
        openedAt: r.opened_at,
        updatedAt: r.updated_at,
        holdingDays,
      };
    });

    const totalValue = positions.reduce((s, p) => s + p.valueUsd, 0);
    const totalPnl = positions.reduce((s, p) => s + p.unrealizedPnlUsd, 0);
    const totalRealizedPnl = positions.reduce((s, p) => s + p.realizedPnlUsd, 0);

    // 按策略聚合的 breakdown（仅在未筛选时返回全量）
    let strategyBreakdown: any[] = [];
    if (!strategyId) {
      const breakdownResult = await getDb().query(`
        SELECT p.strategy_id, s.name AS strategy_name,
               COUNT(*) AS position_count,
               COALESCE(SUM(p.value_usd), 0) AS total_allocated_usd,
               COALESCE(SUM(p.unrealized_pnl_usd), 0) AS total_pnl_usd
        FROM positions p
        LEFT JOIN strategies s ON p.strategy_id = s.strategy_id
        WHERE p.status = 'active' AND p.strategy_id IS NOT NULL
        GROUP BY p.strategy_id, s.name
        ORDER BY total_allocated_usd DESC
      `);
      strategyBreakdown = breakdownResult.rows.map((r) => ({
        strategyId: r.strategy_id,
        strategyName: r.strategy_name || r.strategy_id,
        positionCount: Number(r.position_count),
        totalAllocatedUsd: Number(r.total_allocated_usd),
        totalPnlUsd: Number(r.total_pnl_usd),
      }));
    }

    let recentTransactions: any[] = [];
    try {
      const txResult = await getDb().query(`
        SELECT tx_hash, chain_id, protocol_id, tx_type, amount_usd, gas_cost_usd, status, created_at
        FROM transactions
        ORDER BY created_at DESC LIMIT 20
      `);
      recentTransactions = txResult.rows.map((r) => ({
        txHash: r.tx_hash,
        chain: r.chain_id,
        protocolId: r.protocol_id,
        txType: r.tx_type,
        amountUsd: Number(r.amount_usd),
        gasCostUsd: Number(r.gas_cost_usd),
        status: r.status,
        createdAt: r.created_at,
      }));
    } catch {}

    return NextResponse.json({
      positions,
      totalValue,
      totalPnl,
      totalRealizedPnl,
      count: positions.length,
      strategyBreakdown,
      recentTransactions,
    });
  } catch (err) {
    console.error("Positions API error:", err);
    return NextResponse.json(
      { error: "数据库连接失败", positions: [], totalValue: 0, totalPnl: 0, totalRealizedPnl: 0, count: 0, strategyBreakdown: [], recentTransactions: [] },
      { status: 500 }
    );
  }
}
