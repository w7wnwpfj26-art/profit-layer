"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, BarChart3 } from "lucide-react";
import { apiFetch } from "../lib/api";

interface TrendData {
  hour: string;
  severity: string;
  count: number;
}

interface ChartData {
  time: string;
  critical: number;
  warning: number;
  info: number;
}

interface Props {
  hours?: number;
}

export function AlertTrendChart({ hours = 24 }: Props) {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<"line" | "bar">("line");

  useEffect(() => {
    loadTrendData();
  }, [hours]);

  const loadTrendData = async () => {
    setLoading(true);
    const result = await apiFetch<{ trend: TrendData[] }>(`/api/alerts?action=trend&hours=${hours}`);
    if (result.ok) {
      // 转换数据格式
      const grouped = new Map<string, ChartData>();

      result.data.trend.forEach((item) => {
        const time = new Date(item.hour).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
        });

        if (!grouped.has(time)) {
          grouped.set(time, { time, critical: 0, warning: 0, info: 0 });
        }

        const entry = grouped.get(time)!;
        if (item.severity === "critical") entry.critical += item.count;
        else if (item.severity === "warning") entry.warning += item.count;
        else if (item.severity === "info") entry.info += item.count;
      });

      setData(Array.from(grouped.values()).reverse());
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="glass p-6 rounded-2xl border-white/5 animate-pulse">
        <div className="h-64 bg-white/5 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="glass p-6 rounded-2xl border-white/5">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-accent" />
          <h3 className="text-lg font-bold text-white">告警趋势</h3>
          <span className="text-xs text-muted">最近 {hours} 小时</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChartType("line")}
            className={`p-2 rounded-lg transition-all ${
              chartType === "line" ? "bg-accent text-white" : "bg-white/5 text-muted hover:bg-white/10"
            }`}
            title="折线图"
          >
            <TrendingUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => setChartType("bar")}
            className={`p-2 rounded-lg transition-all ${
              chartType === "bar" ? "bg-accent text-white" : "bg-white/5 text-muted hover:bg-white/10"
            }`}
            title="柱状图"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-muted">
          <p>暂无数据</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          {chartType === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.5)" style={{ fontSize: "12px" }} />
              <YAxis stroke="rgba(255,255,255,0.5)" style={{ fontSize: "12px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Legend wrapperStyle={{ color: "#fff" }} />
              <Line type="monotone" dataKey="critical" stroke="#ef4444" strokeWidth={2} name="紧急" />
              <Line type="monotone" dataKey="warning" stroke="#f59e0b" strokeWidth={2} name="警告" />
              <Line type="monotone" dataKey="info" stroke="#3b82f6" strokeWidth={2} name="信息" />
            </LineChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.5)" style={{ fontSize: "12px" }} />
              <YAxis stroke="rgba(255,255,255,0.5)" style={{ fontSize: "12px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Legend wrapperStyle={{ color: "#fff" }} />
              <Bar dataKey="critical" fill="#ef4444" name="紧急" />
              <Bar dataKey="warning" fill="#f59e0b" name="警告" />
              <Bar dataKey="info" fill="#3b82f6" name="信息" />
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}
