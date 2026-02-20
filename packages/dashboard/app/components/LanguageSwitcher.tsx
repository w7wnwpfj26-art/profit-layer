"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  const setLocale = async (newLocale: string) => {
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: newLocale }),
    });
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1.5 rounded-xl bg-white/[0.03] border border-white/5 p-1">
      <Globe className="w-3.5 h-3.5 text-muted shrink-0" />
      <button
        onClick={() => setLocale("zh-CN")}
        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
          locale === "zh-CN"
            ? "bg-accent/20 text-accent"
            : "text-muted hover:text-foreground"
        }`}
      >
        中文
      </button>
      <button
        onClick={() => setLocale("en")}
        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
          locale === "en"
            ? "bg-accent/20 text-accent"
            : "text-muted hover:text-foreground"
        }`}
      >
        EN
      </button>
    </div>
  );
}
