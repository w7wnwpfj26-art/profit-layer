/**
 * 钱包余额 API（重构版）
 *
 * 核心改进：
 * 1. 区块链浏览器 API 自动发现钱包持有的所有 ERC20 代币（不再依赖预设列表）
 * 2. Multicall3 批量查询所有代币余额（1 条链只发 1 个 RPC 请求）
 * 3. 价格多源降级：CoinGecko → OKX 公开价格 API → 内置 fallback
 * 4. 并行查询所有链，总延迟大幅降低
 */

import { NextResponse } from "next/server";

// ---- Multicall3 地址（所有主流链通用）----
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

// ---- 链配置 ----
const CHAINS = [
  {
    chainId: 1,
    name: "Ethereum",
    symbol: "ETH",
    rpc: process.env.ETH_RPC_URL || "https://1rpc.io/eth",
    explorer: "https://api.etherscan.io/api",
    explorerKey: process.env.ETHERSCAN_API_KEY || "",
    icon: "https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/eth.svg",
    color: "#6366f1",
  },
  {
    chainId: 42161,
    name: "Arbitrum",
    symbol: "ETH",
    rpc: process.env.ARB_RPC_URL || "https://1rpc.io/arb",
    explorer: "https://api.arbiscan.io/api",
    explorerKey: process.env.ARBISCAN_API_KEY || "",
    icon: "https://cryptologos.cc/logos/arbitrum-arb-logo.svg",
    color: "#28A0F0",
  },
  {
    chainId: 8453,
    name: "Base",
    symbol: "ETH",
    rpc: process.env.BASE_RPC_URL || "https://1rpc.io/base",
    explorer: "https://api.basescan.org/api",
    explorerKey: process.env.BASESCAN_API_KEY || "",
    icon: "https://avatars.githubusercontent.com/u/108554348",
    color: "#0052FF",
  },
  {
    chainId: 10,
    name: "Optimism",
    symbol: "ETH",
    rpc: process.env.OP_RPC_URL || "https://1rpc.io/op",
    explorer: "https://api-optimistic.etherscan.io/api",
    explorerKey: process.env.ETHERSCAN_API_KEY || "",
    icon: "https://cryptologos.cc/logos/optimism-ethereum-op-logo.svg",
    color: "#FF0420",
  },
  {
    chainId: 137,
    name: "Polygon",
    symbol: "MATIC",
    rpc: process.env.MATIC_RPC_URL || "https://1rpc.io/matic",
    explorer: "https://api.polygonscan.com/api",
    explorerKey: process.env.POLYGONSCAN_API_KEY || "",
    icon: "https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/matic.svg",
    color: "#8247E5",
  },
  {
    chainId: 56,
    name: "BNB Chain",
    symbol: "BNB",
    rpc: process.env.BSC_RPC_URL || "https://1rpc.io/bnb",
    explorer: "https://api.bscscan.com/api",
    explorerKey: process.env.BSCSCAN_API_KEY || "",
    icon: "https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/bnb.svg",
    color: "#F0B90B",
  },
];

// ---- 代币图标 ----
const ICON_CDN = "https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color";
const TOKEN_ICONS: Record<string, string> = {
  ETH: `${ICON_CDN}/eth.svg`, WETH: `${ICON_CDN}/eth.svg`,
  stETH: `${ICON_CDN}/eth.svg`, wstETH: `${ICON_CDN}/eth.svg`,
  BNB: `${ICON_CDN}/bnb.svg`, WBNB: `${ICON_CDN}/bnb.svg`,
  MATIC: `${ICON_CDN}/matic.svg`, WMATIC: `${ICON_CDN}/matic.svg`,
  USDT: `${ICON_CDN}/usdt.svg`, USDC: `${ICON_CDN}/usdc.svg`,
  "USDC.e": `${ICON_CDN}/usdc.svg`, USDbC: `${ICON_CDN}/usdc.svg`,
  DAI: `${ICON_CDN}/dai.svg`, WBTC: `${ICON_CDN}/btc.svg`,
  BTCB: `${ICON_CDN}/btc.svg`, LINK: `${ICON_CDN}/link.svg`,
  UNI: `${ICON_CDN}/uni.svg`, AAVE: `${ICON_CDN}/aave.svg`,
  CRV: `${ICON_CDN}/crv.svg`,
};

