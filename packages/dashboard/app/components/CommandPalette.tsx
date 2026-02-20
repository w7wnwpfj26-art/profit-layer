"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  Waves,
  Briefcase,
  BrainCircuit,
  Settings,
  Bell,
  Activity,
  ScrollText,
  BookOpen,
  Wallet,
  MessageCircle,
  FileText,
  Command,
  X,
  Zap,
  ArrowRight,
} from "lucide-react";

const ACTIONS = [
  { id: "dashboard", label: "前往仪表盘", icon: LayoutDashboard, href: "/", category: "导航" },
  { id: "chat", label: "与 AI 对话", icon: MessageCircle, href: "/chat", category: "导航" },
  { id: "pools", label: "查看资金池", icon: Waves, href: "/pools", category: "导航" },
  { id: "wallet", label: "钱包管理", icon: Wallet, href: "/wallet", category: "导航" },
  { id: "positions", label: "持仓管理", icon: Briefcase, href: "/positions", category: "导航" },
  { id: "alerts", label: "告警中心", icon: Bell, href: "/alerts", category: "导航" },
  { id: "ops", label: "运维监控", icon: Activity, href: "/ops", category: "导航" },
  { id: "reports", label: "报告导出", icon: FileText, href: "/report", category: "导航" },
  { id: "strategies", label: "策略中心", icon: BrainCircuit, href: "/strategies", category: "导航" },
  { id: "logs", label: "查看运行日志", icon: ScrollText, href: "/logs", category: "导航" },
  { id: "docs", label: "查看文档", icon: BookOpen, href: "/docs", category: "导航" },
  { id: "settings", label: "系统设置", icon: Settings, href: "/settings", category: "导航" },
  
  { id: "kill-switch", label: "紧急停止所有策略 (Kill Switch)", icon: Zap, action: () => alert("已触发紧急停止协议"), category: "操作", danger: true },
  { id: "export-json", label: "导出当前数据快照 (JSON)", icon: FileText, action: () => alert("正在准备数据快照..."), category: "操作" },
];

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const filteredActions = query === "" 
    ? ACTIONS 
    : ACTIONS.filter(action => 
        action.label.toLowerCase().includes(query.toLowerCase()) || 
        action.category.toLowerCase().includes(query.toLowerCase())
      );

  const handleSelect = (action: typeof ACTIONS[0]) => {
    if (action.href) {
      router.push(action.href);
    } else if (action.action) {
      action.action();
    }
    setIsOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredActions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredActions.length) % filteredActions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredActions[selectedIndex]) {
        handleSelect(filteredActions[selectedIndex]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 sm:px-6 md:px-8">
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" 
        onClick={() => setIsOpen(false)}
      />
      
      <div className="relative w-full max-w-2xl glass border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-500 cubic-bezier(0.23, 1, 0.32, 1)">
        <div className="flex items-center px-6 py-5 border-b border-white/5">
          <Search className="w-5 h-5 text-muted mr-4" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/30 text-lg font-medium"
            placeholder="输入指令、功能或页面名称..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
            <span className="text-[10px] font-bold text-muted uppercase">ESC</span>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3 scrollbar-hide">
          {filteredActions.length > 0 ? (
            <div className="space-y-4">
              {["导航", "操作"].map(category => {
                const categoryActions = filteredActions.filter(a => a.category === category);
                if (categoryActions.length === 0) return null;
                
                return (
                  <div key={category} className="space-y-1">
                    <div className="px-4 py-2">
                      <span className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">{category}</span>
                    </div>
                    {categoryActions.map((action) => {
                      const overallIndex = filteredActions.indexOf(action);
                      const isSelected = overallIndex === selectedIndex;
                      const Icon = action.icon;
                      
                      return (
                        <button
                          key={action.id}
                          onClick={() => handleSelect(action)}
                          onMouseMove={() => setSelectedIndex(overallIndex)}
                          className={`
                            w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-200 group
                            ${isSelected ? "bg-white/10 border border-white/10" : "bg-transparent border border-transparent"}
                          `}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`
                              w-10 h-10 rounded-xl flex items-center justify-center transition-colors
                              ${isSelected ? "bg-accent/20 text-accent" : "bg-white/5 text-muted"}
                              ${action.danger ? "bg-danger/10 text-danger" : ""}
                            `}>
                              <Icon className="w-5 h-5" strokeWidth={1.5} />
                            </div>
                            <div className="text-left">
                              <p className={`text-sm font-bold ${isSelected ? "text-white" : "text-muted"} ${action.danger ? "text-danger" : ""}`}>
                                {action.label}
                              </p>
                              {isSelected && (
                                <p className="text-[10px] text-muted-strong font-medium animate-in fade-in slide-in-from-left-1">
                                  {action.href ? `跳转至 ${action.href}` : "执行系统操作"}
                                </p>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <ArrowRight className="w-4 h-4 text-accent animate-in fade-in slide-in-from-left-2" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mb-4">
                <Command className="w-8 h-8 text-white/10" />
              </div>
              <p className="text-muted font-bold">未找到相关结果</p>
              <p className="text-[11px] text-muted-strong mt-1">尝试输入不同的关键词</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[10px] text-muted font-bold">↵</kbd>
              <span className="text-[10px] text-muted-strong font-medium uppercase">选择</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[10px] text-muted font-bold">↑↓</kbd>
              <span className="text-[10px] text-muted-strong font-medium uppercase">切换</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-strong font-medium uppercase tracking-widest">Nexus Yield Command Center</span>
          </div>
        </div>
      </div>
    </div>
  );
}
