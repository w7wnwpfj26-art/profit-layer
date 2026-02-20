import { NextResponse } from "next/server";
import { sendTelegramMessage } from "../../../lib/telegram";

// POST: 测试 Telegram 通知
export async function POST() {
  const testMessage = `🔔 <b>测试通知</b>\n\nProfitLayer 通知服务已连接成功！\n\n⏰ ${new Date().toLocaleString("zh-CN")}`;
  
  const result = await sendTelegramMessage(testMessage);
  
  if (result.success) {
    return NextResponse.json({ 
      success: true, 
      message: "测试消息已发送，请检查 Telegram" 
    });
  } else {
    return NextResponse.json({ 
      success: false, 
      error: result.error 
    }, { status: 400 });
  }
}
