# 接下来的操作步骤

> 自动化操作进度：Git 推送 ✅ | Nginx 配置 ⏳ | 应用打包 ⏳

## 📌 当前状态

### ✅ 已完成
1. **代码已推送到 Git**
   - 仓库：请配置为你的 GitHub 或自建 Git 地址
   - 提交：feat: 添加桌面应用、数据库启动脚本和完整文档体系

2. **数据库已启动**
   - 地址：localhost:5433
   - 数据：6124 个池子、257 个协议

3. **Nginx 配置已生成**
   - 文件：nginx-updates.conf（在项目根目录）

### ⏳ 进行中
- **Mac 应用打包**：正在运行 `pnpm build:mac`
  - 预计需要 3-5 分钟
  - 完成后会在 `packages/desktop/dist/` 生成安装包

---

## 🚀 待办步骤

### 步骤 1：配置 Nginx（需要你操作）⭐

打开终端，执行：

```bash
cd /Users/wangqi/Documents/ai/dapp

# 上传配置文件（会要求输入服务器密码）
scp nginx-updates.conf root@YOUR_UPDATE_SERVER:/etc/nginx/conf.d/defi-updates.conf

# SSH 到服务器配置（会要求输入密码）
ssh root@YOUR_UPDATE_SERVER

# 在服务器上执行：
mkdir -p /var/www/updates
nginx -t              # 测试配置
nginx -s reload       # 重载 Nginx
exit                  # 退出服务器

# 验证配置
curl -I https://YOUR_UPDATE_SERVER/updates/
# 应该返回 404（目录为空）或 403，而不是连接失败
```

---

### 步骤 2：等待打包完成

在当前终端查看打包进度：

```bash
# 如果打包进程还在运行，等待完成
# 完成后会显示类似：
# • building        target=macOS 12.0.0+ file=dist/DeFi Yield-0.1.0.dmg

# 检查生成的文件
cd /Users/wangqi/Documents/ai/dapp/packages/desktop
ls -lh dist/
```

**预期文件：**
- `latest-mac.yml` - Mac x64 更新配置
- `latest-mac-arm64.yml` - Mac ARM64 更新配置
- `Nexus Yield-0.1.0.dmg` - Mac x64 安装包
- `Nexus Yield-0.1.0-arm64.dmg` - Mac ARM64 安装包

---

### 步骤 3：部署更新包到服务器

打包完成后执行：

```bash
cd /Users/wangqi/Documents/ai/dapp
bash scripts/deploy-update.sh
```

脚本会：
1. 检查本地打包文件
2. 显示文件列表
3. 确认后上传到服务器
4. 验证远程文件

**注意：** 会要求输入服务器密码

---

### 步骤 4：验证更新系统

```bash
# 1. 测试更新配置文件
curl https://YOUR_UPDATE_SERVER/updates/latest-mac.yml

# 应该看到类似内容：
# version: 0.1.0
# files:
#   - url: DeFi Yield-0.1.0.dmg
#     ...

# 2. 测试安装包下载（仅测试 HEAD，不下载）
curl -I https://YOUR_UPDATE_SERVER/updates/Nexus%20Yield-0.1.0.dmg

# 应该返回 HTTP 200 OK
```

---

### 步骤 5：测试客户端更新

#### 方式 A：安装并测试

```bash
# 1. 安装应用
cd /Users/wangqi/Documents/ai/dapp/packages/desktop
open dist/DeFi\ Yield-0.1.0.dmg
# 拖动到 Applications 文件夹安装

# 2. 启动应用
# 从 Launchpad 或 Applications 启动 Nexus Yield

# 3. 等待更新检查
# - 应用启动后 5 秒会自动检查更新
# - 如果有新版本会提示下载
```

#### 方式 B：模拟升级流程

```bash
# 1. 修改版本号
cd /Users/wangqi/Documents/ai/dapp/packages/desktop
# 编辑 package.json，将 version 改为 "0.1.1"

# 2. 重新打包
pnpm build:mac

# 3. 部署新版本
cd ../..
bash scripts/deploy-update.sh

# 4. 启动旧版本应用
# 应该在 5 秒或 1 小时内收到更新提示
```

---

## 📚 相关命令参考

### 数据库管理

```bash
# 启动数据库
bash scripts/start-database.sh

# 检查数据库
bash scripts/check-database.sh

# 查看日志
docker compose logs -f timescaledb

# 进入数据库命令行
docker compose exec timescaledb psql -U defi -d defi_yield
```

### Dashboard 开发

```bash
cd packages/dashboard
pnpm dev
# 访问 http://localhost:3002
```

### 桌面应用开发

```bash
cd packages/desktop

# 开发模式
pnpm start

# 打包
pnpm build:mac      # 仅 Mac
pnpm build:win      # 仅 Windows
pnpm build:all      # 全部
```

---

## ❓ 故障排查

### Nginx 配置失败

```bash
# 查看 Nginx 错误日志
ssh root@YOUR_UPDATE_SERVER
tail -f /var/log/nginx/error.log

# 检查端口占用
netstat -tlnp | grep 443
```

### 更新检测不到

```bash
# 1. 确认更新 URL 可访问
curl -I https://YOUR_UPDATE_SERVER/updates/latest-mac.yml

# 2. 检查应用配置
# 在 packages/desktop/package.json 中确认：
# "publish": {
#   "provider": "generic",
#   "url": "https://YOUR_UPDATE_SERVER/updates"
# }

# 3. 查看应用日志
# 启动桌面应用时在终端运行查看日志
```

### 打包失败

```bash
# 清理缓存重试
cd packages/desktop
rm -rf dist node_modules
pnpm install
pnpm build:mac
```

---

## 📞 获取帮助

- 📖 [快速开始](docs/快速开始.md)
- 💾 [数据库启动指南](docs/数据库启动指南.md)
- 🔄 [Git 与更新配置](docs/GIT与更新配置说明.md)
- 📦 [桌面应用发布流程](packages/desktop/RELEASE.md)

---

**创建时间：** 2026-02-07  
**当前任务：** 等待 Mac 应用打包完成 → 配置 Nginx → 部署更新