// ============================================================
// Step 1: 通过区块浏览器 API 发现钱包历史上收到的所有 ERC20 代币
// ============================================================
interface TokenInfo { address: string; symbol: string; decimals: number; name: string }

async function discoverTokens(explorerUrl: string, apiKey: string, walletAddress: string): Promise<TokenInfo[]> {
  try {
    // 获取最近 200 条 ERC20 转账记录，从中提取不重复的合约地址
    const url = `${explorerUrl}?module=account&action=tokentx&address=${walletAddress}&page=1&offset=200&sort=desc${apiKey ? `&apikey=${apiKey}` : ""}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json() as { status: string; result: any[] };
    if (data.status !== "1" || !Array.isArray(data.result)) return [];

    // 按合约地址去重，保留 symbol / decimals / name
    const seen = new Map<string, TokenInfo>();
    for (const tx of data.result) {
      const addr = (tx.contractAddress || "").toLowerCase();
      if (addr && !seen.has(addr)) {
        seen.set(addr, {
          address:  tx.contractAddress,
          symbol:   tx.tokenSymbol   || "UNKNOWN",
          decimals: parseInt(tx.tokenDecimal || "18"),
          name:     tx.tokenName     || tx.tokenSymbol || "",
        });
      }
    }
    return [...seen.values()].slice(0, 80); // 最多 80 个代币，避免 Multicall 过大
  } catch {
    return [];
  }
}

// ============================================================
// Step 2: Multicall3 批量查询所有代币余额（1 个 RPC 请求搞定）
// ============================================================

// aggregate3 selector: 0x82ad56cb
// balanceOf(address) selector: 0x70a08231
// eth_getBalance 通过 aggregate3 中对 WETH-like 合约调用不行，原生余额要单独处理

async function multicallBalances(
  rpcUrl: string,
  walletAddress: string,
  tokens: TokenInfo[]
): Promise<Map<string, bigint>> {
  if (!tokens.length) return new Map();

  const pad = (s: string) => s.replace("0x", "").toLowerCase().padStart(64, "0");
  const balanceOfData = "0x70a08231" + pad(walletAddress);

  // 构造 aggregate3 的 calls 参数
  const calls = tokens.map(t => ({
    target:       t.address,
    allowFailure: true,
    callData:     balanceOfData,
  }));

  // ABI 手动编码 aggregate3((address,bool,bytes)[])
  const encoded = encodeAggregate3(calls);

  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", method: "eth_call",
        params: [{ to: MULTICALL3, data: encoded }, "latest"],
        id: 1,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json() as { result?: string };
    if (!json.result || json.result === "0x") return new Map();

    // 解码返回值：(bool success, bytes returnData)[]
    const balances = decodeAggregate3Result(json.result, tokens.length);
    const result = new Map<string, bigint>();
    tokens.forEach((t, i) => {
      if (balances[i] !== null) result.set(t.address.toLowerCase(), balances[i]!);
    });
    return result;
  } catch {
    return new Map();
  }
}

function encodeAggregate3(calls: { target: string; allowFailure: boolean; callData: string }[]): string {
  const selector = "0x82ad56cb";
  const pad64 = (n: number) => n.toString(16).padStart(64, "0");
  const padAddr = (s: string) => s.replace("0x", "").padStart(64, "0");
  const padBool = (b: boolean) => (b ? "1" : "0").padStart(64, "0");

  // offset of the array
  let enc = pad64(32); // array offset = 0x20
  enc += pad64(calls.length);

  // tuple offsets
  const baseOffset = calls.length * 32;
  let tupleData = "";
  let currentOffset = baseOffset;
  const offsets: number[] = [];

  for (const c of calls) {
    offsets.push(currentOffset);
    const dataHex = c.callData.replace("0x", "");
    // each tuple: address(32) + bool(32) + bytes_offset(32) + bytes_len(32) + bytes_data(padded)
    const tupleSize = 3 * 32 + 32 + Math.ceil(dataHex.length / 2 / 32) * 32;
    currentOffset += tupleSize;
  }

  for (let i = 0; i < calls.length; i++) {
    enc += pad64(offsets[i]);
  }

  for (const c of calls) {
    const dataHex = c.callData.replace("0x", "");
    const dataLen = dataHex.length / 2;
    const paddedData = dataHex.padEnd(Math.ceil(dataLen / 32) * 32 * 2, "0");
    // bytes offset within tuple is at position 2*32 = 64 bytes
    tupleData += padAddr(c.target);
    tupleData += padBool(c.allowFailure);
    tupleData += pad64(64); // callData offset within this tuple
    tupleData += pad64(dataLen);
    tupleData += paddedData;
  }

  return selector + enc + tupleData;
}

function decodeAggregate3Result(hexResult: string, count: number): (bigint | null)[] {
  const data = hexResult.replace("0x", "");
  const results: (bigint | null)[] = [];

  try {
    // Skip offset (32 bytes) + array length (32 bytes) = 64 bytes = 128 hex chars
    // Then skip array element offsets (count * 32 bytes = count * 64 hex chars)
    const arrayStart = 128 + count * 64;

    for (let i = 0; i < count; i++) {
      // Each element: success (32 bytes) + offset (32 bytes), then bytes (32 len + data)
      const elemOffset = parseInt(data.slice(64, 128 + i * 64 + 128 - (128 + i * 64)), 16);
      // More reliable: just parse sequentially
      const base = arrayStart + i * 128;
      if (base + 128 > data.length) { results.push(null); continue; }
      const success = parseInt(data.slice(base, base + 64), 16);
      // bytes offset relative to element start
      const bytesRelOffset = parseInt(data.slice(base + 64, base + 128), 16);
      const bytesStart = base + bytesRelOffset * 2;
      if (!success || bytesStart + 64 > data.length) { results.push(null); continue; }
      const bytesLen = parseInt(data.slice(bytesStart, bytesStart + 64), 16);
      if (bytesLen === 0) { results.push(BigInt(0)); continue; }
      const balHex = data.slice(bytesStart + 64, bytesStart + 64 + 64);
      results.push(balHex ? BigInt("0x" + balHex) : null);
    }
  } catch {
    return Array(count).fill(null);
  }
  return results;
}

// ============================================================
// Step 3: 原生代币余额（eth_getBalance）
// ============================================================
async function getNativeBalance(rpcUrl: string, address: string): Promise<bigint> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"], id: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json() as { result?: string };
    return json.result ? BigInt(json.result) : BigInt(0);
  } catch { return BigInt(0); }
}

// ============================================================
// Step 4: 价格数据（多源降级）
// ============================================================
let priceCache: { prices: Record<string, number>; ts: number } | null = null;
const PRICE_TTL = 60_000; // 60 秒价格缓存

async function getTokenPrices(): Promise<Record<string, number>> {
  if (priceCache && Date.now() - priceCache.ts < PRICE_TTL) return priceCache.prices;

  const ids = [
    "ethereum,bitcoin,binancecoin,polygon-ecosystem-token,arbitrum,optimism,dai,",
    "chainlink,uniswap,aave,curve-dao-token,lido-dao,maker,compound-governance-token,",
    "synthetix-network-token,the-graph,pendle,rocket-pool-eth,staked-ether,gmx,",
    "pancakeswap-token,aerodrome-finance,matic-network,wrapped-bitcoin,frax",
  ].join("").replace(/,$/, "");

  // 来源 1：CoinGecko
  const cg = await fetchCoinGecko(ids);

  // 来源 2：OKX 公开行情（补充 CoinGecko 缺失的价格）
  const okx = await fetchOKXPrices();

  const merge = { ...cg, ...okx };

  const prices: Record<string, number> = {
    ETH:     merge["ethereum"]                    || 2700,
    WETH:    merge["ethereum"]                    || 2700,
    stETH:   merge["staked-ether"]                || merge["ethereum"] || 2700,
    wstETH:  merge["staked-ether"]                || merge["ethereum"] || 2700,
    rETH:    merge["rocket-pool-eth"]             || merge["ethereum"] || 2700,
    cbETH:   merge["ethereum"]                    || 2700,
    BNB:     merge["binancecoin"]                 || 680,
    WBNB:    merge["binancecoin"]                 || 680,
    MATIC:   merge["polygon-ecosystem-token"]     || merge["matic-network"] || 0.38,
    WMATIC:  merge["polygon-ecosystem-token"]     || 0.38,
    POL:     merge["polygon-ecosystem-token"]     || 0.38,
    ARB:     merge["arbitrum"]                    || 0.35,
    OP:      merge["optimism"]                    || 0.90,
    DAI:     merge["dai"]                         || 1.0,
    USDT:    1, USDC: 1, "USDC.e": 1, USDbC: 1, FRAX: 1, LUSD: 1, USDD: 1,
    WBTC:    merge["wrapped-bitcoin"]             || merge["bitcoin"] || 98000,
    BTCB:    merge["bitcoin"]                     || 98000,
    LINK:    merge["chainlink"]                   || 14,
    UNI:     merge["uniswap"]                     || 7,
    AAVE:    merge["aave"]                        || 160,
    CRV:     merge["curve-dao-token"]             || 0.55,
    LDO:     merge["lido-dao"]                    || 1.2,
    MKR:     merge["maker"]                       || 1400,
    COMP:    merge["compound-governance-token"]   || 50,
    SNX:     merge["synthetix-network-token"]     || 1.5,
    GRT:     merge["the-graph"]                   || 0.12,
    PENDLE:  merge["pendle"]                      || 3.5,
    GMX:     merge["gmx"]                         || 18,
    CAKE:    merge["pancakeswap-token"]            || 2.5,
    AERO:    merge["aerodrome-finance"]            || 0.6,
  };

  priceCache = { prices, ts: Date.now() };
  return prices;
}

async function fetchCoinGecko(ids: string): Promise<Record<string, number>> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return {};
    const raw = await res.json() as Record<string, { usd?: number }>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v?.usd) out[k] = v.usd;
    }
    return out;
  } catch { return {}; }
}

async function fetchOKXPrices(): Promise<Record<string, number>> {
  const PAIRS = ["ETH-USDT","BTC-USDT","BNB-USDT","SOL-USDT","ARB-USDT","OP-USDT","MATIC-USDT","LINK-USDT","UNI-USDT","AAVE-USDT"];
  try {
    const tickers = await Promise.all(
      PAIRS.map(p => fetch(`https://www.okx.com/api/v5/market/ticker?instId=${p}`, { signal: AbortSignal.timeout(4000) })
        .then(r => r.json()).then((d: any) => ({ sym: p.replace("-USDT",""), px: parseFloat(d.data?.[0]?.last || "0") }))
        .catch(() => null))
    );
    const MAP: Record<string, string> = {
      ETH: "ethereum", BTC: "bitcoin", BNB: "binancecoin", SOL: "solana",
      ARB: "arbitrum", OP: "optimism", MATIC: "polygon-ecosystem-token",
      LINK: "chainlink", UNI: "uniswap", AAVE: "aave",
    };
    const out: Record<string, number> = {};
    for (const t of tickers) {
      if (t && t.px > 0 && MAP[t.sym]) out[MAP[t.sym]] = t.px;
    }
    return out;
  } catch { return {}; }
}

