import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import crypto from "crypto";

const getDb = () => getPool();

// 链配置
const CHAINS: Record<number, { name: string; rpc: string }> = {
  1: { name: "ethereum", rpc: "https://1rpc.io/eth" },
  42161: { name: "arbitrum", rpc: "https://1rpc.io/arb" },
  8453: { name: "base", rpc: "https://1rpc.io/base" },
  10: { name: "optimism", rpc: "https://1rpc.io/op" },
  137: { name: "polygon", rpc: "https://1rpc.io/matic" },
};

// 协议 ABI 编码
const ENCODERS = {
  // ERC20 approve(spender, amount)
  approve: (spender: string, amount: string = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") => {
    return "0x095ea7b3" +
      spender.replace("0x", "").padStart(64, "0") +
      amount.replace("0x", "").padStart(64, "0");
  },
  // Aave V3 supply(asset, amount, onBehalfOf, referralCode)
  aaveSupply: (asset: string, amount: bigint, onBehalfOf: string) => {
    return "0x617ba037" +
      asset.replace("0x", "").padStart(64, "0") +
      amount.toString(16).padStart(64, "0") +
      onBehalfOf.replace("0x", "").padStart(64, "0") +
      "0".padStart(64, "0"); // referralCode = 0
  },
  // Aave V3 withdraw(asset, amount, to)
  aaveWithdraw: (asset: string, amount: bigint, to: string) => {
    return "0x69328dec" +
      asset.replace("0x", "").padStart(64, "0") +
      amount.toString(16).padStart(64, "0") +
      to.replace("0x", "").padStart(64, "0");
  },
};

// 协议合约地址
const PROTOCOL_CONTRACTS: Record<string, Record<number, string>> = {
  "aave-v3-pool": {
    42161: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", // Arbitrum
    8453: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",  // Base
    1: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",     // Ethereum
  },
};

// 代币合约地址
const TOKEN_CONTRACTS: Record<string, Record<number, { address: string; decimals: number }>> = {
  USDC: {
    42161: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    8453: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    1: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  },
  USDT: {
    42161: { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
    1: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  },
  WETH: {
    42161: { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
    8453: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    1: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  },
};

interface BuildTxRequest {
  action: "approve" | "supply" | "withdraw" | "swap";
  chainId: number;
  protocol: string;
  token: string;
  amount: string; // 人类可读格式，如 "100" USDC
  walletAddress: string;
  spender?: string; // 仅 approve 需要
}

/**
 * POST: 构建交易并加入签名队列
 * 返回交易 ID，前端轮询签名状态
 */
export async function POST(request: Request) {
  try {
    const body: BuildTxRequest = await request.json();
    const { action, chainId, protocol, token, amount, walletAddress, spender } = body;

    if (!CHAINS[chainId]) {
      return NextResponse.json({ error: `不支持的链 ID: ${chainId}` }, { status: 400 });
    }

    const tokenInfo = TOKEN_CONTRACTS[token]?.[chainId];
    if (!tokenInfo && action !== "approve") {
      return NextResponse.json({ error: `不支持的代币: ${token} on chain ${chainId}` }, { status: 400 });
    }

    let txData: string;
    let toAddress: string;
    let valueHex = "0x0";

    switch (action) {
      case "approve": {
        const targetSpender = spender || PROTOCOL_CONTRACTS[`${protocol}-pool`]?.[chainId];
        if (!targetSpender) {
          return NextResponse.json({ error: `无法确定授权目标: ${protocol}` }, { status: 400 });
        }
        toAddress = tokenInfo?.address || "";
        if (!toAddress) {
          return NextResponse.json({ error: `找不到代币合约: ${token}` }, { status: 400 });
        }
        txData = ENCODERS.approve(targetSpender);
        break;
      }

      case "supply": {
        const poolAddress = PROTOCOL_CONTRACTS[`${protocol}-pool`]?.[chainId];
        if (!poolAddress) {
          return NextResponse.json({ error: `不支持的协议: ${protocol} on chain ${chainId}` }, { status: 400 });
        }
        toAddress = poolAddress;
        const amountWei = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, tokenInfo!.decimals)));
        txData = ENCODERS.aaveSupply(tokenInfo!.address, amountWei, walletAddress);
        break;
      }

      case "withdraw": {
        const poolAddress = PROTOCOL_CONTRACTS[`${protocol}-pool`]?.[chainId];
        if (!poolAddress) {
          return NextResponse.json({ error: `不支持的协议: ${protocol}` }, { status: 400 });
        }
        toAddress = poolAddress;
        // amount = "max" 表示全部提取
        const amountWei = amount === "max" 
          ? BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
          : BigInt(Math.floor(parseFloat(amount) * Math.pow(10, tokenInfo!.decimals)));
        txData = ENCODERS.aaveWithdraw(tokenInfo!.address, amountWei, walletAddress);
        break;
      }

      default:
        return NextResponse.json({ error: `不支持的操作: ${action}` }, { status: 400 });
    }

    // 构建交易 payload
    const txPayload = {
      from: walletAddress,
      to: toAddress,
      data: txData,
      value: valueHex,
      chainId: `0x${chainId.toString(16)}`,
    };

    // 生成唯一 ID
    const txId = crypto.randomUUID();

    // 计算预估 USD 价值（简化）
    const amountUsd = action === "approve" ? 0 : parseFloat(amount) * (token === "WETH" ? 2500 : 1);

    // 插入签名队列
    await getDb().query(`
      INSERT INTO pending_signatures (id, chain_id, tx_type, amount_usd, payload, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
    `, [txId, chainId, action, amountUsd, JSON.stringify(txPayload)]);

    return NextResponse.json({
      success: true,
      txId,
      payload: txPayload,
      message: `交易已构建，请在 OKX 钱包中确认`,
      action,
      token,
      amount,
      chainName: CHAINS[chainId].name,
    });

  } catch (err) {
    console.error("[TX Build API] error:", err);
    return NextResponse.json({ error: "构建交易失败" }, { status: 500 });
  }
}

/**
 * GET: 查询交易状态
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const txId = url.searchParams.get("txId");

    if (txId) {
      // 查询单个交易
      const result = await getDb().query(
        "SELECT id, chain_id, tx_type, amount_usd, payload, status, signature, created_at FROM pending_signatures WHERE id = $1",
        [txId]
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ error: "交易不存在" }, { status: 404 });
      }
      return NextResponse.json({ tx: result.rows[0] });
    }

    // 查询所有待签名交易
    const result = await getDb().query(`
      SELECT id, chain_id, tx_type, amount_usd, payload, status, created_at
      FROM pending_signatures
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `);

    return NextResponse.json({ queue: result.rows });
  } catch (err) {
    console.error("[TX Build API] error:", err);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
