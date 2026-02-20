"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  Bot,
  User,
  Trash2,
  Sparkles,
  ArrowLeft,
  Copy,
  Check,
  Zap,
  ShieldAlert,
  TrendingUp,
  RefreshCcw,
  Download,
  ThumbsUp,
  ThumbsDown,
  BarChart3,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  feedback?: "up" | "down" | null;
}

const SUGGESTED_PROMPTS = [
  {
    icon: <TrendingUp className="w-5 h-5 text-emerald-400" />,
    title: "分析投资机会",
    prompt: "帮我分析当前市场的高收益投资机会",
    desc: "基于 APY 和 TVL 的智能推荐",
    gradient: "from-emerald-500/10 to-emerald-600/5",
    border: "border-emerald-500/20",
    hover: "hover:border-emerald-500/40 hover:shadow-emerald-500/10",
  },
  {
    icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
    title: "风险扫描",
    prompt: "扫描我当前持仓的风险情况",
    desc: "检查无常损失和清算风险",
    gradient: "from-amber-500/10 to-amber-600/5",
    border: "border-amber-500/20",
    hover: "hover:border-amber-500/40 hover:shadow-amber-500/10",
  },
  {
    icon: <Zap className="w-5 h-5 text-blue-400" />,
    title: "推荐高收益池",
    prompt: "推荐当前收益率最高的 3 个流动性池",
    desc: "筛选优质 DeFi 矿池",
    gradient: "from-blue-500/10 to-blue-600/5",
    border: "border-blue-500/20",
    hover: "hover:border-blue-500/40 hover:shadow-blue-500/10",
  },
  {
    icon: <RefreshCcw className="w-5 h-5 text-purple-400" />,
    title: "持仓再平衡",
    prompt: "我的持仓需要再平衡吗？",
    desc: "优化资产配置比例",
    gradient: "from-purple-500/10 to-purple-600/5",
    border: "border-purple-500/20",
    hover: "hover:border-purple-500/40 hover:shadow-purple-500/10",
  },
];

const QUICK_ACTIONS = [
  {
    icon: <Wallet className="w-4 h-4" />,
    label: "查看持仓",
    href: "/positions",
  },
  {
    icon: <BarChart3 className="w-4 h-4" />,
    label: "查看策略",
    href: "/strategies",
  },
];

