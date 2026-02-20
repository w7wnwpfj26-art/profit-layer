"use client";

import React, { useState, useEffect, createContext, useContext, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-8 right-8 z-[110] flex flex-col gap-4 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} {...t} onClose={() => setToasts((prev) => prev.filter((toast) => toast.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ message, type, onClose }: Toast & { onClose: () => void }) {
  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-success" />,
    error: <AlertCircle className="w-5 h-5 text-danger" />,
    info: <Info className="w-5 h-5 text-accent" />,
  };

  const borders = {
    success: "border-success/20 bg-success/5",
    error: "border-danger/20 bg-danger/5",
    info: "border-accent/20 bg-accent/5",
  };

  return (
    <div className={`
      pointer-events-auto flex items-start gap-4 p-5 rounded-[22px] glass border ${borders[type]}
      min-w-[320px] max-w-[400px] shadow-2xl animate-in slide-in-from-right-8 duration-500 cubic-bezier(0.23, 1, 0.32, 1)
    `}>
      <div className="shrink-0 mt-0.5">{icons[type]}</div>
      <div className="flex-1 space-y-1">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">System Notification</p>
        <p className="text-[13px] text-white/90 font-bold leading-relaxed">{message}</p>
      </div>
      <button onClick={onClose} className="shrink-0 p-1 hover:bg-white/5 rounded-lg transition-colors">
        <X className="w-4 h-4 text-white/20 hover:text-white" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
