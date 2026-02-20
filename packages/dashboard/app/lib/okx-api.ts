/**
 * OKX 交易所 REST API 客户端
 * 支持现货 + 合约，签名认证
 */

import crypto from "crypto";

export interface OKXConfig {
  apiKey:     string;
  secretKey:  string;
  passphrase: string;
  simulated?: boolean; // true = 模拟盘
}

// ---- OKX 响应类型 ----
export interface OKXAccount {
  totalEq:  string; // 总权益 USD
  adjEq:    string; // 调整后权益
  isoEq:    string; // 逐仓权益
  details:  OKXBalanceDetail[];
}

export interface OKXBalanceDetail {
  ccy:       string;
  eq:        string;
  availEq:   string;
  frozenBal: string;
  usdVal:    string;
}

export interface OKXPosition {
  instId:    string;
  instType:  string; // SPOT / FUTURES / SWAP / MARGIN
  mgnMode:   string; // cross / isolated
  posSide:   string; // long / short / net
  pos:       string; // 持仓数量
  notionalUsd: string;
  avgPx:     string; // 开仓均价
  markPx:    string; // 标记价格
  upl:       string; // 未实现盈亏
  uplRatio:  string;
  lever:     string;
  liqPx:     string; // 强平价格
  realizedPnl: string;
  fundingRate?: string;
}

export interface OKXTicker {
  instId:  string;
  last:    string;
  askPx:   string;
  bidPx:   string;
  open24h: string;
  high24h: string;
  low24h:  string;
  vol24h:  string;
  ts:      string;
  sodUtc0: string;
}

export interface OKXFundingRate {
  instId:          string;
  fundingRate:     string; // 当期资金费率
  nextFundingRate: string; // 预测下期
  fundingTime:     string; // 下次结算时间 ms
  method:          string;
}

export interface OKXOrder {
  ordId:    string;
  clOrdId:  string;
  instId:   string;
  instType: string;
  side:     string; // buy / sell
  posSide:  string;
  ordType:  string; // market / limit / post_only
  sz:       string;
  px:       string;
  fillSz:   string;
  avgPx:    string;
  state:    string; // live / filled / canceled / partially_filled
  pnl:      string;
  fee:      string;
  cTime:    string;
  uTime:    string;
}

export interface PlaceOrderParams {
  instId:   string;
  tdMode:   "cash" | "cross" | "isolated"; // cash=现货, cross=全仓合约
  side:     "buy" | "sell";
  ordType:  "market" | "limit" | "post_only";
  sz:       string;
  px?:      string;
  posSide?: "long" | "short" | "net";
  clOrdId?: string;
  reduceOnly?: boolean;
}

// ---- 签名工具 ----
function sign(timestamp: string, method: string, path: string, body: string, secretKey: string): string {
  const preHash = timestamp + method.toUpperCase() + path + (body || "");
  return crypto.createHmac("sha256", secretKey).update(preHash).digest("base64");
}

function timestamp(): string {
  return new Date().toISOString();
}

// ---- OKX API 客户端 ----
export class OKXApiClient {
  private base = "https://www.okx.com";
  private cfg: OKXConfig;

  constructor(cfg: OKXConfig) {
    this.cfg = cfg;
  }

