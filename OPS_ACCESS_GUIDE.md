# 🚀 运维控制台访问指南

## 当前状态
由于 Dashboard 服务启动存在问题，我们提供了替代方案来访问运维控制台。

## ✅ 解决方案一：静态页面访问（推荐）

**访问地址**: [http://127.0.0.1:3005/ops](http://127.0.0.1:3005/ops)

### 启动步骤：
```bash
# 1. 打开终端
# 2. 执行以下命令：
cd /Users/wangqi/Documents/ai/dapp
node -e "require('http').createServer((req,res)=>{if(req.url=='/'||req.url=='/ops'){res.writeHead(200,{'Content-Type':'text/html'});require('fs').createReadStream('./ops.html').pipe(res)}}).listen(3005,()=>console.log('访问: http://127.0.0.1:3005/ops'))"
```

### 功能说明：
- 🔧 系统状态监控
- 📊 数据库连接状态
- ▶️ 扫描器控制
- 🔄 数据刷新
- 🛠️ 系统诊断

## ✅ 解决方案二：使用现有 Dashboard（如果能启动）

```bash
cd /Users/wangqi/Documents/ai/dapp/packages/dashboard
pnpm dev
# 然后访问 http://localhost:3002/ops
```

## ✅ 解决方案三：Docker 启动

```bash
cd /Users/wangqi/Documents/ai/dapp
docker-compose up -d dashboard
# 访问 http://localhost:3002/ops
```

## 系统信息概览

| 项目 | 状态 |
|------|------|
| 钱包地址 | 0x41f7...6677 |
| 可用资金 | $500+ |
| 池子数据 | 已填充 |
| 持仓数量 | 0 (待投资) |
| 扫描器 | 待启动 |

## 故障排除

如果以上方案都无法访问，请检查：
1. 端口是否被占用：`lsof -i :3005`
2. Node.js 是否安装：`node --version`
3. 防火墙设置
4. 系统资源限制

## 紧急联系方式

如有紧急问题，请通过以下方式联系：
- Telegram: @profitlayer_support
- Email: support@profitlayer.example

---
*最后更新: 2026-02-14*
