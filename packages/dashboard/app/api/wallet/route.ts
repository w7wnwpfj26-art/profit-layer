import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";

const pool = getPool();

// GET: 获取已连接的钱包信息
export async function GET() {
  try {
    const result = await pool.query(`
      SELECT key, value FROM system_config 
      WHERE key IN ('evm_wallet_address', 'aptos_wallet_address', 'solana_wallet_address')
    `);

    const wallets: Record<string, string> = {};
    for (const row of result.rows) {
      const chainType = row.key.replace('_wallet_address', '');
      wallets[chainType] = row.value || '';
    }

    return NextResponse.json({ 
      success: true, 
      wallets,
      connected: Object.values(wallets).some(v => v && v.length > 0)
    });
  } catch (err) {
    console.error("[API] error:", (err as Error).message);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

// POST: 连接/同步钱包地址
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chainType, address, action } = body;

    // 验证参数
    if (!chainType || !['evm', 'aptos', 'solana'].includes(chainType)) {
      return NextResponse.json({ error: '无效的链类型' }, { status: 400 });
    }

    const configKey = `${chainType}_wallet_address`;

    if (action === 'connect') {
      // 连接钱包 - 保存地址
      if (!address || typeof address !== 'string') {
        return NextResponse.json({ error: '无效的钱包地址' }, { status: 400 });
      }

      // 验证地址格式
      if (chainType === 'evm' && !address.match(/^0x[a-fA-F0-9]{40}$/)) {
        return NextResponse.json({ error: 'EVM 地址格式无效' }, { status: 400 });
      }

      await pool.query(
        `UPDATE system_config SET value = $1, updated_at = NOW() WHERE key = $2`,
        [address, configKey]
      );

      // 记录审计日志
      await pool.query(
        `INSERT INTO audit_log (event_type, severity, source, message, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'wallet_connected',
          'info',
          'dashboard',
          `${chainType.toUpperCase()} 钱包已连接: ${address.slice(0, 6)}...${address.slice(-4)}`,
          JSON.stringify({ chainType, address }),
        ]
      );

      return NextResponse.json({ 
        success: true, 
        message: `${chainType.toUpperCase()} 钱包已连接`,
        address 
      });

    } else if (action === 'disconnect') {
      // 断开钱包连接
      await pool.query(
        `UPDATE system_config SET value = '', updated_at = NOW() WHERE key = $1`,
        [configKey]
      );

      await pool.query(
        `INSERT INTO audit_log (event_type, severity, source, message)
         VALUES ($1, $2, $3, $4)`,
        ['wallet_disconnected', 'info', 'dashboard', `${chainType.toUpperCase()} 钱包已断开连接`]
      );

      return NextResponse.json({ success: true, message: '钱包已断开连接' });

    } else {
      return NextResponse.json({ error: '无效的操作' }, { status: 400 });
    }

  } catch (err) {
    console.error("[API] error:", (err as Error).message);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
