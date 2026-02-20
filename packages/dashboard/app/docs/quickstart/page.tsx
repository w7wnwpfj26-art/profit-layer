"use client";

import React from "react";
import { Rocket, Terminal, Database, Zap, CheckCircle2, AlertCircle, Settings, Wallet, Play, Server } from "lucide-react";
import Link from "next/link";

export default function QuickstartPage() {
  return (
    <div className="space-y-8 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* 页头 Premium */}
      <div className="glass-hover glass p-12 rounded-[3.5rem] border border-white/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-16 opacity-[0.03] pointer-events-none group-hover:rotate-12 transition-transform duration-1000">
          <Rocket className="w-72 h-72 text-accent" />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-[24px] bg-accent/20 flex items-center justify-center border border-accent/30 shadow-lg shadow-accent/10">
              <Rocket className="w-8 h-8 text-accent" />
            </div>
            <div>
              <h1 className="text-5xl font-black text-white tracking-tight">快速开始</h1>
              <p className="text-muted-strong text-sm font-bold uppercase tracking-[0.2em] mt-2">5 分钟部署 ProfitLayer</p>
            </div>
          </div>
        </div>
      </div>

      {/* 前置要求 */}
      <Section icon={<AlertCircle className="w-6 h-6" />} title="前置要求">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { name: "Docker", version: "≥ 20.10", desc: "容器运行时" },
            { name: "Docker Compose", version: "≥ 2.0", desc: "多容器编排" },
            { name: "Node.js", version: "≥ 18.0", desc: "前端运行环境" },
            { name: "pnpm", version: "≥ 8.0", desc: "包管理器" }
          ].map((req, i) => (
            <div key={i} className="glass p-6 rounded-[24px] border border-white/5 flex items-center gap-4 group hover:border-accent/20 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center border border-accent/20 group-hover:scale-110 transition-transform">
                <Server className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h4 className="text-white font-bold text-sm">{req.name} <span className="text-accent text-xs ml-2">{req.version}</span></h4>
                <p className="text-muted text-xs mt-1">{req.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 一键部署 */}
      <Section icon={<Play className="w-6 h-6" />} title="一键部署" step="步骤 1">
        <div className="space-y-6">
          <StepCard 
            num="1.1"
            title="克隆代码仓库"
            code={`git clone https://github.com/your-org/profit-layer.git
cd profit-layer`}
          />

          <StepCard 
            num="1.2"
            title="启动所有服务"
            code={`docker-compose up -d`}
            desc="将启动 TimescaleDB、Redis、AI Engine、Executor、Scanner、Strategy Worker、Grafana 共 7 个服务"
          />

          <StepCard 
            num="1.3"
            title="验证服务状态"
            code={`docker-compose ps

# 预期输出：所有服务 Status 为 Up 或 Up (healthy)`}
          />

          <div className="glass p-8 rounded-[24px] border border-success/20 bg-success/5">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="w-6 h-6 text-success mt-1 flex-shrink-0" />
              <div>
                <h4 className="text-white font-bold text-sm mb-2">✅ 核心服务已启动</h4>
                <ul className="space-y-2 text-muted text-xs">
                  <li>• 数据库: <code className="code">localhost:5432</code></li>
                  <li>• AI Engine: <code className="code">localhost:8000</code></li>
                  <li>• Redis: <code className="code">localhost:6379</code></li>
                  <li>• Grafana: <code className="code">localhost:3003</code></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* 启动前端 */}
      <Section icon={<Terminal className="w-6 h-6" />} title="启动前端 Dashboard" step="步骤 2">
        <div className="space-y-6">
          <StepCard 
            num="2.1"
            title="安装依赖"
            code={`pnpm install`}
          />

          <StepCard 
            num="2.2"
            title="启动开发服务器"
            code={`cd packages/dashboard
npm run dev

# 或在根目录运行
pnpm --filter dashboard dev`}
          />

          <div className="glass p-8 rounded-[24px] border border-accent/20 bg-accent/5">
            <div className="flex items-start gap-4">
              <Zap className="w-6 h-6 text-accent mt-1 flex-shrink-0" />
              <div>
                <h4 className="text-white font-bold text-sm mb-3">🚀 Dashboard 已就绪</h4>
                <p className="text-muted text-xs mb-4">访问以下地址开始使用：</p>
                <a 
                  href="http://localhost:3002" 
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-accent/20 hover:bg-accent text-accent hover:text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all border border-accent/30"
                >
                  <Play className="w-4 h-4" /> 打开 Dashboard
                </a>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* 连接钱包 */}
      <Section icon={<Wallet className="w-6 h-6" />} title="连接钱包 & 配置" step="步骤 3">
        <div className="space-y-6">
          <div className="glass p-8 rounded-[24px] border border-white/5">
            <h4 className="text-white font-bold text-sm mb-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
                <span className="text-accent font-black text-xs">3.1</span>
              </div>
              连接钱包
            </h4>
            <ol className="space-y-3 text-muted text-sm ml-11">
              <li className="flex items-start gap-3">
                <span className="text-accent font-bold">1.</span>
                <span>点击右上角 <strong className="text-white">「连接钱包」</strong> 按钮</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-accent font-bold">2.</span>
                <span>选择钱包类型（MetaMask / OKX / WalletConnect）</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-accent font-bold">3.</span>
                <span>授权连接后,系统会自动扫描你的多链资产</span>
              </li>
            </ol>
          </div>

          <div className="glass p-8 rounded-[24px] border border-white/5">
            <h4 className="text-white font-bold text-sm mb-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
                <span className="text-accent font-black text-xs">3.2</span>
              </div>
              配置 AI 模型（可选）
            </h4>
            <ol className="space-y-3 text-muted text-sm ml-11">
              <li className="flex items-start gap-3">
                <span className="text-accent font-bold">1.</span>
                <span>进入 <Link href="/settings" className="text-accent hover:underline">系统设置</Link> 页面</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-accent font-bold">2.</span>
                <span>填写 <strong className="text-white">DeepSeek API Key</strong>（可在 <a href="https://platform.deepseek.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">platform.deepseek.com</a> 获取）</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-accent font-bold">3.</span>
                <span>选择模型: DeepSeek V3、GLM-5、GPT-4o 等</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-accent font-bold">4.</span>
                <span>点击 <strong className="text-white">「测试连接」</strong> 验证配置</span>
              </li>
            </ol>
            <div className="mt-6 p-4 rounded-xl bg-warning/10 border border-warning/20">
              <p className="text-warning text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span><strong>注意:</strong> 不配置 API Key 时,系统使用内置规则引擎,仍可正常工作但无 LLM 深度分析能力</span>
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* 验证部署 */}
      <Section icon={<CheckCircle2 className="w-6 h-6" />} title="验证部署" step="步骤 4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { 
              title: "健康检查", 
              endpoint: "http://localhost:8000/health",
              expected: '{"status": "healthy"}',
              desc: "AI Engine 健康状态"
            },
            { 
              title: "市场情绪", 
              endpoint: "http://localhost:8000/sentiment",
              expected: '{"compositeScore": 65, ...}',
              desc: "市场情绪数据获取"
            },
            { 
              title: "Alpha 信号", 
              endpoint: "http://localhost:8000/alpha",
              expected: '{"signals": [...]}',
              desc: "Alpha 信号扫描"
            },
            { 
              title: "前端访问", 
              endpoint: "http://localhost:3002",
              expected: 'Dashboard 页面加载',
              desc: "前端界面渲染"
            }
          ].map((check, i) => (
            <div key={i} className="glass p-6 rounded-[24px] border border-white/5 group hover:border-success/20 transition-all">
              <h4 className="text-white font-bold text-sm mb-3">{check.title}</h4>
              <code className="text-xs text-accent bg-black/40 px-3 py-2 rounded-lg block mb-3 break-all">{check.endpoint}</code>
              <p className="text-muted text-xs mb-2">预期响应:</p>
              <code className="text-xs text-muted-strong bg-black/40 px-3 py-2 rounded-lg block mb-3">{check.expected}</code>
              <p className="text-muted text-[10px] uppercase tracking-wider">{check.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 下一步 */}
      <div className="glass p-12 rounded-[3.5rem] border border-white/5 bg-gradient-to-br from-accent/10 to-transparent relative overflow-hidden group">
        <div className="absolute bottom-0 right-0 p-12 opacity-5 pointer-events-none">
          <Zap className="w-64 h-64 text-accent" />
        </div>
        <div className="relative z-10">
          <h3 className="text-3xl font-black text-white tracking-tight mb-4">🎉 部署完成！</h3>
          <p className="text-muted text-sm mb-8 max-w-2xl leading-relaxed">
            你的 ProfitLayer Agent 已成功启动。接下来可以探索更多功能：
          </p>
          <div className="flex flex-wrap gap-4">
            <Link 
              href="/docs/architecture"
              className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-accent/30 text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2"
            >
              <Database className="w-4 h-4" /> 系统架构
            </Link>
            <Link 
              href="/docs/strategies"
              className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-accent/30 text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2"
            >
              <Settings className="w-4 h-4" /> 策略配置
            </Link>
            <Link 
              href="/docs/security"
              className="px-6 py-3 rounded-2xl bg-accent/20 hover:bg-accent border border-accent/30 text-accent hover:text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4" /> 安全指南
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// 子组件
function Section({ icon, title, step, children }: { 
  icon: React.ReactNode; 
  title: string; 
  step?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-4">
        {step && (
          <div className="px-4 py-1.5 rounded-full bg-accent/20 text-accent text-[10px] font-black uppercase tracking-[0.2em] border border-accent/20">
            {step}
          </div>
        )}
        <h2 className="flex items-center gap-3 text-2xl font-black text-white uppercase tracking-[0.1em]">
          <span className="text-accent">{icon}</span>
          {title}
        </h2>
        <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      </div>
      <div className="pl-0 md:pl-4">
        {children}
      </div>
    </section>
  );
}

function StepCard({ num, title, code, desc }: { 
  num: string; 
  title: string; 
  code: string; 
  desc?: string;
}) {
  return (
    <div className="glass p-8 rounded-[24px] border border-white/5 group hover:border-accent/20 transition-all">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center border border-accent/30 group-hover:scale-110 transition-transform">
          <span className="text-accent font-black text-xs">{num}</span>
        </div>
        <h4 className="text-white font-bold text-sm">{title}</h4>
      </div>
      <pre className="bg-black/40 rounded-xl p-4 text-xs font-mono text-accent/80 overflow-x-auto border border-white/5">
        {code}
      </pre>
      {desc && (
        <p className="text-muted text-xs mt-3 ml-11">{desc}</p>
      )}
    </div>
  );
}
