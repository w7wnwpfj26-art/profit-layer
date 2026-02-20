/**
 * /api/trading
 *
 * GET  ?action=funding-rates   — 主流币资金费率扫描
 * GET  ?action=account         — OKX 账户余额（需 API Key）
 * GET  ?action=positions       — 当前持仓
 * GET  ?action=orders          — 挂单列表
 * GET  ?action=ticker&instId=  — 单品行情
 * GET  ?action=opportunities   — 套利机会扫描
 * POST action=open-arb         — 开套利仓
 * POST action=close-arb        — 平套利仓
 * POST action=place-order      — 手动下单
 * POST action=cancel-order     — 撤单
 */

import { NextResponse } from "next/server";
import {
  OKXApiClient, getOKXConfig, getTopFundingRates, getPublicTicker,
} from "../../lib/okx-api";
import {
  scanArbOpportunities, openArbPosition, closeArbPosition, DEFAULT_ARB_CONFIG,
} from "../../lib/funding-arb";

const SCAN_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "ARB", "OP", "DOGE", "XRP", "MATIC", "LINK"];

// ---- 辅助：构建 OKX 客户端（若无 Key 则返回 null）----
function buildClient(body?: any) {
  const cfg = getOKXConfig({
    apiKey:     body?.apiKey,
    secretKey:  body?.secretKey,
    passphrase: body?.passphrase,
    simulated:  body?.simulated ?? true,
  });
  if (!cfg) return null;
  return new OKXApiClient(cfg);
}

// ============================================================
// GET
// ============================================================
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "funding-rates";

  // ---- 公开行情（无需 API Key）----
  if (action === "funding-rates") {
    const rates = await getTopFundingRates(SCAN_SYMBOLS);
    rates.sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate));
    return NextResponse.json({ success: true, rates });
  }

  if (action === "ticker") {
    const instId = searchParams.get("instId") || "BTC-USDT";
    const ticker = await getPublicTicker(instId);
    return NextResponse.json({ success: !!ticker, ticker });
  }

  if (action === "opportunities") {
    const opps = await scanArbOpportunities(SCAN_SYMBOLS);
    return NextResponse.json({ success: true, opportunities: opps });
  }

  // ---- 需要 API Key ----
  const cfg = getOKXConfig();
  if (!cfg) {
    return NextResponse.json({
      success: false,
      error: "未配置 OKX API Key，请在「系统设置」中填写 OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE",
      needConfig: true,
    });
  }

  const client = new OKXApiClient(cfg);

  if (action === "account") {
    try {
      const account = await client.getAccountBalance();
      return NextResponse.json({ success: true, account });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  if (action === "positions") {
    try {
      const positions = await client.getPositions();
      return NextResponse.json({ success: true, positions });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  if (action === "orders") {
    try {
      const instId = searchParams.get("instId") || undefined;
      const orders = await client.getPendingOrders(instId);
      return NextResponse.json({ success: true, orders });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  if (action === "history") {
    try {
      const instType = searchParams.get("instType") || "SWAP";
      const limit    = parseInt(searchParams.get("limit") || "20");
      const orders   = await client.getOrderHistory(instType, limit);
      return NextResponse.json({ success: true, orders });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "未知 action" }, { status: 400 });
}

// ============================================================
// POST
// ============================================================
export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;

  const client = buildClient(body);

  // ---- 开套利仓 ----
  if (action === "open-arb") {
    if (!client) return NextResponse.json({ success: false, error: "未配置 API Key" }, { status: 400 });
    const { symbol, sizeUsd, config } = body;
    const opps = await scanArbOpportunities([symbol], { ...DEFAULT_ARB_CONFIG, ...config });
    if (!opps.length || !opps[0].viable) {
      return NextResponse.json({
        success: false,
        error: opps[0]?.reason || "当前无套利机会",
        opportunity: opps[0],
      });
    }
    const result = await openArbPosition(client, opps[0], sizeUsd || 1000, { ...DEFAULT_ARB_CONFIG, ...config });
    return NextResponse.json({ success: result.ok, result, opportunity: opps[0] });
  }

  // ---- 平套利仓 ----
  if (action === "close-arb") {
    if (!client) return NextResponse.json({ success: false, error: "未配置 API Key" }, { status: 400 });
    const { symbol, sz } = body;
    const result = await closeArbPosition(client, symbol, sz);
    return NextResponse.json({ success: result.ok, ...result });
  }

  // ---- 手动下单 ----
  if (action === "place-order") {
    if (!client) return NextResponse.json({ success: false, error: "未配置 API Key" }, { status: 400 });
    try {
      const { instId, tdMode, side, ordType, sz, px, posSide } = body;
      const res = await client.placeOrder({ instId, tdMode, side, ordType, sz, px, posSide });
      return NextResponse.json({ success: true, orderId: res[0]?.ordId });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  // ---- 撤单 ----
  if (action === "cancel-order") {
    if (!client) return NextResponse.json({ success: false, error: "未配置 API Key" }, { status: 400 });
    try {
      const { instId, ordId } = body;
      await client.cancelOrder(instId, ordId);
      return NextResponse.json({ success: true });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  // ---- 设置杠杆 ----
  if (action === "set-leverage") {
    if (!client) return NextResponse.json({ success: false, error: "未配置 API Key" }, { status: 400 });
    try {
      const { instId, lever, mgnMode } = body;
      await client.setLeverage(instId, lever, mgnMode || "cross");
      return NextResponse.json({ success: true });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "未知 action" }, { status: 400 });
}
