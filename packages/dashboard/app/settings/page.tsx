"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { 
  ShieldAlert, 
  Bell, 
  Database, 
  Save, 
  AlertCircle,
  Lock,
  LogOut,
  BrainCircuit,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Wallet,
  ArrowUpRight,
  Eye,
  EyeOff
} from "lucide-react";
import { truncateAddress, validators } from "../lib/utils";
import { configValidators } from "../lib/validators";
import { apiFetch } from "../lib/api";

interface ConfigItem {
  key: string;
  value: string;
  description: string;
  category: string;
}

interface AIStatus {
  enabled: boolean;
  model: string | null;
  baseUrl: string | null;
  fallbackMode: boolean;
  message: string;
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ok: boolean; msg: string} | null>(null);

  // 2FA 状态
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetupStep, setTotpSetupStep] = useState<"idle" | "qr" | "disabling">("idle");
  const [totpQr, setTotpQr] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpMsg, setTotpMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    setError(null);
    const result = await apiFetch<{ configs?: ConfigItem[] }>("/api/settings");
    if (result.ok) {
      setConfigs(result.data.configs || []);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  const fetchTotpStatus = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await apiFetch<{ totpEnabled?: boolean }>("/api/auth");
      if (res.ok && res.data.totpEnabled !== undefined) {
        setTotpEnabled(res.data.totpEnabled);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchTotpStatus();
    fetch("/api/ai/status").then(r => r.json()).then(setAiStatus).catch(() => {});
  }, [fetchSettings, fetchTotpStatus]);

  const handleUpdate = (key: string, value: string) => {
    setConfigs(prev => prev.map((c) => (c.key === key ? { ...c, value } : c)));
  };

  const getVal = (key: string) => configs.find(c => c.key === key)?.value || "";

  const saveSettings = async () => {
    setSaving(true);
    setSuccess(false);
    setError(null);
    const result = await apiFetch<{ configs?: ConfigItem[] }>("/api/settings", {
      method: "POST",
      body: JSON.stringify({ configs }),
    });
    if (result.ok) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      fetch("/api/ai/status").then(r => r.json()).then(setAiStatus).catch(() => {});
    } else {
      setError(result.error);
    }
    setSaving(false);
  };

  const testAiConnection = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      // 先保存配置
      await apiFetch("/api/settings", {
        method: "POST",
        body: JSON.stringify({ configs }),
      });
      
      // 再测试 AI 连接
      const res = await apiFetch<{ ok: boolean; msg: string; reply?: string }>("/api/ai/test");
      if (res.ok) {
        setAiTestResult({ 
          ok: res.data.ok, 
          msg: res.data.ok ? `${res.data.msg}\nAI 回复：${res.data.reply}` : res.data.msg 
        });
      } else {
        setAiTestResult({ ok: false, msg: res.error });
      }
    } catch (err) {
      setAiTestResult({ ok: false, msg: `连接失败: ${err instanceof Error ? err.message : "未知错误"}` });
    } finally {
      setAiTesting(false);
    }
  };

  const handleTotpSetup = async () => {
    setTotpLoading(true);
    setTotpMsg(null);
    try {
      const userId = localStorage.getItem("userId");
      const username = localStorage.getItem("username");
      const res = await apiFetch<{ secret: string; qrDataUrl: string }>("/api/auth/totp/setup", { 
        method: "POST",
        headers: {
          "x-user-id": userId || "",
          "x-username": username || "",
        },
      });
      if (res.ok) {
        setTotpQr(res.data.qrDataUrl);
        setTotpSecret(res.data.secret);
        setTotpSetupStep("qr");
      } else {
        setTotpMsg({ ok: false, text: res.error });
      }
    } catch {
      setTotpMsg({ ok: false, text: "请求失败" });
    }
    setTotpLoading(false);
  };

  const handleTotpVerify = async () => {
    if (totpCode.length !== 6) return;
    setTotpLoading(true);
    setTotpMsg(null);
    try {
      const userId = localStorage.getItem("userId");
      const res = await apiFetch<{ success: boolean }>("/api/auth/totp/verify", {
        method: "POST",
        headers: { "x-user-id": userId || "" },
        body: JSON.stringify({ code: totpCode }),
      });
      if (res.ok) {
        setTotpEnabled(true);
        setTotpSetupStep("idle");
        setTotpCode("");
        setTotpQr("");
        setTotpSecret("");
        setTotpMsg({ ok: true, text: "2FA 已成功启用" });
      } else {
        setTotpMsg({ ok: false, text: res.error });
      }
    } catch {
      setTotpMsg({ ok: false, text: "验证失败" });
    }
    setTotpLoading(false);
  };

  const handleTotpDisable = async () => {
    if (totpCode.length !== 6) return;
    setTotpLoading(true);
    setTotpMsg(null);
    try {
      const userId = localStorage.getItem("userId");
      const res = await apiFetch<{ success: boolean }>("/api/auth/totp/disable", {
        method: "POST",
        headers: { "x-user-id": userId || "" },
        body: JSON.stringify({ code: totpCode }),
      });
      if (res.ok) {
        setTotpEnabled(false);
        setTotpSetupStep("idle");
        setTotpCode("");
        setTotpMsg({ ok: true, text: "2FA 已禁用" });
      } else {
        setTotpMsg({ ok: false, text: res.error });
      }
    } catch {
      setTotpMsg({ ok: false, text: "操作失败" });
    }
    setTotpLoading(false);
  };

  const handleLogout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    localStorage.clear();
    document.cookie = "auth_token=; path=/; max-age=0";
    window.location.href = "/login";
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-96 space-y-4">
      <Loader2 className="w-10 h-10 text-accent animate-spin" />
      <div className="text-muted animate-pulse font-bold uppercase tracking-widest text-xs">正在解密安全协议...</div>
    </div>
  );

  return (
    <div className="space-y-10 pb-32 animate-in fade-in duration-700">
      {/* 头部标题 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tighter font-outfit uppercase">
            <span className="text-gradient-accent">{t("configCenter")}</span>
          </h2>
          <p className="text-muted text-sm mt-2 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-accent" /> 
            {t("configSubtitle")}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {error && (
            <div className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs font-bold animate-shake">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
          
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/5 text-muted hover:text-white hover:bg-white/10 transition-all font-bold text-[10px] uppercase tracking-wider border border-white/5"
          >
            <LogOut className="w-4 h-4" /> {t("logout")}
          </button>
          
          <button
            onClick={saveSettings}
            disabled={saving}
            className={`group relative flex items-center gap-3 px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all overflow-hidden ${
              success ? "bg-success text-white" : "bg-accent text-white hover:scale-105 active:scale-95"
            } ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : success ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {success ? t("syncDone") : t("applyConfig")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* 左侧：AI + 紧急状态 */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* AI 配置卡片 */}
          <div className="glass-cyber p-8 rounded-[2.5rem] border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent via-purple-500 to-transparent" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-white font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent animate-pulse" /> {t("aiAdvisor")}
                </h3>
                {aiStatus && (
                  <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-2 border ${
                    aiStatus.enabled ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${aiStatus.enabled ? "bg-success animate-glow" : "bg-warning"}`} />
                    {aiStatus.enabled ? t("online") : t("ruleMode")}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <ConfigInput 
                  label="DeepSeek API Key"
                  value={getVal('deepseek_api_key')}
                  onChange={(v) => handleUpdate('deepseek_api_key', v)}
                  placeholder="sk-xxxxxxxxxxxxxxxx"
                  isSecret
                  configKey="deepseek_api_key"
                />

                <ConfigInput 
                  label="智谱 AI API Key"
                  value={getVal('zhipu_api_key')}
                  onChange={(v) => handleUpdate('zhipu_api_key', v)}
                  placeholder="xxxxxxxxxxxxxxxx.xxxxxx"
                  isSecret
                />
                
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest px-1">模型矩阵</label>
                  <div className="relative">
                    <select
                      value={getVal('ai_model') || 'deepseek-chat'}
                      onChange={(e) => handleUpdate('ai_model', e.target.value)}
                      className="w-full bg-[#101018] border border-white/5 rounded-2xl px-4 py-3.5 pr-10 text-xs text-white focus:outline-none focus:border-accent/50 transition-all cursor-pointer appearance-none hover:bg-[#151520] hover:border-white/10"
                      style={{ backgroundImage: 'none' }}
                    >
                      <option value="deepseek-chat">DeepSeek V3 (推荐·最低成本)</option>
                      <option value="deepseek-reasoner">DeepSeek R1 (深度推理)</option>
                      <option value="glm-5">GLM-5 (智谱 AI 旗舰)</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro (Google)</option>
                      <option value="gpt-4o">GPT-4o (OpenAI)</option>
                      <option value="gpt-4o-mini">GPT-4o Mini (OpenAI 轻量)</option>
                      <option value="llama3">Llama 3 (本地 Ollama)</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* AI 激进程度 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest">AI 激进程度</label>
                    <span className="text-[10px] font-black text-accent">{getVal('ai_temperature') || '0.7'}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={getVal('ai_temperature') || '0.7'}
                    onChange={(e) => handleUpdate('ai_temperature', e.target.value)}
                    className="w-full h-2 bg-[#101018] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-accent/50"
                  />
                  <div className="flex justify-between px-1">
                    <span className="text-[8px] text-muted">保守</span>
                    <span className="text-[8px] text-muted">激进</span>
                  </div>
                </div>

                {/* AI 最大 Token */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-muted uppercase tracking-widest px-1">响应长度 (Max Tokens)</label>
                  <div className="relative">
                    <select
                      value={getVal('ai_max_tokens') || '2000'}
                      onChange={(e) => handleUpdate('ai_max_tokens', e.target.value)}
                      className="w-full bg-[#101018] border border-white/5 rounded-2xl px-4 py-3.5 pr-10 text-xs text-white focus:outline-none focus:border-accent/50 transition-all cursor-pointer appearance-none hover:bg-[#151520] hover:border-white/10"
                      style={{ backgroundImage: 'none' }}
                    >
                      <option value="1000">简洁 (1000 tokens)</option>
                      <option value="2000">标准 (2000 tokens)</option>
                      <option value="4000">详细 (4000 tokens)</option>
                      <option value="8000">完整 (8000 tokens)</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-5 rounded-[2rem] bg-black/40 border border-white/5 group-hover:border-accent/20 transition-all">
                  <div>
                    <p className="text-white font-black text-xs">AI 自动审批</p>
                    <p className="text-[9px] text-muted font-bold uppercase mt-1">自主决策交易信号</p>
                  </div>
                  <ToggleButton 
                    active={getVal('ai_auto_approve') === 'true'} 
                    onClick={() => handleUpdate('ai_auto_approve', getVal('ai_auto_approve') === 'true' ? 'false' : 'true')}
                  />
                </div>

                <button
                  onClick={testAiConnection}
                  disabled={aiTesting}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-accent/10 border border-accent/20 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  {aiTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                  {aiTesting ? "正在握手..." : "测试 AI 连接"}
                </button>

                {aiTestResult && (
                  <div className={`p-4 rounded-2xl text-[10px] font-bold leading-relaxed animate-in slide-in-from-top-2 ${
                    aiTestResult.ok ? "bg-success/10 border border-success/20 text-success" : "bg-danger/10 border border-danger/20 text-danger"
                  }`}>
                    <div className="flex items-start gap-2">
                      {aiTestResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                      <span className="whitespace-pre-wrap">{aiTestResult.msg}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 紧急开关卡片 - 安全协议视觉隔离 */}
          <div className="glass-cyber p-8 rounded-[2.5rem] bg-danger/5 border-2 border-danger/20 relative overflow-hidden group">
            <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none translate-x-4 translate-y-4">
              <ShieldAlert className="w-32 h-32 text-danger" />
            </div>
            <h3 className="text-danger font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-2 mb-8">
              <AlertCircle className="w-4 h-4" /> 风险隔离协议
            </h3>

            <div className="space-y-4 relative z-10">
              <ToggleRow
                title="紧急停止开关"
                desc="瞬间熔断所有链上交互"
                active={getVal('kill_switch') === 'true'}
                onClick={() => handleUpdate('kill_switch', getVal('kill_switch') === 'true' ? 'false' : 'true')}
                danger
              />
              <ToggleRow
                title="全自动驾驶"
                desc="允许 AI 自动调度资金"
                active={getVal('autopilot_enabled') === 'true'}
                onClick={() => handleUpdate('autopilot_enabled', getVal('autopilot_enabled') === 'true' ? 'false' : 'true')}
              />
              <ToggleRow
                title="模拟沙盒模式"
                desc="仅执行逻辑不发送交易"
                active={getVal('autopilot_dry_run') === 'true'}
                onClick={() => handleUpdate('autopilot_dry_run', getVal('autopilot_dry_run') === 'true' ? 'false' : 'true')}
                warning
              />
            </div>
          </div>

          {/* 安全验证 (2FA) 卡片 - 视觉隔离 */}
          <div className="glass-cyber p-8 rounded-[2.5rem] border-2 border-success/20 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-success via-emerald-500 to-transparent" />
            <div className="relative z-10">
              <h3 className="text-white font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-2 mb-8">
                <ShieldCheck className="w-4 h-4 text-success" /> 安全验证 (2FA)
              </h3>

              {/* 当前状态 */}
              <div className="flex items-center justify-between p-5 rounded-[2rem] bg-black/40 border border-white/5 mb-6">
                <div>
                  <p className="text-white font-black text-xs">Google Authenticator</p>
                  <p className="text-[9px] text-muted font-bold uppercase mt-1">二次验证保护</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-2 border ${
                  totpEnabled ? "bg-success/10 text-success border-success/20" : "bg-white/5 text-muted border-white/10"
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${totpEnabled ? "bg-success animate-glow" : "bg-muted"}`} />
                  {totpEnabled ? "已启用" : "未启用"}
                </div>
              </div>

              {totpMsg && (
                <div className={`p-4 rounded-2xl text-[10px] font-bold mb-6 animate-in slide-in-from-top-2 ${
                  totpMsg.ok ? "bg-success/10 border border-success/20 text-success" : "bg-danger/10 border border-danger/20 text-danger"
                }`}>
                  <div className="flex items-center gap-2">
                    {totpMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {totpMsg.text}
                  </div>
                </div>
              )}

              {totpSetupStep === "idle" && !totpEnabled && (
                <button
                  onClick={handleTotpSetup}
                  disabled={totpLoading}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-success/10 border border-success/20 text-success text-[10px] font-black uppercase tracking-widest hover:bg-success/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  {totpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  启用 Google Authenticator
                </button>
              )}

              {totpSetupStep === "qr" && (
                <div className="space-y-5">
                  <div className="flex justify-center">
                    {totpQr && <img src={totpQr} alt="TOTP QR Code" className="w-48 h-48 rounded-2xl border border-white/10" />}
                  </div>
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                    <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-2">手动输入密钥</p>
                    <p className="text-xs text-white font-mono break-all select-all">{totpSecret}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest px-1">输入 6 位验证码确认</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      className="w-full bg-white/2 border border-white/5 rounded-2xl px-5 py-3.5 text-sm text-white text-center font-mono tracking-[0.5em] focus:outline-none focus:border-success/50 focus:bg-white/5 transition-all"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setTotpSetupStep("idle"); setTotpCode(""); setTotpQr(""); setTotpSecret(""); setTotpMsg(null); }}
                      className="flex-1 py-3 rounded-2xl bg-white/5 text-muted text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleTotpVerify}
                      disabled={totpLoading || totpCode.length !== 6}
                      className="flex-1 py-3 rounded-2xl bg-success text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all disabled:opacity-50"
                    >
                      {totpLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "确认启用"}
                    </button>
                  </div>
                </div>
              )}

              {totpSetupStep === "idle" && totpEnabled && (
                <button
                  onClick={() => { setTotpSetupStep("disabling"); setTotpCode(""); setTotpMsg(null); }}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-white/5 border border-white/5 text-muted text-[10px] font-black uppercase tracking-widest hover:bg-danger/10 hover:text-danger hover:border-danger/20 transition-all active:scale-95"
                >
                  禁用 2FA
                </button>
              )}

              {totpSetupStep === "disabling" && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-muted uppercase tracking-widest px-1">输入当前验证码以禁用</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      className="w-full bg-white/2 border border-white/5 rounded-2xl px-5 py-3.5 text-sm text-white text-center font-mono tracking-[0.5em] focus:outline-none focus:border-danger/50 focus:bg-white/5 transition-all"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setTotpSetupStep("idle"); setTotpCode(""); setTotpMsg(null); }}
                      className="flex-1 py-3 rounded-2xl bg-white/5 text-muted text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleTotpDisable}
                      disabled={totpLoading || totpCode.length !== 6}
                      className="flex-1 py-3 rounded-2xl bg-danger text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-400 transition-all disabled:opacity-50"
                    >
                      {totpLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "确认禁用"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：参数项 */}
        <div className="lg:col-span-8 space-y-10">
          
          <ConfigSection title="通知终端" icon={<Bell className="w-4 h-4 text-accent" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <ConfigInput 
                label="Telegram Token" 
                value={getVal('telegram_bot_token')} 
                onChange={(v) => handleUpdate('telegram_bot_token', v)}
                placeholder="xxxx:xxxx"
                isSecret
              />
              <ConfigInput 
                label="Telegram Chat ID" 
                value={getVal('telegram_chat_id')} 
                onChange={(v) => handleUpdate('telegram_chat_id', v)}
                placeholder="-100xxxx"
              />
            </div>
          </ConfigSection>

          <ConfigSection title="风险边界与阈值" icon={<ShieldAlert className="w-4 h-4 text-warning" />}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <ConfigInput label="总投资额 ($)" value={getVal('total_capital_usd')} onChange={(v) => handleUpdate('total_capital_usd', v)} type="number" configKey="total_capital_usd" />
              <ConfigInput label="单笔限额 ($)" value={getVal('max_single_tx_usd')} onChange={(v) => handleUpdate('max_single_tx_usd', v)} type="number" configKey="max_single_tx_usd" />
              <ConfigInput label="止损阈值 (%)" value={getVal('stop_loss_pct')} onChange={(v) => handleUpdate('stop_loss_pct', v)} type="number" configKey="stop_loss_pct" />
            </div>
          </ConfigSection>

          <ConfigSection title="扫描器引擎" icon={<Database className="w-4 h-4 text-success" />}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <ConfigInput label="扫描间隔 (分)" value={getVal('scan_interval_min')} onChange={(v) => handleUpdate('scan_interval_min', v)} type="number" configKey="scan_interval_min" />
              <ConfigInput label="最低 TVL ($)" value={getVal('min_tvl_usd')} onChange={(v) => handleUpdate('min_tvl_usd', v)} type="number" />
              <ConfigInput label="复投间隔 (时)" value={getVal('compound_interval_hr')} onChange={(v) => handleUpdate('compound_interval_hr', v)} type="number" />
            </div>
          </ConfigSection>

          <ProfitSweepCard 
            enabled={getVal('profit_sweep_enabled') === 'true'}
            threshold={getVal('profit_sweep_threshold')}
            coldWallet={getVal('cold_wallet_address')}
            onToggle={() => handleUpdate('profit_sweep_enabled', getVal('profit_sweep_enabled') === 'true' ? 'false' : 'true')}
            onThresholdChange={(v) => handleUpdate('profit_sweep_threshold', v)}
            onWalletChange={(v) => handleUpdate('cold_wallet_address', v)}
          />
        </div>
      </div>

      <style jsx global>{`
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 5px rgba(16, 185, 129, 0.5); }
          50% { box-shadow: 0 0 15px rgba(16, 185, 129, 0.8); }
        }
        .animate-glow { animation: glow 2s infinite; }
        .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }
      `}</style>
    </div>
  );
}

function ConfigSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass p-8 rounded-[3rem] border-white/5 hover:border-white/10 transition-all group shadow-2xl">
      <h3 className="text-white font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-2 mb-10 group-hover:translate-x-1 transition-transform">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function ConfigInput({ label, value, onChange, placeholder, type = "text", isSecret = false, configKey }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  isSecret?: boolean;
  configKey?: string;
}) {
  const [show, setShow] = useState(!isSecret);
  const [err, setErr] = useState<string | null>(null);

  const handleChange = (v: string) => {
    if (configKey && configValidators[configKey]) {
      const { valid, error } = configValidators[configKey](v);
      setErr(valid ? null : error);
    } else if (configKey === "deepseek_api_key" && v && !validators.isValidApiKey(v)) {
      setErr("格式不正确 (sk-...)");
    } else if (type === "number" && v && !validators.isPositiveNumber(v)) {
      setErr("必须为正数");
    } else {
      setErr(null);
    }
    onChange(v);
  };

  return (
    <div className="flex flex-col gap-2.5 group">
      <div className="flex justify-between px-1">
        <label className="text-[9px] font-black text-muted uppercase tracking-widest">{label}</label>
        {err && <span className="text-[9px] font-bold text-danger animate-pulse">{err}</span>}
      </div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-white/2 border ${err ? 'border-danger/50' : 'border-white/5'} rounded-2xl px-5 py-3.5 text-xs text-white focus:outline-none focus:border-accent/50 focus:bg-white/5 transition-all group-hover:border-white/10 font-medium shadow-inner`}
        />
        {isSecret && (
          <button 
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  desc,
  active,
  onClick,
  danger,
  warning,
}: {
  title: string;
  desc: string;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-5 rounded-[2rem] bg-black/40 border border-white/5 hover:bg-black/60 transition-all shadow-lg group">
      <div>
        <p className={`font-black text-xs ${danger ? 'text-danger' : 'text-white'} group-hover:scale-105 transition-transform origin-left`}>{title}</p>
        <p className="text-[9px] text-muted font-bold uppercase mt-1 opacity-70">{desc}</p>
      </div>
      <ToggleButton active={active} onClick={onClick} danger={danger} warning={warning} />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  danger,
  warning,
}: {
  active: boolean;
  onClick: () => void;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none ${
        active 
          ? danger ? 'bg-danger shadow-[0_0_15px_rgba(239,68,68,0.4)]' : warning ? 'bg-warning shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-accent shadow-[0_0_15px_rgba(99,102,241,0.4)]'
          : 'bg-white/10'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${active ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function ProfitSweepCard({
  enabled,
  threshold,
  coldWallet,
  onToggle,
  onThresholdChange,
  onWalletChange,
}: {
  enabled: boolean;
  threshold: string;
  coldWallet: string;
  onToggle: () => void;
  onThresholdChange: (v: string) => void;
  onWalletChange: (v: string) => void;
}) {
  const isWalletValid = !coldWallet || validators.isEvmAddress(coldWallet);
  
  return (
    <div className={`glass p-8 rounded-[3rem] relative overflow-hidden transition-all duration-500 shadow-2xl ${
      enabled ? 'border-accent/30 bg-accent/5 shadow-[0_0_40px_rgba(99,102,241,0.05)]' : 'border-white/5'
    }`}>
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent via-purple-500 to-transparent opacity-50" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-white font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-accent" /> 自动化利润归集
          </h3>
          <ToggleButton active={enabled} onClick={onToggle} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <ConfigInput label="归集阈值 ($)" value={threshold} onChange={onThresholdChange} type="number" />
          <div className="space-y-2.5">
            <div className="flex justify-between px-1">
              <label className="text-[9px] font-black text-muted uppercase tracking-widest">冷钱包存储地址</label>
              {!isWalletValid && <span className="text-[9px] font-bold text-danger animate-pulse">地址格式不合法</span>}
            </div>
            <input
              value={coldWallet}
              onChange={(e) => onWalletChange(e.target.value)}
              placeholder="0x..."
              className={`w-full bg-white/2 border ${isWalletValid ? 'border-white/5' : 'border-danger/50'} rounded-2xl px-5 py-3.5 text-xs text-white font-mono focus:outline-none focus:border-accent/50 transition-all shadow-inner`}
            />
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-black/40 border border-white/5 flex items-center gap-4 hover:border-accent/30 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent shadow-glow">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-white font-black text-sm">目标金库: {truncateAddress(coldWallet)}</p>
            <p className="text-[9px] text-muted font-black uppercase mt-1 tracking-widest">
              监控状态: {enabled ? "实时扫描中" : "已挂起"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
