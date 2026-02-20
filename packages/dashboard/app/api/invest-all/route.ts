import { NextResponse } from "next/server";

// 从 CoinGecko 获取 ETH 价格
async function getEthPrice(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { signal: AbortSignal.timeout(5000) }
    );
    const data = (await res.json()) as Record<string, { usd?: number }>;
    return data.ethereum?.usd ?? 2100; // fallback 2100
  } catch {
    return 2100;
  }
}

const EXECUTOR_CHAINS = [
  {
    chain: "arbitrum",
    rpc: "https://1rpc.io/arb",
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    gasReserve: 0.003,
  },
];

async function getChainBalance(rpc: string, wallet: string): Promise<number> {
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBalance", params: [wallet, "latest"], id: 1 }),
    });
    const data = await res.json();
    return parseInt(data.result, 16) / 1e18;
  } catch {
    return 0;
  }
}

async function getERC20Balance(rpc: string, token: string, wallet: string, decimals: number): Promise<number> {
  try {
    const padded = wallet.slice(2).toLowerCase().padStart(64, "0");
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: token, data: "0x70a08231" + "0".repeat(24) + padded }, "latest"],
        id: 1,
      }),
    });
    const data = await res.json();
    return parseInt(data.result, 16) / Math.pow(10, decimals);
  } catch {
    return 0;
  }
}

// GET: 查询闲置余额
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet") || "0x41f74B75de939692191f87C3E671052Eaa956677";

  const results = [];
  let totalIdle = 0;

  // 获取 ETH 价格
  const ethPrice = await getEthPrice();

  for (const chain of EXECUTOR_CHAINS) {
    const ethBalance = await getChainBalance(chain.rpc, wallet);
    const wethBalance = await getERC20Balance(chain.rpc, chain.weth, wallet, 18);
    const available = Math.max(0, ethBalance - chain.gasReserve);

    results.push({
      chain: chain.chain,
      ethBalance: ethBalance.toFixed(6),
      wethBalance: wethBalance.toFixed(6),
      availableEth: available.toFixed(6),
      availableUsd: (available * ethPrice + wethBalance * ethPrice).toFixed(2),
      gasReserve: chain.gasReserve,
    });

    totalIdle += available * ethPrice + wethBalance * ethPrice;
  }

  return NextResponse.json({
    wallet,
    chains: results,
    totalIdleUsd: totalIdle.toFixed(2),
    message: totalIdle < 1 ? "所有余额已投入运作" : `闲置余额约 $${totalIdle.toFixed(2)}，可一键投资`,
  });
}

// POST: 触发投资（通过 BullMQ 队列发信号给 executor）
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { wallet, chain, amount } = body;

    // 方案1：直接通过 executor 的 BullMQ 队列发送执行信号
    // 方案2：直接调用 add-investment 逻辑

    // 先记录到 pending_signatures 表（需要钱包签名的交易）
    const { getPool } = await import("../../lib/db");
    const pool = getPool();

    // 查询高收益池推荐
    const topPools = await pool.query(`
      SELECT pool_id, protocol_id, chain_id, symbol, apr_total, health_score
      FROM pools
      WHERE tvl_usd > 10000 AND apr_total >= 1000 AND chain_id = $1
      ORDER BY apr_total DESC
      LIMIT 3
    `, [chain || "arbitrum"]);

    if (topPools.rows.length === 0) {
      return NextResponse.json({ error: "没有符合条件的投资池" }, { status: 400 });
    }

    const targetPool = topPools.rows[0];

    // 记录投资意图
    await pool.query(`
      INSERT INTO audit_log (event_type, severity, source, message, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      "invest_all_triggered",
      "info",
      "dashboard",
      `用户触发一键投资: ${chain || "arbitrum"} -> ${targetPool.protocol_id}/${targetPool.symbol}`,
      JSON.stringify({ wallet, chain, targetPool: targetPool.pool_id, apr: targetPool.apr_total }),
    ]);

    return NextResponse.json({
      success: true,
      message: `投资信号已发送`,
      target: {
        pool: targetPool.symbol,
        protocol: targetPool.protocol_id,
        chain: targetPool.chain_id,
        apr: parseFloat(targetPool.apr_total).toFixed(1) + "%",
      },
      note: "AutoPilot 将在下个周期自动执行投资",
    });

  } catch (error) {
    console.error("Invest-all error:", error);
    return NextResponse.json({ error: "投资触发失败" }, { status: 500 });
  }
}
