"use client";

import { useState, useRef, useEffect } from "react";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Minimize2,
  Maximize2,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const QUICK_PROMPTS = ["查看持仓", "推荐池子", "查看告警"];

export function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "你好！我是 Nexus Yield AI 助手 🤖\n\n我可以帮你：\n- 查看和管理持仓\n- 寻找高收益机会\n- 执行投资操作\n- 监控风险告警\n\n有什么可以帮你的？",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  const sendMessage = async (text?: string) => {
    const content = (text || input).trim();
    if (!content || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message || data.error || "抱歉，我暂时无法处理这个请求。",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "网络错误，请稍后重试。",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 z-50 w-16 h-16 bg-accent rounded-2xl flex items-center justify-center hover:scale-105 transition-all duration-300 group shadow-[0_20px_40px_rgba(14,165,233,0.3)] ring-4 ring-accent/10"
      >
        <MessageCircle className="w-7 h-7 text-white" />
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-success rounded-full border-4 border-[#030406] animate-pulse" />
        <div className="absolute right-full mr-4 px-4 py-2 bg-white/95 backdrop-blur-md text-black text-[10px] font-black uppercase tracking-widest rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">
          AI 智能助手
        </div>
      </button>
    );
  }

  return (
    <div
      className={`fixed z-50 glass transition-all duration-700 cubic-bezier(0.23, 1, 0.32, 1) flex flex-col overflow-hidden border border-white/10 shadow-[0_40px_80px_rgba(0,0,0,0.6)] animate-in slide-in-from-bottom-8 ${
        isMinimized
          ? "bottom-8 right-8 w-72 h-20 rounded-[28px]"
          : "bottom-8 right-8 w-[440px] h-[640px] max-h-[85vh] rounded-[32px]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-white/[0.03] flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-accent/20 rounded-2xl flex items-center justify-center ring-1 ring-accent/40 shadow-[0_0_20px_rgba(14,165,233,0.15)] group">
            <Bot className="w-6 h-6 text-accent transition-transform duration-500 group-hover:scale-110" />
          </div>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] font-outfit">Neural Agent</h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <p className="text-[9px] font-black text-success uppercase tracking-widest">量子链路已连接</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/chat"
            className="p-2.5 rounded-xl hover:bg-white/10 transition-all text-muted-strong hover:text-white"
            title="Open Console"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-2.5 rounded-xl hover:bg-white/10 transition-all text-muted-strong hover:text-white"
          >
            {isMinimized ? (
              <Maximize2 className="w-4 h-4" />
            ) : (
              <Minimize2 className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2.5 rounded-xl hover:bg-white/10 transition-all text-muted-strong hover:text-danger"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    msg.role === "user" ? "bg-accent" : "bg-success/20"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4 text-success" />
                  )}
                </div>
                <div
                  className={`max-w-[85%] px-5 py-4 rounded-[22px] text-xs leading-[1.6] shadow-xl ${
                    msg.role === "user"
                      ? "bg-accent text-white rounded-tr-none font-bold shadow-accent/20"
                      : "bg-white/[0.04] text-white/95 border border-white/10 rounded-tl-none chat-markdown backdrop-blur-md"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-lg bg-success/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-success" />
                </div>
                <div className="px-3 py-2 rounded-xl bg-white/5 rounded-tl-none">
                  <Loader2 className="w-4 h-4 animate-spin text-muted" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-border text-[11px] text-muted hover:border-accent/50 hover:text-foreground transition-all"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-5 border-t border-white/5 bg-white/[0.01] flex-shrink-0">
            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="询问 AI 助手..."
                className="flex-1 px-5 py-3 rounded-[18px] bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-accent/50 focus:ring-4 focus:ring-accent/10 transition-all"
                disabled={isLoading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                className="w-11 h-11 rounded-[18px] bg-accent text-white disabled:opacity-30 disabled:grayscale hover:bg-accent/90 transition-all flex items-center justify-center shadow-lg shadow-accent/20 active:scale-95"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-3 px-1">
              <p className="text-[10px] text-muted-strong font-bold uppercase tracking-widest">
                AI 智能驱动
              </p>
              <Link href="/chat" className="text-[10px] text-accent font-black uppercase tracking-widest hover:text-white transition-colors">
                全屏对话模式
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
