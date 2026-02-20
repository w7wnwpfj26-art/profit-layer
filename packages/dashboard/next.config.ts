import type { NextConfig } from "next";
import path from "path";
import { readFileSync, existsSync } from "fs";
import createNextIntlPlugin from "next-intl/plugin";

// 若存在项目根目录 .env，优先加载（方便 monorepo 下与 docker-compose 共用配置）
const rootEnv = path.resolve(__dirname, "../../.env");
if (existsSync(rootEnv)) {
  const lines = readFileSync(rootEnv, "utf-8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: "standalone",
  
  // 安全头配置
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: (
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com; " +
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
              "img-src 'self' data: https:; " +
              "font-src 'self' https://fonts.gstatic.com; " +
              "connect-src 'self' https://*.supabase.co https://*.rpc.io https://*.alchemy.com https://*.infura.io; " +
              "frame-src 'self' https://www.okx.com; " +
              "object-src 'none'; " +
              "base-uri 'self'; " +
              "form-action 'self';"
            )
          },
          // 防止点击劫持
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          // XSS 保护
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          // 内容类型嗅探保护
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          // 严格传输安全
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload'
          },
          // Referrer Policy
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ];
  }
};

export default withNextIntl(nextConfig);
