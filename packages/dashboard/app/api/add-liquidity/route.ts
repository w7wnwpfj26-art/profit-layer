import { NextResponse } from "next/server";

// Aerodrome Router 合约地址 (Base)
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";

// Base 链代币地址
const BASE_TOKENS: Record<string, { address: string; decimals: number }> = {
  WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  USDbC: { address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", decimals: 6 },
  DAI: { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
};

// 构建 ERC20 approve 数据
function buildApproveData(spender: string, amount: bigint): string {
  return "0x095ea7b3" + 
    spender.slice(2).padStart(64, "0") + 
    amount.toString(16).padStart(64, "0");
}

// 构建 addLiquidity 交易数据
// addLiquidity(address tokenA, address tokenB, bool stable, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline)
function buildAddLiquidityData(
  tokenA: string,
  tokenB: string,
  stable: boolean,
  amountA: bigint,
  amountB: bigint,
  slippage: number,
  to: string,
  deadline: number
): string {
  const functionSelector = "0xe8e33700"; // addLiquidity
  
  const minA = amountA * BigInt(Math.floor((1 - slippage) * 1000)) / BigInt(1000);
  const minB = amountB * BigInt(Math.floor((1 - slippage) * 1000)) / BigInt(1000);
  
  return functionSelector +
    tokenA.slice(2).padStart(64, "0") +
    tokenB.slice(2).padStart(64, "0") +
    (stable ? "1" : "0").padStart(64, "0") +
    amountA.toString(16).padStart(64, "0") +
    amountB.toString(16).padStart(64, "0") +
    minA.toString(16).padStart(64, "0") +
    minB.toString(16).padStart(64, "0") +
    to.slice(2).padStart(64, "0") +
    deadline.toString(16).padStart(64, "0");
}

// 构建 addLiquidityETH 交易数据 (当一个代币是ETH时)
function buildAddLiquidityETHData(
  token: string,
  stable: boolean,
  amountTokenDesired: bigint,
  amountTokenMin: bigint,
  amountETHMin: bigint,
  to: string,
  deadline: number
): string {
  const functionSelector = "0xb7e0d4c0"; // addLiquidityETH
  
  return functionSelector +
    token.slice(2).padStart(64, "0") +
    (stable ? "1" : "0").padStart(64, "0") +
    amountTokenDesired.toString(16).padStart(64, "0") +
    amountTokenMin.toString(16).padStart(64, "0") +
    amountETHMin.toString(16).padStart(64, "0") +
    to.slice(2).padStart(64, "0") +
    deadline.toString(16).padStart(64, "0");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      tokenA = "WETH", 
      tokenB = "USDC", 
      amountA, 
      amountB, 
      walletAddress,
      stable = false,
      slippage = 0.01 // 1% 默认滑点
    } = body;

    // 验证参数
    if (!amountA || !amountB || !walletAddress) {
      return NextResponse.json({ error: "缺少必要参数 (amountA, amountB, walletAddress)" }, { status: 400 });
    }

    const tokenAInfo = BASE_TOKENS[tokenA.toUpperCase()];
    const tokenBInfo = BASE_TOKENS[tokenB.toUpperCase()];

    if (!tokenAInfo || !tokenBInfo) {
      return NextResponse.json({ error: `不支持的代币: ${tokenA} 或 ${tokenB}` }, { status: 400 });
    }

    // 计算金额
    const amountAWei = BigInt(Math.floor(parseFloat(amountA) * Math.pow(10, tokenAInfo.decimals)));
    const amountBWei = BigInt(Math.floor(parseFloat(amountB) * Math.pow(10, tokenBInfo.decimals)));
    
    // 计算最小接收量
    const minA = amountAWei * BigInt(Math.floor((1 - slippage) * 1000)) / BigInt(1000);
    const minB = amountBWei * BigInt(Math.floor((1 - slippage) * 1000)) / BigInt(1000);

    // 截止时间 (30分钟后)
    const deadline = Math.floor(Date.now() / 1000) + 1800;

    const transactions = [];
    const BASE_CHAIN_ID = 8453;

    // Step 1: Approve Token A
    transactions.push({
      step: 1,
      description: `授权 ${amountA} ${tokenA} 给 Aerodrome`,
      tx: {
        from: walletAddress,
        to: tokenAInfo.address,
        data: buildApproveData(AERODROME_ROUTER, amountAWei),
        value: "0x0",
        chainId: `0x${BASE_CHAIN_ID.toString(16)}`,
      },
    });

    // Step 2: Approve Token B
    transactions.push({
      step: 2,
      description: `授权 ${amountB} ${tokenB} 给 Aerodrome`,
      tx: {
        from: walletAddress,
        to: tokenBInfo.address,
        data: buildApproveData(AERODROME_ROUTER, amountBWei),
        value: "0x0",
        chainId: `0x${BASE_CHAIN_ID.toString(16)}`,
      },
    });

    // Step 3: Add Liquidity
    const addLiquidityData = buildAddLiquidityData(
      tokenAInfo.address,
      tokenBInfo.address,
      stable,
      amountAWei,
      amountBWei,
      slippage,
      walletAddress,
      deadline
    );

    transactions.push({
      step: 3,
      description: `添加流动性 ${amountA} ${tokenA} + ${amountB} ${tokenB}`,
      tx: {
        from: walletAddress,
        to: AERODROME_ROUTER,
        data: addLiquidityData,
        value: "0x0",
        chainId: `0x${BASE_CHAIN_ID.toString(16)}`,
      },
    });

    return NextResponse.json({
      success: true,
      transactions,
      summary: {
        pool: `${tokenA}-${tokenB}`,
        tokenA: { symbol: tokenA, amount: amountA, address: tokenAInfo.address },
        tokenB: { symbol: tokenB, amount: amountB, address: tokenBInfo.address },
        stable,
        slippage: `${slippage * 100}%`,
        deadline: new Date(deadline * 1000).toISOString(),
        router: AERODROME_ROUTER,
      },
    });

  } catch (error) {
    console.error("[AddLiquidity API] error:", error);
    return NextResponse.json({ error: "构建添加流动性交易失败" }, { status: 500 });
  }
}

// GET: 获取池子信息
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tokenA = searchParams.get("tokenA") || "WETH";
  const tokenB = searchParams.get("tokenB") || "USDC";

  return NextResponse.json({
    pool: `${tokenA}-${tokenB}`,
    router: AERODROME_ROUTER,
    chain: "base",
    chainId: 8453,
    tokens: {
      [tokenA]: BASE_TOKENS[tokenA.toUpperCase()]?.address || "unknown",
      [tokenB]: BASE_TOKENS[tokenB.toUpperCase()]?.address || "unknown",
    },
    suggestedSlippage: "1%",
    protocol: "Aerodrome",
  });
}
