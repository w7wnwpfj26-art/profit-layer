"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { LanguageSwitcher } from "@/app/components/LanguageSwitcher";

const NAV_ITEMS: { href: string; labelKey: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { href: "/", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/chat", labelKey: "chat", icon: MessageCircle },
  { href: "/pools", labelKey: "pools", icon: Waves },
  { href: "/wallet", labelKey: "wallet", icon: Wallet },
  { href: "/trading", labelKey: "trading", icon: TrendingUp },
  { href: "/crosschain", labelKey: "crosschain", icon: ArrowLeftRight },
  { href: "/positions", labelKey: "positions", icon: Briefcase },
  { href: "/alerts", labelKey: "alerts", icon: Bell },
  { href: "/ops", labelKey: "ops", icon: Activity },
  { href: "/report", labelKey: "report", icon: FileText },
  { href: "/strategies", labelKey: "strategies", icon: BrainCircuit },
  { href: "/logs", labelKey: "logs", icon: ScrollText },
  { href: "/docs", labelKey: "docs", icon: BookOpen },
  { href: "/settings", labelKey: "settings", icon: Settings },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tLayout = useTranslations("layout");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="bg-grid opacity-40" />
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/5 blur-[120px] rounded-full animate-mesh" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-success/5 blur-[120px] rounded-full animate-mesh" style={{ animationDelay: "-4s" }} />
      </div>

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
                <span className={`text-sm font-bold font-outfit ${isActive ? "" : "opacity-70"}`}>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex h-screen w-full pt-[57px] md:pt-0">
        <aside className="hidden md:flex w-72 flex-col bg-[#030406]/80 backdrop-blur-2xl border-r border-white/5 z-50 relative group/sidebar transition-all duration-300">
          <div className="p-8 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-[14px] bg-accent/10 flex items-center justify-center ring-1 ring-accent/20 group-hover/sidebar:ring-accent/40 transition-all duration-500 shadow-lg shadow-accent/5">
                <Zap className="text-accent w-6 h-6 fill-accent/50" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-lg font-black text-white font-outfit tracking-wider uppercase leading-none mb-1">ProfitLayer</h1>
                <span className="text-[10px] text-muted-strong font-black uppercase tracking-[0.2em] opacity-60">{tLayout("sidebarTagline")}</span>
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
                  <span className={`text-sm font-bold font-outfit uppercase tracking-wider ${isActive ? "text-accent" : "opacity-70 group-hover:opacity-100"}`}>{t(item.labelKey)}</span>
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
              <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">{tLayout("sidebarStatus")}</span>
            </div>
            <p className="text-[11px] text-muted-strong font-medium leading-relaxed relative z-10">
              {tLayout("sidebarStatusDesc")}
            </p>
          </div>

          <div className="px-4 py-3 border-t border-white/5 flex flex-col gap-2">
            <LanguageSwitcher />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-white/20 font-outfit uppercase tracking-widest">v0.1.0</span>
              <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
            </div>
          </div>
        </aside>

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
  );
}