  private headers(method: string, path: string, body = "") {
    const ts = timestamp();
    const sig = sign(ts, method, path, body, this.cfg.secretKey);
    return {
      "OK-ACCESS-KEY":        this.cfg.apiKey,
      "OK-ACCESS-SIGN":       sig,
      "OK-ACCESS-TIMESTAMP":  ts,
      "OK-ACCESS-PASSPHRASE": this.cfg.passphrase,
      "Content-Type":         "application/json",
      ...(this.cfg.simulated ? { "x-simulated-trading": "1" } : {}),
    };
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    const fullPath = path + qs;
    const res = await fetch(this.base + fullPath, {
      headers: this.headers("GET", fullPath),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json() as { code: string; msg: string; data: T };
    if (data.code !== "0") throw new Error(`OKX API Error ${data.code}: ${data.msg}`);
    return data.data;
  }

  private async post<T>(path: string, body: object): Promise<T> {
    const bodyStr = JSON.stringify(body);
    const res = await fetch(this.base + path, {
      method: "POST",
      headers: this.headers("POST", path, bodyStr),
      body: bodyStr,
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json() as { code: string; msg: string; data: T };
    if (data.code !== "0") throw new Error(`OKX API Error ${data.code}: ${data.msg}`);
    return data.data;
  }

  // ---- 账户 ----
  async getAccountBalance(): Promise<OKXAccount> {
    const rows = await this.get<OKXAccount[]>("/api/v5/account/balance");
    return rows[0];
  }

  async getPositions(instType?: string): Promise<OKXPosition[]> {
    const params: Record<string, string> = {};
    if (instType) params.instType = instType;
    return this.get<OKXPosition[]>("/api/v5/account/positions", params);
  }

  async getAccountConfig() {
    return this.get("/api/v5/account/config");
  }

  // ---- 行情 ----
  async getTicker(instId: string): Promise<OKXTicker> {
    const rows = await this.get<OKXTicker[]>("/api/v5/market/ticker", { instId });
    return rows[0];
  }

  async getTickers(instType: string): Promise<OKXTicker[]> {
    return this.get<OKXTicker[]>("/api/v5/market/tickers", { instType });
  }

  async getMarkPrice(instId: string) {
    return this.get("/api/v5/public/mark-price", { instId });
  }

  // ---- 资金费率 ----
  async getFundingRate(instId: string): Promise<OKXFundingRate> {
    const rows = await this.get<OKXFundingRate[]>("/api/v5/public/funding-rate", { instId });
    return rows[0];
  }

  async getFundingRateHistory(instId: string, limit = 10) {
    return this.get("/api/v5/public/funding-rate-history", { instId, limit: String(limit) });
  }

  // ---- 下单 ----
  async placeOrder(params: PlaceOrderParams): Promise<{ ordId: string; clOrdId: string }[]> {
    return this.post<{ ordId: string; clOrdId: string }[]>("/api/v5/trade/order", params);
  }

  async placeBatchOrders(orders: PlaceOrderParams[]) {
    return this.post("/api/v5/trade/batch-orders", orders);
  }

  async cancelOrder(instId: string, ordId: string) {
    return this.post("/api/v5/trade/cancel-order", { instId, ordId });
  }

  async cancelAllOrders(instId: string) {
    const orders = await this.getPendingOrders(instId);
    if (!orders.length) return;
    return this.post("/api/v5/trade/cancel-batch-orders",
      orders.map(o => ({ instId, ordId: o.ordId }))
    );
  }

  async getPendingOrders(instId?: string): Promise<OKXOrder[]> {
    const params: Record<string, string> = {};
    if (instId) params.instId = instId;
    return this.get<OKXOrder[]>("/api/v5/trade/orders-pending", params);
  }

  async getOrderHistory(instType: string, limit = 20): Promise<OKXOrder[]> {
    return this.get<OKXOrder[]>("/api/v5/trade/orders-history", {
      instType,
      limit: String(limit),
    });
  }

  // ---- 合约设置 ----
  async setLeverage(instId: string, lever: string, mgnMode: "cross" | "isolated") {
    return this.post("/api/v5/account/set-leverage", { instId, lever, mgnMode });
  }

  async closePosition(instId: string, mgnMode: "cross" | "isolated", posSide?: string) {
    return this.post("/api/v5/trade/close-position", {
      instId,
      mgnMode,
      ...(posSide ? { posSide } : {}),
    });
  }

  // ---- 资产划转 ----
  async transfer(ccy: string, amt: string, from: "6" | "18", to: "6" | "18") {
    // from/to: 6=资金账户, 18=交易账户
    return this.post("/api/v5/asset/transfer", { ccy, amt, from, to, type: "0" });
  }
}

// ---- 从环境/数据库获取 OKX config ----
export function getOKXConfig(overrides?: Partial<OKXConfig>): OKXConfig | null {
  const apiKey     = overrides?.apiKey     || process.env.OKX_API_KEY     || "";
  const secretKey  = overrides?.secretKey  || process.env.OKX_SECRET_KEY  || "";
  const passphrase = overrides?.passphrase || process.env.OKX_PASSPHRASE  || "";
  const simulated  = overrides?.simulated  ?? (process.env.OKX_SIMULATED === "true");

  if (!apiKey || !secretKey || !passphrase) return null;
  return { apiKey, secretKey, passphrase, simulated };
}

// ---- 免认证公开行情（不需要 API Key）----
export async function getPublicTicker(instId: string): Promise<OKXTicker | null> {
  try {
    const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json() as { code: string; data: OKXTicker[] };
    return data.code === "0" ? data.data[0] : null;
  } catch { return null; }
}

export async function getPublicFundingRate(instId: string): Promise<OKXFundingRate | null> {
  try {
    const res = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json() as { code: string; data: OKXFundingRate[] };
    return data.code === "0" ? data.data[0] : null;
  } catch { return null; }
}

// ---- 批量获取主流永续合约资金费率 ----
export async function getTopFundingRates(symbols = ["BTC", "ETH", "SOL", "BNB", "ARB", "OP", "DOGE", "XRP"]): Promise<
  { instId: string; rate: number; annualized: number; nextFundingTime: string }[]
> {
  const results = await Promise.allSettled(
    symbols.map(s => getPublicFundingRate(`${s}-USDT-SWAP`))
  );

  return results
    .map((r, i) => {
      if (r.status !== "fulfilled" || !r.value) return null;
      const v = r.value;
      const rate = parseFloat(v.fundingRate);
      return {
        instId: v.instId,
        rate,
        annualized: rate * 3 * 365 * 100, // 每日3次结算，年化
        nextFundingTime: v.fundingTime,
      };
    })
    .filter(Boolean) as { instId: string; rate: number; annualized: number; nextFundingTime: string }[];
}
