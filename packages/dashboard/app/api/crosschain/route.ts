import { NextResponse } from "next/server";

// ---- Bridge 安全数据库 ----
const BRIDGE_SAFETY: Record<string, { score: number; tvlB: number; timeS: number }> = {
  stargate:   { score: 85, tvlB: 0.5,  timeS: 120 },
  across:     { score: 88, tvlB: 0.3,  timeS: 60  },
  hop:        { score: 80, tvlB: 0.15, timeS: 300 },
  cbridge:    { score: 75, tvlB: 0.2,  timeS: 180 },
  synapse:    { score: 72, tvlB: 0.1,  timeS: 300 },
  wormhole:   { score: 70, tvlB: 0.8,  timeS: 600 },
  layerzero:  { score: 82, tvlB: 0.4,  timeS: 120 },
  ccip:       { score: 92, tvlB: 0.2,  timeS: 300 },
  mayan:      { score: 78, tvlB: 0.05, timeS: 90  },
  squid:      { score: 80, tvlB: 0.08, timeS: 150 },
};

// ---- 支持的代币列表 ----
const SUPPORTED_TOKENS = [
  { symbol: "USDC",  name: "USD Coin",        decimals: 6 },
  { symbol: "USDT",  name: "Tether",          decimals: 6 },
  { symbol: "ETH",   name: "Ethereum",        decimals: 18 },
  { symbol: "WETH",  name: "Wrapped Ether",   decimals: 18 },
  { symbol: "WBTC",  name: "Wrapped Bitcoin", decimals: 8 },
  { symbol: "DAI",   name: "Dai Stablecoin",  decimals: 18 },
  { symbol: "WMATIC",name: "Wrapped MATIC",   decimals: 18 },
  { symbol: "ARB",   name: "Arbitrum",        decimals: 18 },
  { symbol: "OP",    name: "Optimism",        decimals: 18 },
];

// ---- 支持链 ----
const CHAINS = [
  { id: 1,     name: "Ethereum",  symbol: "ETH",   icon: "⟠",  color: "#6366f1" },
  { id: 42161, name: "Arbitrum",  symbol: "ETH",   icon: "🔵", color: "#28A0F0" },
  { id: 8453,  name: "Base",      symbol: "ETH",   icon: "🔷", color: "#0052FF" },
  { id: 10,    name: "Optimism",  symbol: "ETH",   icon: "🔴", color: "#FF0420" },
  { id: 137,   name: "Polygon",   symbol: "MATIC", icon: "🟣", color: "#8247E5" },
  { id: 56,    name: "BNB Chain", symbol: "BNB",   icon: "🔶", color: "#F0B90B" },
];

const CHAIN_NAME_TO_ID: Record<string, number> = {
  ethereum:  1,
  arbitrum:  42161,
  base:      8453,
  optimism:  10,
  polygon:   137,
  bsc:       56,
  bnb:       56,
  "bnb chain": 56,
};

const LIFI_API = "https://li.quest/v1";

// ---- 综合评分（排序用）----
function compositeScore(q: {
  totalCostUsd: number;
  estimatedTimeSeconds: number;
  safetyScore: number;
  toAmountUsd: number;
  fromAmountUsd: number;
}): number {
  const receiveRate = q.fromAmountUsd > 0 ? q.toAmountUsd / q.fromAmountUsd : 0;
  const receiveScore = receiveRate * 100;             // 到账率越高越好
  const costScore    = Math.max(0, 100 - q.totalCostUsd * 5);
  const speedScore   = Math.max(0, 100 - q.estimatedTimeSeconds / 6);
  return receiveScore * 0.4 + costScore * 0.3 + speedScore * 0.15 + q.safetyScore * 0.15;
}

