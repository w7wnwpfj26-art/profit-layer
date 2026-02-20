"use client";

import React, { useState } from "react";
import {
  Book,
  FileText,
  Zap,
  Shield,
  Database,
  Settings,
  ChevronRight,
  Cpu,
  TrendingUp,
  Wallet,
  BarChart3,
  AlertTriangle,
  RefreshCw,
  Search,
  ArrowUpRight,
  MessageSquare,
  Server,
  Terminal
} from "lucide-react";
import Link from "next/link";

interface DocItem {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  tag?: string;
  category: string;
}

const docs: DocItem[] = [
  {
    title: "快速开始",
    description: "5 分钟快速部署和使用 Nexus Yield Agent - Docker Compose 一键启动,连接钱包即可使用",
    href: "/docs/quickstart",
    icon: <Zap className="w-6 h-6" />,
    tag: "推荐",
    category: "入门指南"
  },
  {
    title: "AI 能力说明",
    description: "深入了解 AI 引擎的核心能力：市场情绪感知、Alpha 信号扫描、策略顾问、记忆系统、决策反馈闭环、自主思考循环",
    href: "/docs/ai",
    icon: <Cpu className="w-6 h-6" />,
    tag: "核心",
    category: "技术核心"
  },
  {
    title: "系统架构",
    description: "四层架构设计详解：数据层 (TimescaleDB + Redis)、AI 层 (FastAPI)、执行层 (Node.js)、展示层 (Next.js 16)",
    href: "/docs/architecture",
    icon: <Database className="w-6 h-6" />,
    category: "技术核心"
  },
  {
    title: "策略配置",
    description: "配置自动执行策略：保守/平衡/激进模式、健康分阈值、风险分上限、单池/单链占比、AI 自动审批、再平衡策略",
    href: "/docs/strategies",
    icon: <Settings className="w-6 h-6" />,
    category: "策略管理"
  },
  {
    title: "安全指南",
    description: "私钥管理最佳实践：冷热钱包分离、权限最小化、滑点控制、MEV 保护、协议白名单、应急响应预案",
    href: "/docs/security",
    icon: <Shield className="w-6 h-6" />,
    tag: "重要",
    category: "安全合规"
  },
  {
    title: "API 文档",
    description: "完整的 RESTful API 接口文档：池子查询、持仓管理、AI 分析、市场情绪、Alpha 信号、运营监控",
    href: "/docs/api",
    icon: <FileText className="w-6 h-6" />,
    category: "开发者中心"
  },
];

const features = [
  {
    icon: <TrendingUp className="w-6 h-6 text-success" />,
    title: "收益预测",
    desc: "AI 分析池子历史数据",
  },
  {
    icon: <AlertTriangle className="w-6 h-6 text-warning" />,
    title: "风险评估",
    desc: "实时监控池子健康度",
  },
  {
    icon: <Wallet className="w-6 h-6 text-accent" />,
    title: "自动执行",
    desc: "AI 自动寻找最优机会",
  },
  {
    icon: <RefreshCw className="w-6 h-6 text-info" />,
    title: "跨链收益",
    desc: "多链资产跨链寻找",
  },
];

