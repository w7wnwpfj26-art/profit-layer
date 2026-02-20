# API 接口文档

## 基础信息
- 基础地址: `http://localhost:3002/api`
- 认证方式: `Authorization: Bearer <token>`
- 响应格式: JSON

---

## 认证 `/api/auth`

### POST - 登录/注册
```json
// 登录
{ "action": "login", "username": "admin", "password": "xxx" }
// 注册
{ "action": "register", "username": "new", "password": "xxx" }
// 响应
{ "token": "xxx.xxx", "username": "admin", "userId": 1, "role": "admin" }
```

### GET - 验证 Token
Header: `Authorization: Bearer <token>`
```json
{ "userId": 1, "username": "admin" }
```

---

## 仪表盘 `/api/stats`
### GET - 全局统计
```json
{
  "lastUpdated": "2026-02-07T...",
  "dataAgeSec": 120,
  "overview": { "totalPools": 6000, "totalProtocols": 250, "totalChains": 9, "totalTvlUsd": 12400000000, "avgApr": 15.2, "medianApr": 8.5, "avgHealthScore": 62.3, "healthyPoolsCount": 3500 },
  "chainAllocation": [{ "chain": "ethereum", "poolCount": 1200, "tvlUsd": 5000000000, "avgApr": 12.5 }],
  "topProtocols": [{ "protocolId": "aave-v3", "poolCount": 50, "tvlUsd": 2000000000 }],
  "topPools": [{ "poolId": "xxx", "protocolId": "aave-v3", "chain": "ethereum", "symbol": "USDC-ETH", "aprTotal": 25.3, "tvlUsd": 500000000, "volume24hUsd": 10000000, "healthScore": 78 }]
}
```

---

## 资金池 `/api/pools`
### GET - 查询池子
参数: `?sort=apr|tvl|health&chain=ethereum&search=usdc&limit=100&minTvl=100000&minHealth=60`

---

## 持仓 `/api/positions`
### GET - 活跃持仓 + 最近交易

---

## 策略 `/api/strategies`
### GET - 策略列表 + AutoPilot 状态
### POST - 启停策略
```json
{ "strategyId": "yield_farming_v1", "isActive": true }
```

---

## 系统设置 `/api/settings`
### GET - 所有配置项
### POST - 批量更新
```json
{ "configs": [{ "key": "stop_loss_pct", "value": "15" }] }
```

---

## 钱包 `/api/wallet`
### GET - 已连接钱包地址
### POST - 连接/断开钱包
```json
{ "chainType": "evm", "address": "0x...", "action": "connect" }
```

---

## AI 顾问 `/api/ai`
### GET `/api/ai/analyze` - AI 市场分析（自动收集 DB 数据）
### GET `/api/ai/status` - AI 连接状态
### GET `/api/ai/test` - 测试 AI 连接

---

## 通知 `/api/notifications`
### GET - 历史告警 `?limit=50&severity=error`
### POST - 发送告警
```json
{ "severity": "warning", "source": "executor", "message": "交易失败" }
```