const CHAT_STORAGE_KEY = "nexus_chat_messages";

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Load messages from local storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CHAT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Array<{
          id: string;
          role: "user" | "assistant";
          content: string;
          timestamp: string;
          feedback?: "up" | "down" | null;
        }>;
        if (parsed.length > 0) {
          setMessages(
            parsed.map((m) => ({
              ...m,
              timestamp: new Date(m.timestamp),
            }))
          );
          setIsInitialLoad(false);
          return;
        }
      }
    } catch {
      // ignored
    }
    setIsInitialLoad(false);
  }, []);

  // Save messages to local storage
  useEffect(() => {
    if (messages.length === 0 && !isInitialLoad) {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      return;
    }
    if (messages.length === 0) return;

    const toStore = messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
      feedback: m.feedback,
    }));
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toStore));
  }, [messages, isInitialLoad]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isInitialLoad) {
      inputRef.current?.focus();
    }
  }, [isInitialLoad]);

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

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

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

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.message || data.error || "抱歉，我暂时无法处理这个请求。",
          timestamp: new Date(),
        },
      ]);
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

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  const clearChat = () => {
    if (!confirm("确定要清空所有对话吗？")) return;
    setMessages([]);
    localStorage.removeItem(CHAT_STORAGE_KEY);
    inputRef.current?.focus();
  };

  const copyToClipboard = async (id: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFeedback = (id: string, feedback: "up" | "down") => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, feedback: m.feedback === feedback ? null : feedback } : m
      )
    );
  };

  const exportChat = () => {
    const chatText = messages
      .map((m) => {
        const time = formatTime(m.timestamp);
        const role = m.role === "user" ? "用户" : "Nexus AI";
        return `[${time}] ${role}:\n${m.content}\n`;
      })
      .join("\n");

    const blob = new Blob([chatText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat_${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render "Hero" section if no messages
  const renderEmptyState = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-5xl mx-auto w-full animate-in fade-in duration-1000">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-400/20 rounded-3xl blur-2xl" />
        <div className="relative w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/30 border border-white/10">
          <Sparkles className="w-10 h-10 text-white animate-pulse" />
        </div>
      </div>

      <h1 className="text-5xl font-black text-white mb-4 text-center tracking-tight">
        Nexus AI 助手
      </h1>
      <p className="text-muted text-center max-w-2xl mb-12 text-lg leading-relaxed">
        我是您的智能 DeFi 投资顾问，可以帮您分析持仓、监控风险、发现高收益机会，并提供专业的投资建议。
      </p>

      {/* Quick Actions */}
      <div className="flex items-center gap-3 mb-8">
        {QUICK_ACTIONS.map((action, idx) => (
          <Link
            key={idx}
            href={action.href}
            className="flex items-center gap-2 px-4 py-2 rounded-xl glass border border-white/10 hover:border-accent/40 text-sm font-bold text-white hover:text-accent transition-all shadow-lg hover:shadow-accent/20 hover:scale-105"
          >
            {action.icon}
            <span>{action.label}</span>
          </Link>
        ))}
      </div>

      {/* Suggested Prompts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl">
        {SUGGESTED_PROMPTS.map((item, idx) => (
          <button
            key={idx}
            onClick={() => sendMessage(item.prompt)}
            disabled={isLoading}
            className={`group relative flex items-start gap-4 p-6 rounded-2xl glass border ${item.border} ${item.hover} transition-all text-left overflow-hidden shadow-xl hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-100 transition-opacity`} />
            <div className="relative z-10 p-3 rounded-xl glass border border-white/10 group-hover:border-white/20 transition-all group-hover:scale-110">
              {item.icon}
            </div>
            <div className="relative z-10 flex-1">
              <h3 className="font-black text-white mb-1.5 text-base tracking-tight group-hover:text-accent transition-colors">
                {item.title}
              </h3>
              <p className="text-sm text-muted leading-relaxed">{item.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <p className="text-xs text-muted text-center mt-12 opacity-60 max-w-lg">
        提示：您可以询问关于 DeFi 投资、风险管理、收益优化等任何问题
      </p>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] md:h-[calc(100vh-2rem)] bg-background -m-6 md:-m-8 lg:-m-10 overflow-hidden relative">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent pointer-events-none" />

      {/* Navbar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 glass border-b border-white/5">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2 rounded-xl glass border border-white/10 hover:border-accent/40 text-muted hover:text-accent transition-all hover:scale-105"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-white text-sm tracking-tight">AI 对话</span>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-black uppercase tracking-wider">
                  Beta
                </span>
              </div>
              {messages.length > 0 && (
                <span className="text-[10px] text-muted font-bold">
                  {messages.length} 条消息
                </span>
              )}
            </div>
          </div>
        </div>

        {messages.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={exportChat}
              className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-white/10 hover:border-blue-500/40 text-sm font-bold text-muted hover:text-blue-400 transition-all hover:scale-105"
              title="导出对话"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">导出</span>
            </button>
            <button
              onClick={clearChat}
              className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-white/10 hover:border-red-500/40 text-sm font-bold text-muted hover:text-red-400 transition-all hover:scale-105"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">清空</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="relative flex-1 overflow-y-auto scroll-smooth">
        {messages.length === 0 ? (
          renderEmptyState()
        ) : (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-4 ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                } animate-in fade-in slide-in-from-bottom-4 duration-500`}
              >
                {/* Avatar */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border shadow-lg ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-blue-600 to-blue-500 border-blue-400/20 shadow-blue-500/20"
                      : "glass border-white/10 shadow-emerald-500/10"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="w-5 h-5 text-white" />
                  ) : (
                    <Bot className="w-6 h-6 text-emerald-400" />
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  className={`flex-1 min-w-0 max-w-[85%] group ${
                    msg.role === "user" ? "flex flex-col items-end" : ""
                  }`}
                >
                  <div className="flex items-baseline gap-2 mb-2 px-1">
                    <span className="text-sm font-black text-white tracking-tight">
                      {msg.role === "user" ? "你" : "Nexus AI"}
                    </span>
                    <span className="text-xs text-muted font-bold opacity-60">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>

                  <div
                    className={`relative px-6 py-4 rounded-2xl shadow-xl ${
                      msg.role === "user"
                        ? "bg-gradient-to-br from-blue-600 to-blue-500 text-white rounded-tr-sm border border-blue-400/20 shadow-blue-500/20"
                        : "glass border border-white/10 text-foreground rounded-tl-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="chat-markdown prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-black/30 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl prose-code:text-blue-400 prose-strong:text-white prose-headings:text-white">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap leading-relaxed font-medium">
                        {msg.content}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div
                      className={`absolute ${
                        msg.role === "user" ? "-left-12" : "-right-12"
                      } top-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all`}
                    >
                      <button
                        onClick={() => copyToClipboard(msg.id, msg.content)}
                        className="p-2 rounded-lg glass border border-white/10 text-muted hover:text-white hover:border-white/20 transition-all hover:scale-110"
                        title="复制"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      {msg.role === "assistant" && (
                        <>
                          <button
                            onClick={() => handleFeedback(msg.id, "up")}
                            className={`p-2 rounded-lg glass border transition-all hover:scale-110 ${
                              msg.feedback === "up"
                                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                                : "border-white/10 text-muted hover:text-emerald-400 hover:border-emerald-500/20"
                            }`}
                            title="有帮助"
                          >
                            <ThumbsUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleFeedback(msg.id, "down")}
                            className={`p-2 rounded-lg glass border transition-all hover:scale-110 ${
                              msg.feedback === "down"
                                ? "border-red-500/40 text-red-400 bg-red-500/10"
                                : "border-white/10 text-muted hover:text-red-400 hover:border-red-500/20"
                            }`}
                            title="无帮助"
                          >
                            <ThumbsDown className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="w-10 h-10 rounded-xl glass border border-white/10 flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/10">
                  <Bot className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-black text-white px-1 tracking-tight">
                    Nexus AI
                  </span>
                  <div className="px-6 py-4 rounded-2xl rounded-tl-sm glass border border-white/10 flex items-center gap-3 shadow-xl">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                    <span className="text-sm text-muted font-bold">正在思考中...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-8" />
          </div>
        )}
      </main>

      {/* Input Area */}
      <footer className="relative flex-shrink-0 px-4 pb-6 pt-4 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="relative flex items-end gap-3 p-3 rounded-2xl glass border border-white/10 shadow-2xl focus-within:border-blue-500/50 focus-within:shadow-blue-500/20 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="输入您的问题... (Shift + Enter 换行)"
              className="flex-1 bg-transparent px-4 py-3 text-[15px] text-white placeholder-muted focus:outline-none resize-none min-h-[52px] max-h-[200px] font-medium"
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="mb-1 p-3 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 hover:scale-105 disabled:hover:scale-100 border border-blue-400/20"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[11px] text-muted text-center mt-3 opacity-60 font-bold">
            Nexus AI 可能会产生错误信息，请核实重要信息
          </p>
        </div>
      </footer>

      <style jsx global>{`
        .chat-markdown {
          font-size: 15px;
          line-height: 1.7;
        }
        .chat-markdown p {
          margin-bottom: 1em;
        }
        .chat-markdown p:last-child {
          margin-bottom: 0;
        }
        .chat-markdown ul,
        .chat-markdown ol {
          margin: 1em 0;
          padding-left: 1.5em;
        }
        .chat-markdown li {
          margin: 0.5em 0;
        }
        .chat-markdown code {
          background: rgba(255, 255, 255, 0.05);
          padding: 0.2em 0.4em;
          border-radius: 0.375rem;
          font-size: 0.9em;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .chat-markdown pre {
          margin: 1em 0;
          padding: 1em;
          overflow-x: auto;
        }
        .chat-markdown pre code {
          background: transparent;
          padding: 0;
          border: none;
        }
        .chat-markdown strong {
          font-weight: 700;
        }
        .chat-markdown h1,
        .chat-markdown h2,
        .chat-markdown h3 {
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          font-weight: 700;
        }
        .chat-markdown h1 {
          font-size: 1.5em;
        }
        .chat-markdown h2 {
          font-size: 1.3em;
        }
        .chat-markdown h3 {
          font-size: 1.1em;
        }
      `}</style>
    </div>
  );
}