export default function DocsPage() {
  const [search, setSearch] = useState("");

  const filteredDocs = docs.filter(d => 
    d.title.toLowerCase().includes(search.toLowerCase()) || 
    d.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-12 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* 头部 Premium 增强 */}
      <div className="relative p-12 rounded-[3.5rem] overflow-hidden glass border-white/5 group shadow-2xl">
        <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
          <Book className="w-64 h-64 text-accent rotate-12" />
        </div>
        
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start gap-12">
          <div className="max-w-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="px-4 py-1.5 rounded-full bg-accent/20 text-accent text-[10px] font-black uppercase tracking-[0.2em] border border-accent/20 flex items-center gap-2">
                Knowledge Base v2.0
              </div>
              <span className="text-muted text-[10px] font-black uppercase tracking-widest">
                Nexus Yield 智慧大脑
              </span>
            </div>
            <h2 className="text-6xl font-black text-white tracking-tighter leading-tight">
              文档 <span className="text-gradient-accent">中心</span>
            </h2>
            <p className="text-muted text-base mt-6 max-w-xl leading-relaxed font-medium opacity-80">
              这里是 Nexus Yield 的核心知识库。了解 AI 引擎如何驱动你的资产矩阵，
              探索策略配置背后的逻辑，并掌握多链资产安全管理的最佳实践。
            </p>
          </div>

          <div className="w-full lg:w-[450px] space-y-6">
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted group-focus-within:text-accent transition-colors" />
              <input 
                type="text" 
                placeholder="搜索文档内容或技术参数..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl pl-14 pr-6 py-5 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-accent/50 focus:bg-black/60 transition-all shadow-inner"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {["Smart Contract", "Risk Engine", "EVM", "Solana"].map(tag => (
                <span key={tag} className="px-3 py-1.5 rounded-lg bg-white/5 text-[9px] font-black text-muted-strong uppercase tracking-widest border border-white/5 hover:border-white/20 transition-all cursor-pointer">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 核心特性磁贴 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16 relative z-10 pt-12 border-t border-white/5">
          {features.map((f, i) => (
            <div key={i} className="flex items-center gap-4 group/feat">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 group-hover/feat:border-accent/30 transition-all shadow-inner">
                {f.icon}
              </div>
              <div>
                <h4 className="text-sm font-black text-white tracking-tight">{f.title}</h4>
                <p className="text-[10px] text-muted-strong font-bold uppercase tracking-widest mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 文档列表 - 栅格化布局 */}
      <div className="space-y-8">
        <div className="flex items-center justify-between px-4">
          <h3 className="text-xl font-black text-white uppercase tracking-[0.2em] flex items-center gap-4">
            <FileText className="w-6 h-6 text-accent" /> Matrix Protocols
          </h3>
          <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent ml-10" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {filteredDocs.map((doc, i) => (
            <Link
              key={i}
              href={doc.href}
              className="glass-hover glass rounded-[2.5rem] p-8 border border-white/5 transition-all duration-700 group flex flex-col h-full relative overflow-hidden shadow-xl hover:border-accent/20"
            >
              <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-10 transition-opacity">
                <ArrowUpRight className="w-12 h-12 text-accent" />
              </div>
              
              <div className="flex items-center justify-between mb-8 relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center border border-accent/20 transition-all duration-700 group-hover:scale-110 group-hover:rotate-3 shadow-lg shadow-accent/5">
                  <div className="text-accent">
                    {doc.icon}
                  </div>
                </div>
                {doc.tag && (
                  <span className="px-3 py-1 rounded-full bg-accent/20 text-accent text-[9px] font-black uppercase tracking-[0.2em] border border-accent/30">
                    {doc.tag}
                  </span>
                )}
              </div>

              <div className="flex-1 relative z-10">
                <span className="text-[9px] font-black text-muted-strong uppercase tracking-[0.3em] mb-2 block">{doc.category}</span>
                <h3 className="text-2xl font-black text-white group-hover:text-accent transition-colors tracking-tight mb-4">{doc.title}</h3>
                <p className="text-muted text-sm leading-relaxed font-medium opacity-70 group-hover:opacity-100 transition-opacity">
                  {doc.description}
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between relative z-10">
                <span className="text-[10px] font-black text-muted-strong group-hover:text-white transition-colors uppercase tracking-[0.2em]">阅读全文</span>
                <ChevronRight className="w-4 h-4 text-muted-strong group-hover:text-accent transition-all transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 底部互动区 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 快速导航 */}
        <div className="lg:col-span-4 glass p-10 rounded-[2.5rem] border border-white/5 bg-gradient-to-br from-info/10 to-transparent relative overflow-hidden group">
          <div className="absolute top-0 left-0 p-10 opacity-5 pointer-events-none">
            <Book className="w-32 h-32 text-info" />
          </div>
          <div className="relative z-10">
            <h3 className="text-lg font-black text-white uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-info" /> 快速导航
            </h3>
            <div className="space-y-3">
              {[
                { label: "首页仪表盘", url: "/", icon: "🏠" },
                { label: "资产池浏览", url: "/pools", icon: "💎" },
                { label: "钱包管理", url: "/wallet", icon: "👛" },
                { label: "系统设置", url: "/settings", icon: "⚙️" },
                { label: "运营监控", url: "/ops", icon: "📊" }
              ].map(link => (
                <Link 
                  key={link.label}
                  href={link.url}
                  className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-transparent hover:border-white/10 hover:bg-white/[0.08] transition-all group/link"
                >
                  <span className="text-xs font-bold text-muted group-hover/link:text-white flex items-center gap-3 transition-colors">
                    <span className="text-lg">{link.icon}</span> {link.label}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-strong group-hover/link:text-accent transition-all" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* AI 助手 */}
        <div className="lg:col-span-8 glass p-10 rounded-[2.5rem] border border-white/5 bg-gradient-to-br from-success/10 to-transparent relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform">
            <MessageSquare className="w-32 h-32 text-success" />
          </div>
          <div className="relative z-10">
            <h3 className="text-2xl font-black text-white tracking-tight mb-4">没找到你需要的内容？</h3>
            <p className="text-muted text-sm font-medium opacity-80 max-w-lg leading-relaxed">
              我们的 AI 助手可以实时回答你关于 Nexus Yield 的任何技术疑问。点击侧边栏的 <strong className="text-white">AI 对话</strong> 或右下角的 <strong className="text-white">AI 浮窗</strong> 立即开始。
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link 
                href="/chat"
                className="inline-flex items-center gap-3 px-8 py-4 bg-success/20 hover:bg-success text-success hover:text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 border border-success/30 hover:border-success shadow-lg shadow-success/10"
              >
                <MessageSquare className="w-4 h-4" /> 咨询 AI 专家
              </Link>
              <a 
                href="https://github.com/your-org/nexus-yield/issues"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-3 px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-accent/30 text-white text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
              >
                提交 Issue
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 统计数据 */}
      <div className="glass p-10 rounded-[3rem] border border-white/5 bg-gradient-to-br from-accent/5 to-transparent">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { label: "文档页面", value: "6+", icon: <Book className="w-5 h-5" /> },
            { label: "API 接口", value: "15+", icon: <Server className="w-5 h-5" /> },
            { label: "代码示例", value: "50+", icon: <Terminal className="w-5 h-5" /> },
            { label: "最后更新", value: "2026-02", icon: <RefreshCw className="w-5 h-5" /> }
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <div className="text-accent">{stat.icon}</div>
                <div className="text-3xl font-black text-white">{stat.value}</div>
              </div>
              <div className="text-[10px] text-muted-strong font-bold uppercase tracking-[0.2em]">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
