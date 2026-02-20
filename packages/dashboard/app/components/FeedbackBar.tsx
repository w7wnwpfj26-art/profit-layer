"use client";

import React, { useEffect } from "react";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

type Variant = "success" | "error" | "warning";

export function FeedbackBar({
  message,
  variant = "error",
  onDismiss,
  autoDismissMs = 5000,
}: {
  message: string | null;
  variant?: Variant;
  onDismiss?: () => void;
  autoDismissMs?: number;
}) {
  useEffect(() => {
    if (!message || !autoDismissMs || !onDismiss) return;
    const t = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(t);
  }, [message, autoDismissMs, onDismiss]);

  if (!message) return null;

  const styles: Record<Variant, string> = {
    success: "bg-success/10 border-success/20 text-success",
    error: "bg-danger/10 border-danger/20 text-danger",
    warning: "bg-warning/10 border-warning/20 text-warning",
  };
  const icons: Record<Variant, React.ReactNode> = {
    success: <CheckCircle2 className="w-5 h-5 shrink-0" />,
    error: <XCircle className="w-5 h-5 shrink-0" />,
    warning: <AlertCircle className="w-5 h-5 shrink-0" />,
  };

  return (
    <div
      className={`flex items-center gap-3 px-5 py-4 rounded-2xl border text-sm font-bold animate-in slide-in-from-top-2 ${styles[variant]}`}
      role="alert"
    >
      {icons[variant]}
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="关闭"
        >
          <XCircle className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
