# 后端改动建议清单 (Back-end Requirements)

前端已完成赛博朋克深色系、玻璃拟态与严格错误处理的重构，以下为配套后端优化建议。

---

## 1. 统一错误响应规范 (P0)

**现状**：部分 API 在异常时返回非 JSON 或直接超时。

**建议**：所有 `/api/*` 在发生错误时返回 4xx/5xx，并包含标准 JSON：

```json
{
  "ok": false,
  "error": "明确的错误原因（例如：API Key 无效）",
  "code": "AUTH_ERROR"
}
```

前端已使用 `app/lib/api.ts` 的 `apiFetch` 解析 `error` 与 `code`，统一展示给用户。

---

## 2. 配置项后端校验逻辑 (P0)

**现状**：`POST /api/settings` 仅做透传更新。

**建议**：保存前进行校验：

| 配置 key | 校验规则 |
|----------|----------|
| `deepseek_api_key` | 前缀 `sk-`，最小长度 20 |
| `stop_loss_pct` | 数值范围 [0, 100] |
| `total_capital_usd` | 非负数 |
| `max_single_tx_usd` / `max_daily_tx_usd` | 非负数 |
| `wallet_address` / `evm_wallet_address` 等 | 合法 EVM/Solana/Aptos 地址格式 |

校验失败时返回 `400` 及上述标准错误 JSON。

---

## 3. 敏感数据脱敏处理 (P1)

**现状**：`GET /api/settings` 返回明文 API Key。

**建议**：GET 返回脱敏值，例如 `sk-v...3f9`。仅在用户“编辑”后通过 POST 提交时再处理完整 Key 并更新。

---

## 4. 提供更多实时性数据 (P1)

- **收益**：在 `/api/positions` 中增加 `roi_percentage` 等字段，减轻前端计算。
- **心跳**：提供轻量级 `GET /api/health`（如 `{ ok: true, ts: number }`），用于前端“系统负载 / 节点在线”状态判断。

---

## 5. 增强日志审计 (P2)

在 `POST /api/strategies`（启动/停止策略）等关键操作时，记录审计日志：操作人 IP、操作时间、结果。对 DeFi 自动化系统至关重要。

---

*文档由前端重构时整理，便于后端按优先级落地。*
