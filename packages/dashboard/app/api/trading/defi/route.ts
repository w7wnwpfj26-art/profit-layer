/**
 * /api/trading/defi
 *
 * GET  ?action=markets          — GMX + Hyperliquid 行情 + 资金费率
 * GET  ?action=hl-positions&wallet= — Hyperliquid 持仓
 * GET  ?action=hl-opps          — Hyperliquid 套利机会扫描
 * GET  ?action=swap-quote&...   — 1inch 兑换报价
 * POST action=build-gmx-order   — 构建 GMX 链上交易（OKX 钱包签名）
 * POST action=build-hl-order    — 构建 Hyperliquid EIP-712 订单
 * POST action=build-swap        — 构建 DEX 兑换交易（OKX 钱包签名）
 */

import { NextResponse } from "next/server";
import { getGMXMarkets, buildGMXOrderTx, GMX } from "../../../lib/gmx-api";
import {
  getHLMarkets, getHLUserState, scanHLArbOpportunities,
  buildHLOrderPayload, submitHLOrder,
} from "../../../lib/hyperliquid-api";
import { getSwapQuote, buildSwapTx, TOKENS_ARB } from "../../../lib/dex-swap";

// ============================================================
// GET
// ============================================================
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "markets";

  // ---- 综合行情（GMX + Hyperliquid）----
  if (action === "markets") {
    const [gmx, hl] = await Promise.allSettled([
      getGMXMarkets(),
      getHLMarkets(),
    ]);

    return NextResponse.json({
      success: true,
      gmx:    gmx.status === "fulfilled" ? gmx.value : [],
      hl:     hl.status  === "fulfilled" ? hl.value.slice(0, 20) : [],
      // 合并资金费率榜单
      topFundingRates: mergeAndRank(
        gmx.status === "fulfilled" ? gmx.value : [],
        hl.status  === "fulfilled" ? hl.value  : []
      ),
    });
  }

  // ---- Hyperliquid 持仓 ----
  if (action === "hl-positions") {
    const wallet = searchParams.get("wallet");
    if (!wallet) return NextResponse.json({ success: false, error: "缺少 wallet 参数" });
    const state = await getHLUserState(wallet);
    return NextResponse.json({ success: !!state, state });
  }

  // ---- 套利机会扫描 ----
  if (action === "hl-opps") {
    const minAnn = parseFloat(searchParams.get("minAnn") || "15");
    const opps = await scanHLArbOpportunities(minAnn);
    return NextResponse.json({ success: true, opportunities: opps });
  }

  // ---- 1inch 兑换报价 ----
  if (action === "swap-quote") {
    const chainId  = parseInt(searchParams.get("chainId") || "42161");
    const from     = searchParams.get("from")   || "USDC";
    const to       = searchParams.get("to")     || "ETH";
    const amount   = searchParams.get("amount") || "100";
    const slippage = parseFloat(searchParams.get("slippage") || "0.5");

    const quote = await getSwapQuote({ chainId, fromToken: from, toToken: to, amount, slippage });
    return NextResponse.json({ success: !!quote, quote });
  }

  // ---- 可用代币列表 ----
  if (action === "tokens") {
    return NextResponse.json({ success: true, tokens: TOKENS_ARB });
  }

  return NextResponse.json({ error: "未知 action" }, { status: 400 });
}

