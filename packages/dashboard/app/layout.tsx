"use client";

import React, { useState, useEffect } from "react";
import "./globals.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Waves,
  Briefcase,
  BrainCircuit,
  Settings,
  ChevronRight,
  Zap,
  Wallet,
  ScrollText,
  BookOpen,
  Bell,
  Activity,
  Menu,
  X,
  FileText,
  MessageCircle,
  ArrowLeftRight,
  TrendingUp,
} from "lucide-react";
import { AIChatWidget } from "@/components/AIChatWidget";
import SignatureRequestModal from "@/components/SignatureRequestModal";
import { CommandPalette } from "@/app/components/CommandPalette";
import { ToastProvider } from "@/app/components/Toast";

const NAV_ITEMS = [
  { href: "/", label: "仪表盘", icon: LayoutDashboard },
  { href: "/chat", label: "AI 对话", icon: MessageCircle },
  { href: "/pools", label: "资金池", icon: Waves },
  { href: "/wallet", label: "钱包管理", icon: Wallet },
  { href: "/trading",   label: "交易中心", icon: TrendingUp },
  { href: "/crosschain", label: "跨链转账", icon: ArrowLeftRight },
  { href: "/positions", label: "持仓管理", icon: Briefcase },
  { href: "/alerts", label: "告警中心", icon: Bell },
  { href: "/ops", label: "运维监控", icon: Activity },
  { href: "/report", label: "报告导出", icon: FileText },
  { href: "/strategies", label: "策略中心", icon: BrainCircuit },
  { href: "/logs", label: "运行日志", icon: ScrollText },
  { href: "/docs", label: "AI 文档", icon: BookOpen },
  { href: "/settings", label: "系统设置", icon: Settings },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // 客户端 auth guard：防止未登录时闪烁 dashboard 内容
  useEffect(() => {
    if (pathname === "/login") {
      setAuthChecked(true);
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
    } else {
      setAuthChecked(true);
    }
  }, [pathname, router]);

  if (pathname === "/login") return <html lang="zh-CN"><head><title>登录 - ProfitLayer: 智能资产矩阵</title></head><body className="dark">{children}</body></html>;

  // 等待 auth 检查完成，显示 loading
  if (!authChecked) {
    return (
      <html lang="zh-CN">
        <head><title>ProfitLayer: 智能资产矩阵</title></head>
        <body className="dark">
          <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="zh-CN" className="dark">
      <head>
        <title>ProfitLayer: 智能资产矩阵 - 控制台</title>
        <meta name="description" content="ProfitLayer: AI 驱动的智能资产矩阵 (Intelligent Asset Matrix)" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen antialiased overflow-hidden selection:bg-accent/30">
        <ToastProvider>
          {/* 全局背景增强 */}
          <div className="bg-grid opacity-40" />
          <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/5 blur-[120px] rounded-full animate-mesh" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-success/5 blur-[120px] rounded-full animate-mesh" style={{ animationDelay: '-4s' }} />
          </div>

          {/* 移动端头部 */}
          <div className="md:hidden fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center ring-1 ring-accent/20">
                  <Zap className="text-accent w-5 h-5 fill-accent/50" strokeWidth={1.5} />
                </div>
                <span className="text-sm font-black text-white font-outfit tracking-wider uppercase">ProfitLayer</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2.5 rounded-xl hover:bg-white/5 transition-colors text-muted hover:text-foreground"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div
              className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          {/* 移动端侧边栏 */}
          <div
            className={`
              md:hidden fixed top-[57px] left-0 right-0 bottom-0 z-40 bg-[#030406]/95 backdrop-blur-2xl border-r border-white/5
              transform transition-transform duration-500 cubic-bezier(0.23, 1, 0.32, 1)
              ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
            `}
          >
            <nav className="p-4 space-y-1.5 overflow-y-auto h-full">
              {NAV_ITEMS.map((item) => {
                const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all border ${
                      isActive
                        ? "bg-accent/10 text-accent border-accent/20 shadow-lg shadow-accent/5"
                        : "text-muted hover:text-foreground hover:bg-white/5 border-transparent"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? "text-accent" : ""}`} strokeWidth={1.5} />
                    <span className={`text-sm font-bold font-outfit ${isActive ? "" : "opacity-70"}`}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex h-screen w-full pt-[57px] md:pt-0">
            {/* 侧边栏 - 桌面端 */}
            <aside className="hidden md:flex w-72 flex-col bg-[#030406]/80 backdrop-blur-2xl border-r border-white/5 z-50 relative group/sidebar transition-all duration-300">
              <div className="p-8 pb-6">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-[14px] bg-accent/10 flex items-center justify-center ring-1 ring-accent/20 group-hover/sidebar:ring-accent/40 transition-all duration-500 shadow-lg shadow-accent/5">
                    <Zap className="text-accent w-6 h-6 fill-accent/50" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h1 className="text-lg font-black text-white font-outfit tracking-wider uppercase leading-none mb-1">ProfitLayer</h1>
                    <span className="text-[10px] text-muted-strong font-black uppercase tracking-[0.2em] opacity-60">Asset Matrix</span>
                  </div>
                </div>
              </div>

              <nav className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-hide py-4">
                {NAV_ITEMS.map((item) => {
                  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group/nav flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-400 relative border ${
                        isActive
                          ? "bg-accent/10 text-accent border-accent/20 shadow-lg shadow-accent/5"
                          : "text-muted hover:text-white hover:bg-white/[0.03] border-transparent"
                      }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent rounded-full shadow-[0_0_12px_rgba(14,165,233,0.5)]" />
                      )}
                      <Icon className={`w-[20px] h-[20px] shrink-0 transition-transform duration-500 group-hover/nav:scale-110 ${isActive ? "text-accent" : "opacity-60 group-hover:opacity-100"}`} strokeWidth={1.5} />
                      <span className={`text-sm font-bold font-outfit uppercase tracking-wider ${isActive ? "text-accent" : "opacity-70 group-hover:opacity-100"}`}>{item.label}</span>
                      {isActive && <ChevronRight className="w-4 h-4 text-accent/50 ml-auto shrink-0 animate-in fade-in slide-in-from-left-2 duration-300" />}
                    </Link>
                  );
                })}
              </nav>

              <div className="p-5 m-4 rounded-[20px] bg-white/[0.02] border border-white/5 relative overflow-hidden group/status">
                <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent opacity-0 group-hover/status:opacity-100 transition-opacity duration-700" />
                <div className="flex items-center gap-3 mb-2 relative z-10">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute inset-0 bg-success/20 rounded-full animate-ping" />
                    <div className="relative w-2 h-2 rounded-full bg-success" />
                  </div>
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Operational</span>
                </div>
                <p className="text-[11px] text-muted-strong font-medium leading-relaxed relative z-10">
                  多链 DeFi 收益池实时监控中
                </p>
              </div>

              <div className="px-8 py-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-black text-white/20 font-outfit uppercase tracking-widest">v0.1.0</span>
                <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
              </div>
            </aside>

            {/* 主内容区 */}
            <main className="flex-1 relative overflow-auto min-w-0 z-10 scrollbar-hide">
              <div className="relative p-6 md:p-10 lg:p-12 max-w-[1600px] mx-auto min-h-screen">
                {children}
              </div>
            </main>
          </div>

          <AIChatWidget />
          <SignatureRequestModal />
          <CommandPalette />
        </ToastProvider>
      </body>
    </html>
  );
}
