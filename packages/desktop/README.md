# Nexus Yield - 桌面客户端

Electron 桌面端，默认加载本地 Dashboard（`http://localhost:3002`）。支持 Windows / macOS 打包，并通过 **自建更新服务（Generic）** 或 GitHub Releases 实现安装用户自动更新。**客户端的设置与本地账户数据保存在 userData，应用更新不会丢失。**

## 开发

1. 先启动本地服务（二选一）：
   - 在项目根目录执行：`pnpm dashboard`
   - 或 `docker-compose up` 启动完整栈
2. 再启动桌面客户端：
   ```bash
   pnpm desktop
   # 或进入本目录
   cd packages/desktop && pnpm start
   ```
   客户端会打开窗口并访问 `http://localhost:3002`。

## 打包 Win / Mac

在项目根目录：

```bash
# 安装依赖（含 desktop）
pnpm install

# 仅打 Windows 安装包（输出在 packages/desktop/dist）
pnpm build:desktop:win

# 仅打 macOS 安装包（x64 + arm64）
pnpm build:desktop:mac

# 同时打 Win + Mac
pnpm build:desktop
```

- **Windows**：`dist/Nexus Yield Setup x.x.x.exe`（NSIS 安装程序）
- **macOS**：`dist/Nexus Yield-x.x.x.dmg`（及 .arm64.dmg）

## 自动更新（Generic 自建 / GitHub）

当前使用 **Generic** 方式检查更新。请在 `package.json` 的 `build.publish.url` 中配置你的更新服务器地址（如 `https://your-domain.com/updates`），并在该地址提供 `latest.yml`（Windows）和 `latest-mac.yml` 及对应安装包，客户端即可收到更新提示。

- **Generic**：在 `package.json` 的 `build.publish` 中配置 `provider: "generic"`, `url: "https://your-update-server.com/updates"`。发版时把 `dist/` 下的 `latest.yml`、`latest-mac.yml` 和安装包上传到该 URL 对应目录即可。
- **GitHub**：若改用 GitHub Releases，将 `build.publish` 改为 `provider: "github"`, `owner`, `repo`，并可用 `GH_TOKEN` 执行 `pnpm run release` 上传。

详见项目根目录 **`docs/GIT与更新配置说明.md`**（含：如何在您的 Git 上建仓、如何部署 updates 目录、客户如何收到更新及确认升级）。

## 本地数据不丢失（缓存 / 账户）

设置与本地账户信息保存在系统 **userData** 目录（Electron 管理），**应用升级不会清除**，只有卸载才会删除：

- 保存内容：服务地址（Dashboard URL）、窗口大小与位置、本地账户（`localAccount`）。
- 页面中可通过 `window.desktop.getSettings()` / `window.desktop.setSettings({ ... })` 读写（仅在桌面客户端内可用）。

## 环境变量

| 变量 | 说明 |
|------|------|
| `DASHBOARD_URL` | 默认连接地址，如 `http://localhost:3002` |
| `UPDATE_BASE_URL` | Generic 更新根地址（若不用 package.json 中的 url） |
| `UPDATE_PROVIDER` | `generic` 或 `github` |

## 注意事项

- 桌面端是「窗口壳」：只负责打开并显示 Dashboard 页面，数据由本机或您配置的后端提供。
- 使用 Generic 更新前，请确保 `build.publish.url` 所指目录可访问，且包含 `latest.yml` 与安装包。
- macOS 打包若需公证，需在 Apple 开发者后台配置证书与 notarize 选项。
