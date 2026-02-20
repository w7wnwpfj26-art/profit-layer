"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, AlertCircle, Zap, ArrowRight, Eye, EyeOff, ShieldCheck, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // TOTP 二步验证状态
  const [totpStep, setTotpStep] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [tempToken, setTempToken] = useState("");

  /** 登录成功后保存凭证 */
  const saveCredentials = (data: { token: string; username: string; userId: string | number }) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("username", data.username);
    localStorage.setItem("userId", String(data.userId));
    document.cookie = `auth_token=${data.token}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (totpStep) {
        // TOTP 验证步骤
        const res = await fetch("/api/auth/totp/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tempToken, code: totpCode }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "验证码错误");
          setLoading(false);
          return;
        }
        saveCredentials(data);
        router.push("/");
        return;
      }

      // 密码登录 / 注册
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isRegister ? "register" : "login",
          username,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "操作失败");
        setLoading(false);
        return;
      }

      // 需要 TOTP 二次验证
      if (data.requireTotp) {
        setTempToken(data.tempToken);
        setTotpStep(true);
        setLoading(false);
        return;
      }

      // 直接登录成功
      saveCredentials(data);
      router.push("/");
    } catch {
      setError("网络错误，请稍后再试");
    }
    setLoading(false);
  };

  const handleBackToPassword = () => {
    setTotpStep(false);
    setTotpCode("");
    setTempToken("");
    setError("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-accent/10 rounded-full blur-[150px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-success/5 rounded-full blur-[120px]" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="glass p-10 rounded-[3rem] border-white/5 shadow-2xl relative overflow-hidden">
          {/* 内部微光 */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-50" />

          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-accent rounded-2xl mb-6 shadow-[0_0_30px_rgba(99,102,241,0.4)]">
              {totpStep ? (
                <ShieldCheck className="w-10 h-10 text-white" />
              ) : (
                <Zap className="w-10 h-10 text-white fill-current" />
              )}
            </div>
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase">
              {totpStep ? "二次验证" : "协议控制台"}
            </h1>
            <p className="text-muted text-[10px] font-bold uppercase tracking-[0.3em] mt-3">
              {totpStep ? "请输入 Google Authenticator 验证码" : "AI 驱动的自动化收益调度协议"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {!totpStep ? (
              <>
                {/* 用户名 */}
                <div className="space-y-2 group">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">身份标识</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-accent transition-colors" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="输入用户名"
                      className="w-full bg-white/2 border border-white/5 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white focus:outline-none focus:border-accent/50 focus:bg-white/5 transition-all"
                      required
                    />
                  </div>
                </div>

                {/* 密码 */}
                <div className="space-y-2 group">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">访问凭证</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-accent transition-colors" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="输入加密密钥"
                      className="w-full bg-white/2 border border-white/5 rounded-2xl pl-12 pr-12 py-3.5 text-sm text-white focus:outline-none focus:border-accent/50 focus:bg-white/5 transition-all"
                      required
                      minLength={isRegister ? 6 : 1}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* TOTP 验证码输入 */}
                <div className="space-y-2 group">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">6 位验证码</label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-accent transition-colors" />
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      className="w-full bg-white/2 border border-white/5 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white text-center font-mono tracking-[0.5em] focus:outline-none focus:border-accent/50 focus:bg-white/5 transition-all"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleBackToPassword}
                  className="flex items-center gap-2 text-[10px] font-bold text-muted hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" /> 返回密码登录
                </button>
              </>
            )}

            {error && (
              <div className="flex items-center gap-3 text-xs font-bold text-danger bg-danger/10 border border-danger/20 rounded-2xl px-4 py-3 animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (totpStep && totpCode.length !== 6)}
              className="w-full relative group"
            >
              <div className="absolute inset-0 bg-accent rounded-2xl blur-lg opacity-20 group-hover:opacity-40 transition-opacity" />
              <div className="relative flex items-center justify-center gap-3 bg-accent hover:bg-indigo-400 text-white rounded-2xl py-4 font-black text-xs uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-50">
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : totpStep ? (
                  <>
                    验证并登录
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                ) : (
                  <>
                    {isRegister ? "初始化账户" : "进入控制台"}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </div>
            </button>
          </form>

          {!totpStep && (
            <>
              <div className="mt-10 text-center relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5"></div>
                </div>
                <span className="relative px-4 bg-[#14141c] text-[9px] font-black text-muted uppercase tracking-widest">模式切换</span>
              </div>

              <div className="text-center mt-6">
                <button
                  onClick={() => { setIsRegister(!isRegister); setError(""); }}
                  className="text-[10px] font-black text-accent hover:text-indigo-400 uppercase tracking-widest transition-colors"
                >
                  {isRegister ? "已有账号？去登录" : "新操作员？创建实例"}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="mt-8 text-center text-[10px] font-bold text-muted/50 uppercase tracking-[0.2em]">
          由端到端加密与 AI 实时风险监控系统保护
        </p>
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
      `}</style>
    </div>
  );
}
