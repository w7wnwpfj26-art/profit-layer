import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";
import { notify } from "../../lib/telegram";

const pool = getPool();

// EVM 链配置
const CHAINS: Record<number, { name: string; rpc: string; symbol: string }> = {
  1: { name: "Ethereum", rpc: "https://1rpc.io/eth", symbol: "ETH" },
  56: { name: "BNB Chain", rpc: "https://1rpc.io/bnb", symbol: "BNB" },
  42161: { name: "Arbitrum", rpc: "https://1rpc.io/arb", symbol: "ETH" },
  8453: { name: "Base", rpc: "https://1rpc.io/base", symbol: "ETH" },
  10: { name: "Optimism", rpc: "https://1rpc.io/op", symbol: "ETH" },
};

// 获取利润归集配置
async function getProfitSweepConfig() {
  const result = await pool.query(
    `SELECT key, value FROM system_config 
     WHERE key IN ('profit_sweep_enabled', 'profit_sweep_threshold', 'cold_wallet_address', 'evm_wallet_address')`
  );
  
  const config: Record<string, string> = {};
  for (const row of result.rows) {
    config[row.key] = row.value;
  }
  
  return {
    enabled: config.profit_sweep_enabled === 'true',
    threshold: parseFloat(config.profit_sweep_threshold || '1000'),
    coldWallet: config.cold_wallet_address || '',
    hotWallet: config.evm_wallet_address || '',
  };
}

// 获取链上余额
async function getBalance(address: string, chainId: number): Promise<number> {
  const chain = CHAINS[chainId];
  if (!chain) return 0;
  
  try {
    const response = await fetch(chain.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address, "latest"],
        id: 1,
      }),
    });
    
    const data = await response.json();
    if (data.result) {
      return parseInt(data.result, 16) / 1e18;
    }
    return 0;
  } catch {
    return 0;
  }
}

// GET: 检查利润归集状态
export async function GET() {
  try {
    const config = await getProfitSweepConfig();
    
    if (!config.enabled) {
      return NextResponse.json({
        enabled: false,
        message: "利润归集功能未启用"
      });
    }
    
    if (!config.coldWallet || !config.hotWallet) {
      return NextResponse.json({
        enabled: true,
        error: "未配置钱包地址",
        coldWallet: config.coldWallet || null,
        hotWallet: config.hotWallet || null,
      });
    }
    
    // 获取热钱包余额（多链）
    const balances: Array<{ chain: string; balance: number; symbol: string }> = [];
    let totalUsd = 0;
    
    let prices: Record<string, number> = {};
    try {
      const pr = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin&vs_currencies=usd");
      const pd = await pr.json();
      prices = { ETH: pd.ethereum?.usd ?? 0, BNB: pd.binancecoin?.usd ?? 0 };
    } catch {
      // 不使用假价格，USD 显示为 0
    }

    for (const [chainId, chain] of Object.entries(CHAINS)) {
      const balance = await getBalance(config.hotWallet, parseInt(chainId));
      if (balance > 0.0001) {
        const usdValue = balance * (prices[chain.symbol] ?? 0);
        balances.push({ 
          chain: chain.name, 
          balance, 
          symbol: chain.symbol 
        });
        totalUsd += usdValue;
      }
    }
    
    const sweepable = totalUsd > config.threshold;
    
    return NextResponse.json({
      enabled: true,
      threshold: config.threshold,
      coldWallet: config.coldWallet,
      hotWallet: config.hotWallet,
      balances,
      totalUsd: Math.round(totalUsd * 100) / 100,
      sweepable,
      message: sweepable 
        ? `可归集 $${totalUsd.toFixed(2)}（超过阈值 $${config.threshold}）`
        : `当前余额 $${totalUsd.toFixed(2)} 未达到归集阈值 $${config.threshold}`
    });
    
  } catch (err) {
    return NextResponse.json({ 
      error: (err as Error).message 
    }, { status: 500 });
  }
}

// POST: 执行利润归集（模拟）
// 注意：实际转账需要私钥签名，这里只做模拟和记录
export async function POST(request: Request) {
  try {
    const config = await getProfitSweepConfig();
    
    if (!config.enabled) {
      return NextResponse.json({
        success: false,
        error: "利润归集功能未启用"
      }, { status: 400 });
    }
    
    if (!config.coldWallet || !config.hotWallet) {
      return NextResponse.json({
        success: false,
        error: "未配置钱包地址"
      }, { status: 400 });
    }
    
    const body = await request.json().catch(() => ({}));
    const { chainId = 1, amount, dryRun = true } = body;
    
    if (dryRun) {
      // 模拟模式：记录日志但不实际转账
      await pool.query(
        `INSERT INTO audit_log (event_type, severity, source, message, metadata)
         VALUES ('profit_sweep_simulated', 'info', 'dashboard', $1, $2)`,
        [
          `[模拟] 利润归集: ${amount || 'auto'} → ${config.coldWallet.slice(0, 10)}...`,
          JSON.stringify({ 
            from: config.hotWallet, 
            to: config.coldWallet, 
            chainId,
            amount,
            dryRun: true,
            timestamp: new Date().toISOString() 
          })
        ]
      );
      
      return NextResponse.json({
        success: true,
        dryRun: true,
        message: "模拟归集成功（未实际转账）",
        details: {
          from: config.hotWallet,
          to: config.coldWallet,
          chainId,
          chain: CHAINS[chainId]?.name || "Unknown",
        }
      });
    }
    
    // 实际转账逻辑（需要私钥，暂时返回提示）
    return NextResponse.json({
      success: false,
      error: "实际转账需要配置私钥签名，当前版本仅支持模拟模式",
      hint: "请在 dryRun: true 模式下测试，或通过钱包手动转账"
    }, { status: 400 });
    
  } catch (err) {
    return NextResponse.json({ 
      success: false,
      error: (err as Error).message 
    }, { status: 500 });
  }
}