// ============================================================
// POST
// ============================================================
export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;

  // ---- 构建 GMX 开仓交易 ----
  if (action === "build-gmx-order") {
    const {
      walletAddress, symbol, isLong, sizeUsd, collateralUsd, leverage = 1,
    } = body;

    if (!walletAddress || !symbol || sizeUsd === undefined) {
      return NextResponse.json({ success: false, error: "缺少必要参数" }, { status: 400 });
    }

    const markets = await getGMXMarkets();
    const market = markets.find(m => m.symbol === symbol);
    if (!market) return NextResponse.json({ success: false, error: `未找到市场: ${symbol}` }, { status: 400 });

    // USD → 链上精度（1e30）
    const sizeDeltaUsd = BigInt(Math.floor(sizeUsd * 1e28)) * BigInt(100);
    const colAmt = BigInt(Math.floor((collateralUsd || sizeUsd / leverage) * 1e6)); // USDC 6位精度

    // acceptablePrice：做多用 markPrice * 1.005，做空用 markPrice * 0.995
    const acceptablePrice = BigInt(Math.floor(market.price * (isLong ? 1.005 : 0.995) * 1e30));
    const executionFee = BigInt("100000000000000"); // 0.0001 ETH 执行费

    const txs = buildGMXOrderTx({
      walletAddress,
      market:             market.marketToken,
      collateralToken:    GMX.USDC,
      isLong,
      sizeDeltaUsd,
      collateralDeltaAmount: colAmt,
      acceptablePrice,
      executionFee,
    });

    return NextResponse.json({
      success: true,
      transactions: txs,
      summary: {
        symbol,
        direction: isLong ? "做多" : "做空",
        sizeUsd,
        entryPrice: market.price,
        leverage: leverage || 1,
        fundingRateAnnualized: market.fundingRateAnnualized,
        platform: "GMX v2",
        chain: "Arbitrum",
      },
    });
  }

  // ---- 构建 Hyperliquid EIP-712 订单 ----
  if (action === "build-hl-order") {
    const { walletAddress, coin, isBuy, sz, limitPx, isMarket = true } = body;

    if (!walletAddress || !coin || sz === undefined) {
      return NextResponse.json({ success: false, error: "缺少必要参数" }, { status: 400 });
    }

    const markets = await getHLMarkets();
    const market = markets.find(m => m.coin === coin);
    if (!market) return NextResponse.json({ success: false, error: `未找到市场: ${coin}` });

    const price = limitPx || parseFloat(market.markPx);
    // 市价单用极端价格确保成交
    const effectivePx = isMarket
      ? (isBuy ? price * 1.05 : price * 0.95)
      : price;

    const payload = buildHLOrderPayload(walletAddress, [{
      coin,
      isBuy,
      sz,
      limitPx: effectivePx,
      orderType: { limit: { tif: isMarket ? "Ioc" : "Gtc" } },
      reduceOnly: false,
    }]);

    return NextResponse.json({
      success: true,
      payload,
      summary: {
        coin,
        direction: isBuy ? "做多" : "做空",
        sz,
        price: effectivePx,
        notionalUsd: sz * parseFloat(market.markPx),
        platform: "Hyperliquid",
        fundingRateAnnualized: market.fundingAnnualized,
        note: "前端用 eth_signTypedData_v4 签名后调用 /api/trading/defi?action=submit-hl-order 提交",
      },
    });
  }

  // ---- 提交已签名的 HL 订单 ----
  if (action === "submit-hl-order") {
    const { hlAction, nonce, signature, vaultAddress } = body;
    try {
      const result = await submitHLOrder(hlAction, nonce, signature, vaultAddress);
      return NextResponse.json({ success: true, result });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  // ---- 构建 DEX 兑换交易 ----
  if (action === "build-swap") {
    const { chainId = 42161, fromToken, toToken, amount, walletAddress, slippage = 0.5 } = body;

    if (!walletAddress || !fromToken || !toToken || !amount) {
      return NextResponse.json({ success: false, error: "缺少必要参数" }, { status: 400 });
    }

    const [quote, tx] = await Promise.all([
      getSwapQuote({ chainId, fromToken, toToken, amount, slippage }),
      buildSwapTx({ chainId, fromToken, toToken, amount, walletAddress, slippage }),
    ]);

    if (!tx) return NextResponse.json({ success: false, error: "构建兑换交易失败" }, { status: 500 });

    return NextResponse.json({
      success: true,
      quote,
      transaction: {
        step: 1,
        description: `${fromToken} → ${toToken}（via ${quote?.protocols?.[0] || "DEX"}）`,
        fromToken, toToken,
        fromAmount: amount,
        toAmount: quote?.toAmount || "?",
        tx: {
          ...tx,
          chainId: `0x${chainId.toString(16)}`,
          from: walletAddress,
        },
      },
    });
  }

  return NextResponse.json({ error: "未知 action" }, { status: 400 });
}

// ---- 合并 GMX + Hyperliquid 资金费率排行 ----
function mergeAndRank(gmxMarkets: any[], hlMarkets: any[]) {
  const all = [
    ...gmxMarkets.map(m => ({
      platform: "GMX v2",
      chain:    "Arbitrum",
      symbol:   m.symbol,
      price:    m.price,
      fundingRateHourly: m.fundingRateHourly,
      annualized: m.fundingRateAnnualized,
      openInterest: m.openInterestLong + m.openInterestShort,
    })),
    ...hlMarkets.map(m => ({
      platform: "Hyperliquid",
      chain:    "HL L1",
      symbol:   m.coin,
      price:    parseFloat(m.markPx),
      fundingRateHourly: parseFloat(m.fundingRate),
      annualized: m.fundingAnnualized,
      openInterest: parseFloat(m.openInterest),
    })),
  ];

  return all
    .filter(m => m.fundingRateHourly > 0)
    .sort((a, b) => b.annualized - a.annualized)
    .slice(0, 15);
}
