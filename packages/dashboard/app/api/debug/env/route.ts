import { NextResponse } from "next/server";

/** 仅开发环境可访问，避免生产环境泄露配置信息 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }
  return NextResponse.json({
    POSTGRES_HOST: process.env.POSTGRES_HOST || "not set",
    POSTGRES_PORT: process.env.POSTGRES_PORT || "not set",
    POSTGRES_DB: process.env.POSTGRES_DB || "not set",
    POSTGRES_USER: process.env.POSTGRES_USER ? "***" + process.env.POSTGRES_USER.slice(-4) : "not set",
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ? "***" : "not set",
  });
}