// ---- LI.FI 路由解析 ----
function parseLifiRoute(route: any) {
  const steps = (route.steps || []).map((s: any) => ({
    type:            s.type || "bridge",
    tool:            s.tool || s.toolDetails?.name || "",
    toolLogo:        s.toolDetails?.logoURI || "",
    fromChain:       s.action?.fromChainId,
    toChain:         s.action?.toChainId,
    fromToken:       s.action?.fromToken?.symbol || "",
    toToken:         s.action?.toToken?.symbol || "",
    fromAmount:      s.action?.fromAmount || "0",
    toAmount:        s.estimate?.toAmount || "0",
    estimatedGasUsd: parseFloat(s.estimate?.gasCosts?.[0]?.amountUSD || "0"),
  }));

  const bridge = steps.find((s: any) => s.type === "bridge");
  const bridgeName = bridge?.tool || route.steps?.[0]?.tool || "unknown";
  const safetyKey  = bridgeName.toLowerCase().replace(/[^a-z]/g, "");
  const safety     = BRIDGE_SAFETY[safetyKey] || { score: 60, tvlB: 0, timeS: 300 };

  const totalGas     = steps.reduce((s: number, st: any) => s + st.estimatedGasUsd, 0);
  const bridgeFeeUsd = parseFloat(route.estimate?.feeCosts?.[0]?.amountUSD || "0");
  const fromAmountUsd = parseFloat(route.fromAmountUSD || "0");
  const toAmountUsd   = parseFloat(route.toAmountUSD   || "0");

  return {
    routeId:              route.id || Math.random().toString(36).slice(2),
    bridgeName,
    bridgeLogo:           route.steps?.[0]?.toolDetails?.logoURI || "",
    fromToken:            route.fromToken?.symbol || "",
    toToken:              route.toToken?.symbol   || "",
    fromAmount:           route.fromAmount || "0",
    toAmount:             route.toAmount   || "0",
    fromAmountUsd,
    toAmountUsd,
    estimatedGasUsd:      totalGas,
    bridgeFeeUsd,
    totalCostUsd:         totalGas + bridgeFeeUsd,
    estimatedTimeSeconds: parseInt(route.estimate?.executionDuration || "300"),
    safetyScore:          safety.score,
    safetyTvlB:           safety.tvlB,
    steps,
    tags:                 route.tags || [],
    // 原始 steps 留给前端执行
    rawSteps:             route.steps || [],
  };
}

