import { NextResponse } from "next/server";
import { getPool } from "../../lib/db";
import { notify } from "../../lib/telegram";

const pool = getPool();

// POST: 触发紧急停止
export async function POST(request: Request) {
  const client = await pool.connect();
  
  try {
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "手动触发";
    
    await client.query("BEGIN");
    
    // 1. 设置紧急停止开关
    await client.query(
      `UPDATE system_config SET value = 'true', updated_at = NOW() WHERE key = 'kill_switch'`
    );
    
    // 2. 禁用自动驾驶模式
    await client.query(
      `UPDATE system_config SET value = 'false', updated_at = NOW() WHERE key = 'autopilot_enabled'`
    );
    
    // 3. 将所有运行中的策略标记为暂停
    await client.query(
      `UPDATE strategies SET status = 'paused', updated_at = NOW() WHERE status = 'active'`
    );
    
    // 4. 取消所有待执行的交易
    await client.query(
      `UPDATE transactions SET status = 'cancelled', updated_at = NOW() WHERE status IN ('pending', 'queued')`
    );
    
    await client.query("COMMIT");
    
    // 5. 记录审计日志
    await pool.query(
      `INSERT INTO audit_log (event_type, severity, source, message, metadata)
       VALUES ('emergency_stop', 'critical', 'dashboard', $1, $2)`,
      [`紧急停止已触发: ${reason}`, JSON.stringify({ reason, timestamp: new Date().toISOString() })]
    );
    
    // 6. 发送 Telegram 通知
    await notify.emergency("紧急停止已触发", `原因: ${reason}\n\n所有策略已暂停，待执行交易已取消。`);
    
    return NextResponse.json({
      success: true,
      message: "紧急停止已执行",
      actions: [
        "kill_switch 已开启",
        "autopilot 已禁用", 
        "所有活跃策略已暂停",
        "待执行交易已取消",
        "Telegram 通知已发送"
      ]
    });
    
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ 
      success: false, 
      error: (err as Error).message 
    }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE: 解除紧急停止（恢复正常）
export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "手动解除";
    
    // 关闭紧急停止开关
    await pool.query(
      `UPDATE system_config SET value = 'false', updated_at = NOW() WHERE key = 'kill_switch'`
    );
    
    // 记录审计日志
    await pool.query(
      `INSERT INTO audit_log (event_type, severity, source, message, metadata)
       VALUES ('emergency_stop_lifted', 'info', 'dashboard', $1, $2)`,
      [`紧急停止已解除: ${reason}`, JSON.stringify({ reason, timestamp: new Date().toISOString() })]
    );
    
    // 发送通知
    await notify.systemStatus("started", `紧急停止已解除: ${reason}`);
    
    return NextResponse.json({
      success: true,
      message: "紧急停止已解除，系统恢复正常"
    });
    
  } catch (err) {
    return NextResponse.json({ 
      success: false, 
      error: (err as Error).message 
    }, { status: 500 });
  }
}

// GET: 获取紧急停止状态
export async function GET() {
  try {
    const result = await pool.query(
      `SELECT value FROM system_config WHERE key = 'kill_switch'`
    );
    
    const isActive = result.rows[0]?.value === 'true';
    
    // 获取最近的紧急停止日志
    const logs = await pool.query(
      `SELECT message, created_at FROM audit_log 
       WHERE event_type IN ('emergency_stop', 'emergency_stop_lifted')
       ORDER BY created_at DESC LIMIT 5`
    );
    
    return NextResponse.json({
      active: isActive,
      recentEvents: logs.rows.map(r => ({
        message: r.message,
        time: r.created_at
      }))
    });
    
  } catch (err) {
    return NextResponse.json({ 
      active: false, 
      error: (err as Error).message 
    }, { status: 500 });
  }
}
