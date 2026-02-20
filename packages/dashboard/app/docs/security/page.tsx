"use client";

import React from "react";
import { Shield, Lock, Key, AlertTriangle, CheckCircle2, Eye, EyeOff, Server, FileKey } from "lucide-react";

export default function SecurityPage() {
  return (
    <div className="space-y-8 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* 页头 */}
      <div className="glass-hover glass p-12 rounded-[3.5rem] border border-error/20 bg-error/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-16 opacity-[0.05] pointer-events-none group-hover:rotate-12 transition-transform duration-1000">
          <Shield className="w-72 h-72 text-error" />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-[24px] bg-error/20 flex items-center justify-center border border-error/30 shadow-lg shadow-error/10">
              <Shield className="w-8 h-8 text-error" />
            </div>
            <div>
              <h1 className="text-5xl font-black text-white tracking-tight">安全指南</h1>
              <p className="text-muted-strong text-sm font-bold uppercase tracking-[0.2em] mt-2">私钥管理 · 风险控制 · 最佳实践</p>
            </div>
          </div>
          <div className="mt-8 p-6 rounded-2xl bg-error/20 border border-error/30">
            <p className="text-white text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-error mt-0.5 flex-shrink-0" />
              <span>
                <strong>⚠️ 重要:</strong> DeFi 操作涉及真实资金,任何疏忽都可能导致资产损失。
                请仔细阅读本指南并严格遵守安全规范。
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* 私钥管理 */}
      <Section icon={<Key className="w-6 h-6" />} title="私钥管理" level="🔴 严重">
        <div className="space-y-6">
          {/* 冷热钱包分离 */}
          <SecurityCard
            title="冷热钱包分离"
            severity="critical"
            icon={<Lock className="w-6 h-6" />}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-info" /> 热钱包 (Hot Wallet)
                  </h4>
                  <ul className="space-y-2 text-xs text-muted">
                    <li className="flex items-start gap-2">
                      <span className="text-info">•</span>
                      <span>用途: 日常交易、自动执行、流动性管理</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-info">•</span>
                      <span>资金量: ≤ 总资产的 20%</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-info">•</span>
                      <span>存储: 环境变量 + 加密存储</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success" /> 冷钱包 (Cold Wallet)
                  </h4>
                  <ul className="space-y-2 text-xs text-muted">
                    <li className="flex items-start gap-2">
                      <span className="text-success">•</span>
                      <span>用途: 大额资产存储、利润归集</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-success">•</span>
                      <span>资金量: ≥ 总资产的 80%</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-success">•</span>
                      <span>存储: 硬件钱包 (Ledger / Trezor)</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-black/40 border border-white/10">
                <p className="text-xs text-muted mb-3">💡 <strong className="text-white">推荐流程:</strong></p>
                <ol className="space-y-2 text-xs text-muted list-decimal list-inside">
                  <li>热钱包每日自动执行策略</li>
                  <li>当热钱包利润 &gt; 设定阈值 (如 $1000) 时触发归集</li>
                  <li>自动将利润转移到冷钱包地址</li>
                  <li>热钱包保持最小运营资金</li>
                </ol>
              </div>
            </div>
          </SecurityCard>

          {/* 私钥存储 */}
          <SecurityCard
            title="私钥存储最佳实践"
            severity="critical"
            icon={<FileKey className="w-6 h-6" />}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    do: true,
                    items: [
                      "✅ 使用环境变量 (.env)",
                      "✅ 加密存储 (AES-256)",
                      "✅ 使用密钥管理服务 (AWS KMS / HashiCorp Vault)",
                      "✅ 定期轮换私钥",
                      "✅ 多重签名钱包 (Gnosis Safe)"
                    ]
                  },
                  {
                    do: false,
                    items: [
                      "❌ 硬编码在代码中",
                      "❌ 提交到 Git 仓库",
                      "❌ 明文存储在配置文件",
                      "❌ 通过邮件/IM 传输",
                      "❌ 截图或拍照保存"
                    ]
                  }
                ].map((group, i) => (
                  <div key={i} className={`p-6 rounded-2xl border ${group.do ? 'bg-success/5 border-success/20' : 'bg-error/5 border-error/20'}`}>
                    <ul className="space-y-2 text-xs">
                      {group.items.map((item, j) => (
                        <li key={j} className={group.do ? 'text-success' : 'text-error'}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="p-6 rounded-2xl bg-warning/10 border border-warning/30">
                <p className="text-warning text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>警告:</strong> 如果你的私钥泄露,攻击者可以完全控制你的资产。
                    一旦发生泄露,请立即将资产转移到新地址。
                  </span>
                </p>
              </div>
            </div>
          </SecurityCard>

          {/* 权限最小化 */}
          <SecurityCard
            title="权限最小化 (Principle of Least Privilege)"
            severity="high"
            icon={<Eye className="w-6 h-6" />}
          >
            <div className="space-y-4">
              <p className="text-muted text-xs leading-relaxed">
                为每个服务/模块分配独立的钱包地址,仅授予必要的权限。避免使用「主钱包」执行所有操作。
              </p>
              <div className="space-y-3">
                {[
                  { service: "Executor", wallet: "0x1234...abcd", permissions: ["Swap", "Add Liquidity", "Remove Liquidity"], limit: "$5,000/day" },
                  { service: "Scanner", wallet: "0x5678...efgh", permissions: ["Read-only"], limit: "N/A" },
                  { service: "Profit Sweep", wallet: "0x9abc...ijkl", permissions: ["Transfer (Hot → Cold)"], limit: "$10,000/day" }
                ].map((item, i) => (
                  <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center border border-accent/30 flex-shrink-0">
                      <Server className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-bold text-white">{item.service}</h5>
                        <code className="text-[10px] text-muted bg-black/40 px-2 py-1 rounded">{item.wallet}</code>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-muted">权限:</span>
                        <div className="flex flex-wrap gap-1">
                          {item.permissions.map((perm, j) => (
                            <span key={j} className="px-2 py-0.5 rounded bg-accent/20 text-accent text-[10px]">{perm}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted">每日限额:</span>
                        <span className="text-white font-bold">{item.limit}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SecurityCard>
        </div>
      </Section>

      {/* 交易安全 */}
      <Section icon={<Shield className="w-6 h-6" />} title="交易安全" level="🟠 高">
        <div className="space-y-6">
          {/* 滑点控制 */}
          <SecurityCard
            title="滑点控制 (Slippage Protection)"
            severity="high"
            icon={<AlertTriangle className="w-6 h-6" />}
          >
            <div className="space-y-4">
              <p className="text-muted text-xs leading-relaxed">
                滑点是实际成交价格与预期价格的偏差。过高的滑点容许度会导致「三明治攻击」损失。
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: "稳定币对", slippage: "0.1%", desc: "USDC/USDT 等", color: "success" },
                  { label: "主流币对", slippage: "0.5%", desc: "ETH/BTC 等", color: "warning" },
                  { label: "长尾币对", slippage: "1-3%", desc: "小盘代币", color: "error" }
                ].map((item, i) => (
                  <div key={i} className={`p-6 rounded-2xl border bg-${item.color}/5 border-${item.color}/20`}>
                    <h5 className="text-sm font-bold text-white mb-2">{item.label}</h5>
                    <div className={`text-2xl font-black text-${item.color} mb-2`}>{item.slippage}</div>
                    <p className="text-xs text-muted">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </SecurityCard>

          {/* Gas 优化 */}
          <SecurityCard
            title="Gas 优化与 MEV 保护"
            severity="medium"
            icon={<Zap className="w-6 h-6" />}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h5 className="text-sm font-bold text-white">⛽ Gas 优化</h5>
                  <ul className="space-y-2 text-xs text-muted">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-3 h-3 text-success mt-0.5" />
                      <span>非高峰时段执行 (UTC 凌晨 2-6 点)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-3 h-3 text-success mt-0.5" />
                      <span>批量操作减少交易次数</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-3 h-3 text-success mt-0.5" />
                      <span>使用 L2 (Arbitrum / Base) 降低成本</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h5 className="text-sm font-bold text-white">🛡️ MEV 保护</h5>
                  <ul className="space-y-2 text-xs text-muted">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-3 h-3 text-success mt-0.5" />
                      <span>使用私有 RPC (Flashbots Protect)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-3 h-3 text-success mt-0.5" />
                      <span>设置合理的 deadline (60-120s)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-3 h-3 text-success mt-0.5" />
                      <span>避免在 mempool 中暴露大额交易</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </SecurityCard>
        </div>
      </Section>

      {/* 协议风险 */}
      <Section icon={<AlertTriangle className="w-6 h-6" />} title="协议风险" level="🟡 中">
        <div className="space-y-6">
          {/* 白名单协议 */}
          <SecurityCard
            title="白名单协议机制"
            severity="medium"
            icon={<CheckCircle2 className="w-6 h-6" />}
          >
            <div className="space-y-4">
              <p className="text-muted text-xs leading-relaxed">
                只与经过审计、TVL 高、运行时间长的顶级协议交互。避免使用未经验证的新协议。
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {["Aave", "Compound", "Uniswap", "Curve", "Lido", "MakerDAO", "Balancer", "Yearn"].map((protocol, i) => (
                  <div key={i} className="p-4 rounded-xl bg-success/5 border border-success/20 text-center">
                    <CheckCircle2 className="w-5 h-5 text-success mx-auto mb-2" />
                    <span className="text-xs font-bold text-white">{protocol}</span>
                  </div>
                ))}
              </div>
            </div>
          </SecurityCard>

          {/* 审计状态 */}
          <SecurityCard
            title="智能合约审计"
            severity="medium"
            icon={<FileKey className="w-6 h-6" />}
          >
            <div className="space-y-4">
              <p className="text-muted text-xs leading-relaxed">
                优先选择经过多家审计机构认证的协议,降低智能合约漏洞风险。
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { level: "A 级", auditors: "3+ 家审计", tvl: "> $1B", color: "success" },
                  { level: "B 级", auditors: "1-2 家审计", tvl: "$100M - $1B", color: "warning" },
                  { level: "C 级", auditors: "未审计", tvl: "< $100M", color: "error" }
                ].map((item, i) => (
                  <div key={i} className={`p-6 rounded-2xl border bg-${item.color}/5 border-${item.color}/20`}>
                    <h5 className={`text-lg font-black text-${item.color} mb-3`}>{item.level}</h5>
                    <div className="space-y-2 text-xs text-muted">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full bg-${item.color}`} />
                        <span>{item.auditors}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full bg-${item.color}`} />
                        <span>TVL {item.tvl}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SecurityCard>
        </div>
      </Section>

      {/* 应急响应 */}
      <div className="glass p-12 rounded-[3.5rem] border border-error/20 bg-error/5">
        <h3 className="text-2xl font-black text-white tracking-tight mb-6 flex items-center gap-3">
          <AlertTriangle className="w-7 h-7 text-error" /> 应急响应预案
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            {
              scenario: "🚨 私钥泄露",
              actions: [
                "立即停止所有自动化服务",
                "将资产转移到新地址",
                "撤销所有代币授权 (revoke.cash)",
                "更换所有相关密钥和 API Key"
              ]
            },
            {
              scenario: "💥 协议被攻击",
              actions: [
                "立即退出受影响的池子",
                "监控钱包余额变化",
                "检查是否有未授权交易",
                "向协议团队报告问题"
              ]
            },
            {
              scenario: "📉 市场暴跌",
              actions: [
                "触发紧急止损机制",
                "增加稳定币比例至 > 50%",
                "暂停新入场信号",
                "等待市场稳定后再恢复"
              ]
            },
            {
              scenario: "⚡ 系统故障",
              actions: [
                "切换到手动模式",
                "检查数据库和日志",
                "恢复最后已知良好状态",
                "逐步恢复自动化功能"
              ]
            }
          ].map((item, i) => (
            <div key={i} className="glass-hover p-6 rounded-[24px] border border-white/5 group">
              <h4 className="text-sm font-black text-white mb-4">{item.scenario}</h4>
              <ol className="space-y-2 text-xs text-muted list-decimal list-inside">
                {item.actions.map((action, j) => (
                  <li key={j}>{action}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 子组件
function Section({ icon, title, level, children }: { 
  icon: React.ReactNode; 
  title: string; 
  level: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="px-4 py-1.5 rounded-full bg-error/20 text-error text-[10px] font-black uppercase tracking-[0.2em] border border-error/20">
          {level}
        </div>
        <h2 className="flex items-center gap-3 text-2xl font-black text-white uppercase tracking-[0.1em]">
          <span className="text-error">{icon}</span>
          {title}
        </h2>
        <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      </div>
      {children}
    </section>
  );
}

function SecurityCard({ title, severity, icon, children }: {
  title: string;
  severity: "critical" | "high" | "medium";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const colors = {
    critical: "error",
    high: "warning",
    medium: "info"
  };
  const color = colors[severity];

  return (
    <div className={`glass-hover p-8 rounded-[3rem] border border-${color}/20 bg-${color}/5 group`}>
      <div className="flex items-center gap-4 mb-6">
        <div className={`w-12 h-12 rounded-2xl bg-${color}/20 flex items-center justify-center border border-${color}/30 group-hover:scale-110 transition-transform`}>
          <div className={`text-${color}`}>{icon}</div>
        </div>
        <h3 className="text-lg font-black text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}