// ---- GET /api/crosschain?from=&to=&token=&amount=&wallet= ----
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  // 返回支持的链和代币
  if (action === "meta") {
    return NextResponse.json({ chains: CHAINS, tokens: SUPPORTED_TOKENS });
  }

  const fromChain    = searchParams.get("from")   || "arbitrum";
  const toChain      = searchParams.get("to")     || "base";
  const token        = searchParams.get("token")  || "USDC";
  const amount       = searchParams.get("amount") || "100";
  const walletAddress = searchParams.get("wallet") || "";

  const fromChainId = CHAIN_NAME_TO_ID[fromChain.toLowerCase()] || 42161;
  const toChainId   = CHAIN_NAME_TO_ID[toChain.toLowerCase()]   || 8453;

  if (!walletAddress || !walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    return NextResponse.json({
      success: false,
      error: "请先连接钱包",
      routes: [],
      feeEstimate: { estimatedFee: "~$0.50", estimatedTime: "1-3 分钟", slippage: "0.5%", minReceived: (parseFloat(amount) * 0.995).toFixed(2) },
    });
  }

  try {
    // 获取 token 地址映射
    const TOKEN_ADDRESSES: Record<string, Record<number, string>> = {
      USDC: {
        1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        56: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      },
      USDT: {
        1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        42161: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        8453: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
        10: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
        137: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        56: "0x55d398326f99059fF775485246999027B3197955",
      },
      ETH: {
        1: "0x0000000000000000000000000000000000000000",
        42161: "0x0000000000000000000000000000000000000000",
        8453: "0x0000000000000000000000000000000000000000",
        10: "0x0000000000000000000000000000000000000000",
      },
    };

    const fromTokenAddr = TOKEN_ADDRESSES[token]?.[fromChainId];
    const toTokenAddr = TOKEN_ADDRESSES[token]?.[toChainId];

    if (!fromTokenAddr || !toTokenAddr) {
      throw new Error(`不支持的代币: ${token}`);
    }

    const tokenDecimals = SUPPORTED_TOKENS.find(t => t.symbol === token)?.decimals || 6;
    const amountWei = BigInt(Math.floor(parseFloat(amount) * 10 ** tokenDecimals)).toString();

    // 尝试调用 LI.FI API (可能需要 API Key)
    const routesResp = await fetch(`${LIFI_API}/routes`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        // 如果有 API Key 可以在这里添加
        // "x-lifi-api-key": process.env.LIFI_API_KEY || "",
      },
      body: JSON.stringify({
        fromChainId,
        toChainId,
        fromTokenAddress: fromTokenAddr,
        toTokenAddress: toTokenAddr,
        fromAmount: amountWei,
        fromAddress: walletAddress,
        options: {
          order: "RECOMMENDED",
          slippage: 0.005,
          maxPriceImpact: 0.01,
          allowBridges: Object.keys(BRIDGE_SAFETY),
          insurance: false,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!routesResp.ok) {
      throw new Error(`LI.FI routes API error: ${routesResp.status}`);
    }

    const data = await routesResp.json() as { routes?: any[] };
    const rawRoutes = data.routes || [];

    if (rawRoutes.length === 0) {
      throw new Error("未找到可用路由");
    }

    const routes = rawRoutes
      .map(parseLifiRoute)
      .sort((a, b) => compositeScore(b) - compositeScore(a));

    const best = routes[0];
    const feeEstimate = best
      ? {
          estimatedFee: `~$${best.totalCostUsd.toFixed(2)}`,
          estimatedTime: best.estimatedTimeSeconds < 120
            ? "< 2 分钟"
            : best.estimatedTimeSeconds < 300
            ? "2-5 分钟"
            : "5-10 分钟",
          slippage: "0.5%",
          minReceived: (parseFloat(amount) * 0.995).toFixed(4),
          safetyScore: best.safetyScore,
          bridgeName: best.bridgeName,
        }
      : {
          estimatedFee: "~$0.50",
          estimatedTime: "1-3 分钟",
          slippage: "0.5%",
          minReceived: (parseFloat(amount) * 0.995).toFixed(4),
        };

    return NextResponse.json({ success: true, routes, feeEstimate, fromChain, toChain, token, amount });
  } catch (err) {
    console.error("[CrossChain GET] LI.FI failed:", err);
    
    // 降级：返回模拟路由数据
    const amountNum = parseFloat(amount);
    const mockRoutes = [
      {
        routeId: "mock-stargate-1",
        bridgeName: "Stargate",
        bridgeLogo: "https://stargate.finance/favicon.ico",
        fromToken: token,
        toToken: token,
        fromAmount: amount,
        toAmount: (amountNum * 0.997).toFixed(4),
        fromAmountUsd: amountNum,
        toAmountUsd: amountNum * 0.997,
        estimatedGasUsd: 0.5,
        bridgeFeeUsd: 0.05,
        totalCostUsd: 0.55,
        estimatedTimeSeconds: 120,
        safetyScore: 85,
        safetyTvlB: 0.5,
        steps: [
          { type: "bridge", tool: "Stargate", fromChain: fromChain, toChain: toChain, fromToken: token, toToken: token }
        ],
        tags: ["RECOMMENDED", "FASTEST"],
        rawSteps: [],
      },
      {
        routeId: "mock-across-1",
        bridgeName: "Across",
        bridgeLogo: "https://across.to/favicon.ico",
        fromToken: token,
        toToken: token,
        fromAmount: amount,
        toAmount: (amountNum * 0.998).toFixed(4),
        fromAmountUsd: amountNum,
        toAmountUsd: amountNum * 0.998,
        estimatedGasUsd: 0.3,
        bridgeFeeUsd: 0.03,
        totalCostUsd: 0.33,
        estimatedTimeSeconds: 60,
        safetyScore: 88,
        safetyTvlB: 0.3,
        steps: [
          { type: "bridge", tool: "Across", fromChain: fromChain, toChain: toChain, fromToken: token, toToken: token }
        ],
        tags: ["CHEAPEST"],
        rawSteps: [],
      },
      {
        routeId: "mock-ccip-1",
        bridgeName: "Chainlink CCIP",
        bridgeLogo: "https://chain.link/favicon.ico",
        fromToken: token,
        toToken: token,
        fromAmount: amount,
        toAmount: (amountNum * 0.995).toFixed(4),
        fromAmountUsd: amountNum,
        toAmountUsd: amountNum * 0.995,
        estimatedGasUsd: 0.8,
        bridgeFeeUsd: 0.1,
        totalCostUsd: 0.9,
        estimatedTimeSeconds: 300,
        safetyScore: 92,
        safetyTvlB: 0.2,
        steps: [
          { type: "bridge", tool: "CCIP", fromChain: fromChain, toChain: toChain, fromToken: token, toToken: token }
        ],
        tags: ["SAFEST"],
        rawSteps: [],
      },
    ];

    const best = mockRoutes[0];
    return NextResponse.json({
      success: true,
      routes: mockRoutes,
      feeEstimate: {
        estimatedFee: `~$${best.totalCostUsd.toFixed(2)}`,
        estimatedTime: "< 2 分钟",
        slippage: "0.5%",
        minReceived: best.toAmount,
        safetyScore: best.safetyScore,
        bridgeName: best.bridgeName,
      },
      fromChain,
      toChain,
      token,
      amount,
      notice: "当前显示模拟路由数据，实际跨链需要配置 LI.FI API Key",
    });
  }
}

// ---- POST /api/crosschain  构建可执行交易步骤 ----
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fromChain, toChain, token, amount, walletAddress, routeId } = body;

    if (!fromChain || !toChain || !amount || !walletAddress) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const fromChainId = CHAIN_NAME_TO_ID[fromChain.toLowerCase()];
    const toChainId   = CHAIN_NAME_TO_ID[toChain.toLowerCase()];
    if (!fromChainId || !toChainId) {
      return NextResponse.json({ error: "不支持的链" }, { status: 400 });
    }

    const amountWei = BigInt(Math.floor(parseFloat(amount) * 1e6)).toString();

    // 1. 重新获取路由
    const routesResp = await fetch(`${LIFI_API}/routes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromChainId,
        toChainId,
        fromTokenAddress: token || "USDC",
        toTokenAddress: token || "USDC",
        fromAmount: amountWei,
        fromAddress: walletAddress,
        options: { order: "RECOMMENDED", slippage: 0.005, maxPriceImpact: 0.01 },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!routesResp.ok) throw new Error("路由获取失败");
    const routesData = await routesResp.json() as { routes?: any[] };
    const routes = routesData.routes || [];
    if (routes.length === 0) throw new Error("未找到可用路由");

    // 选用指定 routeId 或最优路由
    const route = (routeId ? routes.find((r: any) => r.id === routeId) : null) || routes[0];

    // 2. 为每个 step 获取链上交易数据
    const transactions = [];
    for (let i = 0; i < (route.steps || []).length; i++) {
      const step = route.steps[i];
      try {
        const txResp = await fetch(`${LIFI_API}/stepTransaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step, fromAddress: walletAddress, slippage: 0.005 }),
          signal: AbortSignal.timeout(8000),
        });
        if (!txResp.ok) continue;
        const txData = await txResp.json() as any;
        const req = txData.transactionRequest || {};
        if (!req.to || !req.data) continue;

        const chainId = Number(step.action?.fromChainId || fromChainId);
        transactions.push({
          step:        i + 1,
          type:        step.type || "bridge",
          tool:        step.tool || step.toolDetails?.name || "",
          toolLogo:    step.toolDetails?.logoURI || "",
          description: step.type === "approve"
            ? `授权 ${token} 给 ${step.tool || "Bridge"}`
            : `${step.type === "swap" ? "兑换" : "跨链"} ${token} (${fromChain} → ${toChain})`,
          fromToken:   step.action?.fromToken?.symbol || token,
          toToken:     step.action?.toToken?.symbol   || token,
          fromChain:   fromChain,
          toChain:     step.type === "bridge" ? toChain : fromChain,
          estimatedGasUsd: parseFloat(step.estimate?.gasCosts?.[0]?.amountUSD || "0"),
          tx: {
            from:    walletAddress,
            to:      req.to,
            data:    req.data,
            value:   req.value   || "0x0",
            chainId: `0x${chainId.toString(16)}`,
            gasLimit: req.gasLimit || undefined,
          },
        });
      } catch (stepErr) {
        console.warn(`[CrossChain] Step ${i + 1} tx build failed:`, stepErr);
      }
    }

    if (transactions.length === 0) {
      throw new Error("无法构建任何可执行步骤");
    }

    const parsed = parseLifiRoute(route);

    return NextResponse.json({
      success: true,
      transactions,
      summary: {
        fromChain,
        toChain,
        token: token || "USDC",
        amount,
        bridgeName:           parsed.bridgeName,
        estimatedTime:        parsed.estimatedTimeSeconds < 120 ? "< 2 分钟" : "2-5 分钟",
        totalCostUsd:         parsed.totalCostUsd.toFixed(2),
        estimatedReceive:     (parseFloat(amount) - parsed.totalCostUsd).toFixed(4),
        safetyScore:          parsed.safetyScore,
      },
    });
  } catch (error: any) {
    console.error("[CrossChain POST] error:", error);
    return NextResponse.json({ error: error.message || "构建跨链交易失败" }, { status: 500 });
  }
}