// ============================================================
// 主 Handler
// ============================================================
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const force   = searchParams.get("force") === "true";

  if (!address?.match(/^0x[a-fA-F0-9]{40}$/)) {
    return NextResponse.json({ error: "无效地址" }, { status: 400 });
  }

  // 并行处理所有链
  const [prices, chainResults] = await Promise.all([
    getTokenPrices(),
    Promise.all(CHAINS.map(chain => fetchChainData(chain, address))),
  ]);

  // 汇总
  const finalChains = [];
  let portfolioTotal = 0;

  for (const r of chainResults) {
    if (!r) continue;
    const tokens: { symbol: string; name: string; balance: string; usdValue: number; icon: string; contractAddress?: string }[] = [];
    let chainTotal = 0;

    // 原生代币
    const nativeAmt = Number(r.nativeBalance) / 1e18;
    const nativeUsd = nativeAmt * (prices[r.chain.symbol] || 0);
    if (nativeAmt > 1e-7) {
      tokens.push({
        symbol: r.chain.symbol,
        name:   r.chain.name + " 原生代币",
        balance: formatBalance(nativeAmt, 6),
        usdValue: nativeUsd,
        icon: TOKEN_ICONS[r.chain.symbol] || r.chain.icon,
      });
      chainTotal += nativeUsd;
    }

    // ERC20 代币
    for (const token of r.tokens) {
      const rawBal = r.balances.get(token.address.toLowerCase());
      if (rawBal === undefined || rawBal === null) continue;
      const decimals = token.decimals || 18;
      const amount = Number(rawBal) / Math.pow(10, decimals);
      if (amount < 1e-8) continue; // 跳过粉尘

      // 价格查找（symbol 匹配）
      const priceUsd = prices[token.symbol] || prices[token.symbol.replace(".e", "")] || 0;
      const usdValue = amount * priceUsd;

      // 只显示有价值的（> $0.01）或稳定币（usdValue > 0 but price might be 0）
      if (usdValue < 0.01 && priceUsd > 0) continue;

      tokens.push({
        symbol:          token.symbol,
        name:            token.name || token.symbol,
        balance:         formatBalance(amount, decimals > 6 ? 6 : decimals),
        usdValue,
        icon:            TOKEN_ICONS[token.symbol] || `${ICON_CDN}/${token.symbol.toLowerCase()}.svg`,
        contractAddress: token.address,
      });
      chainTotal += usdValue;
    }

    // 按 USD 值排序
    tokens.sort((a, b) => b.usdValue - a.usdValue);

    if (tokens.length > 0) {
      finalChains.push({
        chainId:   r.chain.chainId,
        chainName: r.chain.name,
        icon:      r.chain.icon,
        color:     r.chain.color,
        tokens,
        totalUsd: chainTotal,
        tokenCount: tokens.length,
      });
      portfolioTotal += chainTotal;
    }
  }

  finalChains.sort((a, b) => b.totalUsd - a.totalUsd);

  return NextResponse.json({
    success:          true,
    chainBalances:    finalChains,
    totalPortfolioUsd: portfolioTotal,
    priceSource:      "CoinGecko + OKX",
    tokenDiscovery:   "BlockExplorer + Multicall3",
    timestamp:        Date.now(),
  });
}

// ---- 单链数据获取 ----
async function fetchChainData(chain: typeof CHAINS[number], address: string) {
  try {
    // Step A: 发现代币（区块浏览器 API）
    const tokens = await discoverTokens(chain.explorer, chain.explorerKey, address);

    // Step B: 批量查询余额（Multicall3）
    const [nativeBalance, balances] = await Promise.all([
      getNativeBalance(chain.rpc, address),
      multicallBalances(chain.rpc, address, tokens),
    ]);

    return { chain, nativeBalance, tokens, balances };
  } catch {
    return null;
  }
}

// ---- 余额格式化（保留有效数字）----
function formatBalance(amount: number, maxDecimals: number): string {
  if (amount === 0) return "0";
  if (amount >= 1000) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (amount >= 1)    return amount.toFixed(4);
  if (amount >= 0.001) return amount.toFixed(6);
  return amount.toExponential(4);
}
