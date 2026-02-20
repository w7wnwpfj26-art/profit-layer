"use client";

import { useState, useEffect } from "react";
import { X, Lightbulb, ArrowRight, CheckCircle, HelpCircle } from "lucide-react";
import Link from "next/link";

interface GuideStep {
  id: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
}

interface TooltipDef {
  term: string;
  definition: string;
}

const TOOLTIPS: TooltipDef[] = [
  { term: "TVL", definition: "Total Value Locked，锁定总价值，表示协议中存入的资产总额" },
  { term: "APR", definition: "Annual Percentage Rate，年化收益率，不含复利" },
  { term: "APY", definition: "Annual Percentage Yield，年化收益率，含复利效应" },
  { term: "IL", definition: "Impermanent Loss，无常损失，LP 提供流动性时的潜在损失" },
  { term: "Gas", definition: "交易手续费，支付给矿工/验证者的费用" },
  { term: "Slippage", definition: "滑点，交易执行价与预期价的差异" },
  { term: "健康分", definition: "综合评估池子安全性的分数，越高越安全" },
  { term: "Rug Pull", definition: "项目方卷款跑路，常见的 DeFi 骗局" },
];

export function NewUserGuide() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [steps, setSteps] = useState<GuideStep[]>([
    { id: "wallet", title: "连接钱包", description: "添加你的钱包地址开始监控", href: "/wallet", completed: false },
    { id: "pools", title: "浏览资金池", description: "查看高收益 DeFi 机会", href: "/pools", completed: false },
    { id: "strategy", title: "配置策略", description: "设置自动化投资策略", href: "/strategies", completed: false },
    { id: "alerts", title: "设置告警", description: "配置风险预警通知", href: "/alerts", completed: false },
  ]);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    try {
      const dismissed = localStorage.getItem("guide_dismissed");
      const completed = JSON.parse(localStorage.getItem("guide_completed") || "{}");
      if (!dismissed) setVisible(true);
      setSteps((s) => s.map((step) => ({ ...step, completed: completed[step.id] || false })));
    } catch (e) {
      console.error("LocalStorage error:", e);
    }
  }, []);

  const completeStep = (id: string) => {
    if (typeof window === "undefined") return;
    try {
      const completed = JSON.parse(localStorage.getItem("guide_completed") || "{}");
      completed[id] = true;
      localStorage.setItem("guide_completed", JSON.stringify(completed));
      setSteps((s) => s.map((step) => (step.id === id ? { ...step, completed: true } : step)));
    } catch (e) {
      console.error("LocalStorage error:", e);
    }
  };

  const dismiss = () => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("guide_dismissed", "true");
      setVisible(false);
    } catch (e) {
      console.error("LocalStorage error:", e);
    }
  };

  if (!mounted || !visible) return null;

  const completedCount = steps.filter((s) => s.completed).length;

  return (
    <div className="glass rounded-[24px] p-6 relative overflow-hidden mb-10 group border-accent/20">
      <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 blur-[60px] -mr-32 -mt-32 pointer-events-none" />
      <div className="flex items-start justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/20">
            <Lightbulb className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Deployment Matrix</h3>
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest opacity-60">Complete the sequence to initialize full autonomy</p>
          </div>
        </div>
        <button onClick={dismiss} className="p-2 rounded-lg hover:bg-white/5 text-muted hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress */}
      <div className="mb-8 relative z-10">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] mb-3">
          <span className="text-muted">Synchronization Progress</span>
          <span className="text-accent">{completedCount}/{steps.length}</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden p-[1px] ring-1 ring-white/5">
          <div
            className="h-full bg-gradient-to-r from-accent to-success transition-all duration-1000 ease-out rounded-full shadow-[0_0_10px_rgba(14,165,233,0.5)]"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
        {steps.map((step) => (
          <Link
            key={step.id}
            href={step.href}
            onClick={() => completeStep(step.id)}
            className={`p-5 rounded-2xl border transition-all duration-300 group/step ${
              step.completed
                ? "bg-success/5 border-success/20"
                : "bg-white/[0.02] border-white/5 hover:border-accent/40 hover:bg-white/[0.05]"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-lg ${step.completed ? "bg-success/20 text-success" : "bg-white/5 text-muted group-hover/step:text-accent"}`}>
                {step.completed ? <CheckCircle className="w-4 h-4" /> : <ArrowRight className="w-4 h-4 transition-transform group-hover/step:translate-x-1" />}
              </div>
              {step.completed && <span className="text-[9px] font-black text-success uppercase tracking-tighter">Verified</span>}
            </div>
            <h4 className={`text-xs font-black uppercase tracking-wider mb-1 ${step.completed ? "text-success/80" : "text-white"}`}>{step.title}</h4>
            <p className="text-[10px] text-muted font-medium leading-relaxed opacity-60 group-hover/step:opacity-100 transition-opacity">{step.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function MetricTooltip({ term }: { term: string }) {
  const [show, setShow] = useState(false);
  const tooltip = TOOLTIPS.find((t) => t.term === term);

  if (!tooltip) return <span>{term}</span>;

  return (
    <span className="relative inline-flex items-center gap-1 cursor-help">
      {term}
      <HelpCircle
        className="w-3 h-3 text-muted"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 rounded-lg bg-foreground text-background text-[10px] whitespace-nowrap z-50 shadow-lg">
          {tooltip.definition}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
        </div>
      )}
    </span>
  );
}

export function GlossaryPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/10 text-[10px] font-black uppercase tracking-widest text-muted hover:text-accent hover:border-accent/30 transition-all shadow-sm"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        Terminology
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-4 w-72 glass p-5 rounded-[20px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Matrix Glossary</h4>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/5 text-muted hover:text-white transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
            {TOOLTIPS.map((t) => (
              <div key={t.term} className="group/item border-b border-white/5 pb-2 last:border-0">
                <span className="text-[10px] font-black text-accent uppercase tracking-tighter group-hover/item:text-white transition-colors">{t.term}</span>
                <p className="text-[10px] text-muted/80 leading-relaxed mt-0.5">{t.definition}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
