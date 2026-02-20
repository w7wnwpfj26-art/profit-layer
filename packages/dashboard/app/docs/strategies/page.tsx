"use client";

import React from "react";
import { Settings, Sliders, Target, TrendingUp, Shield, AlertTriangle, CheckCircle2, Zap } from "lucide-react";

export default function StrategiesPage() {
  return (
    <div className="space-y-8 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* 页头 */}
      <div className="glass-hover glass p-12 rounded-[3.5rem] border border-white/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-16 opacity-[0.03] pointer-events-none group-hover:rotate-12 transition-transform duration-1000">
          <Target className="w-72 h-72 text-accent" />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-[24px] bg-accent/20 flex items-center justify-center border border-accent/30 shadow-lg shadow-accent/10">
              <Target className="w-8 h-8 text-accent" />
            </div>
            <div>
              <h1 className="text-5xl font-black text-white tracking-tight">策略配置</h1>
              <p className="text-muted-strong text-sm font-bold uppercase tracking-[0.2em] mt-2">自动执行 · 风险控制 · 参数优化</p>
            </div>
          </div>
        </div>
      </div>

      {/* 策略模式 */}
      <Section icon={<Sliders className="w-6 h-6" />} title="策略模式">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              mode: "保守模式",
              icon: <Shield className="w-8 h-8 text-success" />,
              color: "success",
              healthMin: 80,
              riskMax: 40,
              aprTarget: "15-30%",
              features: ["仅选择顶级协议", "TVL > $50M", "历史稳定", "稳定币优先"]
            },
            {
              mode: "平衡模式",
              icon: <TrendingUp className="w-8 h-8 text-warning" />,
              color: "warning",
              healthMin: 70,
              riskMax: 60,
              aprTarget: "30-60%",
              features: ["主流协议为主", "TVL > $10M", "适度风险", "收益风险平衡"]
            },
            {
              mode: "激进模式",
              icon: <Zap className="w-8 h-8 text-error" />,
              color: "error",
              healthMin: 60,
              riskMax: 80,
              aprTarget: "60-200%+",
              features: ["高收益池子", "接受新协议", "快速进出", "高风险高收益"]
            }
          ].map((strategy, i) => (
            <div key={i} className={`glass-hover p-8 rounded-[3rem] border border-${strategy.color}/20 bg-${strategy.color}/5 group relative overflow-hidden`}>
              <div className={`absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform`}>
                {strategy.icon}
              </div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black text-white">{strategy.mode}</h3>
                  <div className={`w-12 h-12 rounded-2xl bg-${strategy.color}/20 flex items-center justify-center border border-${strategy.color}/30`}>
                    {strategy.icon}
                  </div>
                </div>
                
                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">健康分要求</span>
                    <span className="text-white font-bold">≥ {strategy.healthMin}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">风险分上限</span>
                    <span className="text-white font-bold">≤ {strategy.riskMax}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">目标 APR</span>
                    <span className={`text-${strategy.color} font-bold`}>{strategy.aprTarget}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {strategy.features.map((feature, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs text-muted">
                      <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 核心参数 */}
      <Section icon={<Settings className="w-6 h-6" />} title="核心参数配置">
        <div className="glass p-10 rounded-[3rem] border border-white/5">
          <div className="space-y-8">
            {/* 健康分阈值 */}
            <ParamCard
              title="健康分阈值 (Health Score Threshold)"
              value="70"
              range="0 - 100"
              desc="只考虑健康分 ≥ 此值的池子。健康分综合考虑:协议评级、TVL 稳定性、APR 合理性、链的安全性"
              recommendations={[
                "保守型: 80+ (仅顶级协议)",
                "平衡型: 70+ (主流协议)",
                "激进型: 60+ (接受新兴协议)"
              ]}
            />

            {/* 风险分上限 */}
            <ParamCard
              title="风险分上限 (Risk Score Max)"
              value="60"
              range="0 - 100"
              desc="拒绝风险分 > 此值的池子。风险分考虑:APR 异常高、TVL 快速下降、新协议、审计缺失"
              recommendations={[
                "保守型: 40 (极低风险)",
                "平衡型: 60 (中等风险)",
                "激进型: 80 (接受高风险)"
              ]}
            />

            {/* 单池最大占比 */}
            <ParamCard
              title="单池最大占比 (Max Pool Allocation)"
              value="25%"
              range="5% - 50%"
              desc="单个池子最多占总资产的百分比,防止过度集中风险"
              recommendations={[
                "保守型: 15% (高度分散)",
                "平衡型: 25% (适度分散)",
                "激进型: 40% (集中投资)"
              ]}
            />

            {/* 单链最大占比 */}
            <ParamCard
              title="单链最大占比 (Max Chain Allocation)"
              value="50%"
              range="20% - 80%"
              desc="单条链最多占总资产的百分比,防止链级风险"
              recommendations={[
                "保守型: 40% (多链分散)",
                "平衡型: 50% (主链为主)",
                "激进型: 70% (单链深耕)"
              ]}
            />

            {/* APR 异常检测 */}
            <ParamCard
              title="APR 异常阈值 (APR Anomaly Threshold)"
              value="200%"
              range="100% - 500%"
              desc="APR 超过此值会触发警告,需要 AI 二次审批才能入场"
              recommendations={[
                "保守型: 100% (拒绝高 APR)",
                "平衡型: 200% (谨慎对待)",
                "激进型: 500% (大胆尝试)"
              ]}
            />

            {/* 止损阈值 */}
            <ParamCard
              title="止损阈值 (Stop Loss Threshold)"
              value="-15%"
              range="-5% - -30%"
              desc="单个池子未实现亏损达到此比例时自动退出"
              recommendations={[
                "保守型: -10% (快速止损)",
                "平衡型: -15% (适度容忍)",
                "激进型: -25% (长期持有)"
              ]}
            />
          </div>
        </div>
      </Section>

      {/* AI 自动审批 */}
      <Section icon={<CheckCircle2 className="w-6 h-6" />} title="AI 自动审批">
        <div className="glass p-10 rounded-[3rem] border border-accent/20 bg-accent/5">
          <div className="flex items-start gap-6">
            <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/30 flex-shrink-0">
              <CheckCircle2 className="w-7 h-7 text-accent" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-black text-white mb-4">启用 AI 决策链</h3>
              <p className="text-muted text-sm mb-6 leading-relaxed">
                开启后,策略引擎产生的信号会先发送给 AI 顾问进行单次审批。
                AI 会综合考虑市场情绪、历史准确率、Alpha 信号等因素,给出「批准/拒绝/延后」建议。
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success" /> 优势
                  </h4>
                  <ul className="space-y-2 text-xs text-muted">
                    <li className="flex items-start gap-2">
                      <span className="text-success">•</span>
                      <span>避免在市场极端情绪下做出错误决策</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-success">•</span>
                      <span>结合 Alpha 信号和历史数据</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-success">•</span>
                      <span>动态调整激进程度</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning" /> 注意事项
                  </h4>
                  <ul className="space-y-2 text-xs text-muted">
                    <li className="flex items-start gap-2">
                      <span className="text-warning">•</span>
                      <span>需要配置 AI API Key (DeepSeek / OpenAI)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-warning">•</span>
                      <span>每次审批约 1-3 秒延迟</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-warning">•</span>
                      <span>成本约 ¥0.005/次 (DeepSeek)</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="mt-6 p-4 rounded-2xl bg-black/40 border border-white/10">
                <code className="text-xs text-accent">
                  system_config.ai_auto_approve = true
                </code>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* 再平衡策略 */}
      <Section icon={<TrendingUp className="w-6 h-6" />} title="再平衡策略">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 定时再平衡 */}
          <div className="glass-hover p-8 rounded-[3rem] border border-white/5 group">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-info/20 flex items-center justify-center border border-info/30 group-hover:scale-110 transition-transform">
                <Settings className="w-6 h-6 text-info" />
              </div>
              <h3 className="text-lg font-black text-white">定时再平衡</h3>
            </div>
            <p className="text-muted text-xs mb-6 leading-relaxed">
              每 N 小时检查一次持仓,如果某些池子收益率下降或风险上升,自动调整到更优池子
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">检查频率</span>
                <span className="text-white font-bold">24 小时</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">触发条件</span>
                <span className="text-white font-bold">APR 下降 &gt; 30%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">再平衡阈值</span>
                <span className="text-white font-bold">偏差 &gt; 10%</span>
              </div>
            </div>
          </div>

          {/* 事件触发再平衡 */}
          <div className="glass-hover p-8 rounded-[3rem] border border-white/5 group">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-warning/20 flex items-center justify-center border border-warning/30 group-hover:scale-110 transition-transform">
                <AlertTriangle className="w-6 h-6 text-warning" />
              </div>
              <h3 className="text-lg font-black text-white">事件触发再平衡</h3>
            </div>
            <p className="text-muted text-xs mb-6 leading-relaxed">
              当检测到重大市场事件或池子异常时,立即触发再平衡检查
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted">
                <AlertTriangle className="w-3 h-3 text-warning" />
                <span>TVL 暴跌 &gt; 50%</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <AlertTriangle className="w-3 h-3 text-warning" />
                <span>APR 异常波动 (±100%)</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <AlertTriangle className="w-3 h-3 text-warning" />
                <span>协议安全事件</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <AlertTriangle className="w-3 h-3 text-warning" />
                <span>市场恐慌 (恐惧指数 &lt; 20)</span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* 策略测试 */}
      <div className="glass p-12 rounded-[3.5rem] border border-white/5 bg-gradient-to-br from-accent/10 to-transparent">
        <h3 className="text-2xl font-black text-white tracking-tight mb-6 flex items-center gap-3">
          <Zap className="w-7 h-7 text-accent" /> 策略测试 & 回测
        </h3>
        <p className="text-muted text-sm mb-8 max-w-3xl leading-relaxed">
          在实盘使用前,强烈建议先进行回测。使用历史池子数据模拟策略执行,评估收益率、最大回撤、夏普比率等指标。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-white">历史回测</h4>
            <p className="text-xs text-muted leading-relaxed">
              使用过去 30-90 天的真实数据测试策略表现
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-white">纸上交易</h4>
            <p className="text-xs text-muted leading-relaxed">
              实时模拟执行,不动用真实资金,观察 1-2 周
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-white">小额试跑</h4>
            <p className="text-xs text-muted leading-relaxed">
              先用 &lt; 5% 资金实盘测试,验证后再逐步加仓
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// 子组件
function Section({ icon, title, children }: { 
  icon: React.ReactNode; 
  title: string; 
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="flex items-center gap-3 text-2xl font-black text-white uppercase tracking-[0.1em]">
          <span className="text-accent">{icon}</span>
          {title}
        </h2>
        <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      </div>
      {children}
    </section>
  );
}

function ParamCard({ title, value, range, desc, recommendations }: {
  title: string;
  value: string;
  range: string;
  desc: string;
  recommendations: string[];
}) {
  return (
    <div className="glass-hover p-8 rounded-[24px] border border-white/5 group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h4 className="text-base font-black text-white mb-2">{title}</h4>
          <p className="text-muted text-xs mb-4 leading-relaxed">{desc}</p>
        </div>
        <div className="text-right ml-6">
          <div className="text-2xl font-black text-accent mb-1">{value}</div>
          <div className="text-[10px] text-muted-strong uppercase tracking-wider">{range}</div>
        </div>
      </div>
      <div className="space-y-2 pt-4 border-t border-white/5">
        <h5 className="text-xs font-bold text-white mb-3">💡 推荐配置</h5>
        {recommendations.map((rec, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-muted">
            <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />
            <span>{rec}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
