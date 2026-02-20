import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

// GET: 获取调仓建议（当前持仓 vs 更高收益池）
export async function GET() {
  try {
    // 查询当前活跃持仓
    const positions = await pool.query(`
      SELECT p.id, p.pool_id, p.chain_id, p.value_usd, p.unrealized_pnl_usd, p.opened_at,
             pl.protocol_id, pl.symbol, pl.apr_total, pl.health_score
      FROM positions p
      LEFT JOIN pools pl ON p.pool_id = pl.pool_id
      WHERE p.status = 'active'
      ORDER BY pl.apr_total ASC
    `);

    // 查询高收益替代池（健康分 >= 40，TVL >= 100K）
    const betterPools = await pool.query(`
      SELECT pool_id, protocol_id, chain_id, symbol, apr_total, tvl_usd, health_score
      FROM pools
      WHERE tvl_usd > 100000 AND apr_total >= 1000
      ORDER BY apr_total DESC
      LIMIT 10
    `);

    const suggestions = positions.rows
      .filter((pos: any) => {
        const currentApr = parseFloat(pos.apr_total) || 0;
        return currentApr < 1000; // 只对低收益持仓建议调仓
      })
      .map((pos: any) => {
        // 找同链或跨链的更高收益池
        const candidates = betterPools.rows.filter((bp: any) => {
          const bpApr = parseFloat(bp.apr_total) || 0;
          const posApr = parseFloat(pos.apr_total) || 0;
          return bpApr > posApr * 3; // 至少3倍收益率
        });

        return {
          currentPosition: {
            id: pos.id,
            poolId: pos.pool_id,
            protocol: pos.protocol_id,
            symbol: pos.symbol,
            chain: pos.chain_id,
            value: parseFloat(pos.value_usd),
            apr: parseFloat(pos.apr_total),
            healthScore: parseFloat(pos.health_score),
          },
          betterOptions: candidates.slice(0, 3).map((c: any) => ({
            poolId: c.pool_id,
            protocol: c.protocol_id,
            symbol: c.symbol,
            chain: c.chain_id,
            apr: parseFloat(c.apr_total),
            tvl: parseFloat(c.tvl_usd),
            healthScore: parseFloat(c.health_score),
            aprMultiple: (parseFloat(c.apr_total) / (parseFloat(pos.apr_total) || 1)).toFixed(0) + "x",
          })),
        };
      })
      .filter((s: any) => s.betterOptions.length > 0);

    return NextResponse.json({
      suggestions,
      totalPositions: positions.rows.length,
      message: suggestions.length > 0
        ? `发现 ${suggestions.length} 个可优化持仓`
        : "当前持仓已是最优配置",
    });
  } catch (error) {
    console.error("Rebalance suggestions error:", error);
    return NextResponse.json({ error: "获取调仓建议失败" }, { status: 500 });
  }
}

// POST: 执行调仓（写入 pending_signatures 表，由 executor 拾取执行）
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { positionId, targetPoolId, targetProtocolId, targetChain } = body;

    if (!positionId || !targetPoolId || !targetProtocolId) {
      return NextResponse.json(
        { error: "缺少参数: positionId, targetPoolId, targetProtocolId" },
        { status: 400 }
      );
    }

    // 查询当前持仓详情
    const posResult = await pool.query(`
      SELECT p.id, p.pool_id, p.chain_id, p.value_usd, p.wallet_address,
             pl.protocol_id, pl.symbol, pl.apr_total
      FROM positions p
      LEFT JOIN pools pl ON p.pool_id = pl.pool_id
      WHERE p.id = $1 AND p.status = 'active'
    `, [positionId]);

    if (posResult.rows.length === 0) {
      return NextResponse.json({ error: "持仓不存在或已关闭" }, { status: 404 });
    }

    const pos = posResult.rows[0];

    // 获取持仓的 strategy_id（用于策略详情页展示调仓原因）
    const strategyRes = await pool.query(
      `SELECT strategy_id FROM positions WHERE id = $1`,
      [positionId]
    );
    const strategyId = strategyRes.rows[0]?.strategy_id ?? null;

    // 查询目标池信息
    const targetResult = await pool.query(`
      SELECT pool_id, protocol_id, chain_id, symbol, apr_total, health_score
      FROM pools WHERE pool_id = $1
    `, [targetPoolId]);

    if (targetResult.rows.length === 0) {
      return NextResponse.json({ error: "目标池不存在" }, { status: 404 });
    }

    const target = targetResult.rows[0];

    // 构建 rebalance 信号
    const signalId = `rebalance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const signal = {
      signalId,
      strategyId: "manual_rebalance",
      action: "rebalance",
      poolId: pos.pool_id,
      chain: pos.chain_id,
      protocolId: pos.protocol_id,
      amountUsd: parseFloat(pos.value_usd),
      params: {
        targetPoolId,
        targetProtocolId,
        targetChain: targetChain || target.chain_id,
        lpAmount: "max",
      },
      timestamp: new Date().toISOString(),
    };

    // 写入 pending_signatures 表，executor 会定期拾取
    await pool.query(`
      INSERT INTO pending_signatures (chain_id, tx_type, amount_usd, payload, status)
      VALUES ($1, $2, $3, $4, 'pending')
    `, [
      pos.chain_id,
      "rebalance",
      parseFloat(pos.value_usd),
      JSON.stringify(signal),
    ]);

    // 记录审计日志
    await pool.query(`
      INSERT INTO audit_log (event_type, severity, source, message, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      "rebalance_triggered",
      "warning",
      "dashboard",
      `手动调仓: ${pos.protocol_id}/${pos.symbol} (APR ${parseFloat(pos.apr_total).toFixed(1)}%) → ${target.protocol_id}/${target.symbol} (APR ${parseFloat(target.apr_total).toFixed(1)}%)`,
      JSON.stringify({
        signalId,
        strategyId,
        from: { poolId: pos.pool_id, protocol: pos.protocol_id, symbol: pos.symbol, apr: pos.apr_total },
        to: { poolId: target.pool_id, protocol: target.protocol_id, symbol: target.symbol, apr: target.apr_total },
        valueUsd: pos.value_usd,
      }),
    ]);

    return NextResponse.json({
      success: true,
      signalId,
      message: `调仓信号已发送到执行器`,
      from: {
        protocol: pos.protocol_id,
        symbol: pos.symbol,
        apr: parseFloat(pos.apr_total).toFixed(1) + "%",
        value: "$" + parseFloat(pos.value_usd).toFixed(2),
      },
      to: {
        protocol: target.protocol_id,
        symbol: target.symbol,
        apr: parseFloat(target.apr_total).toFixed(1) + "%",
        chain: target.chain_id,
      },
    });
  } catch (error) {
    console.error("Rebalance error:", error);
    return NextResponse.json({ error: "调仓执行失败" }, { status: 500 });
  }
}
