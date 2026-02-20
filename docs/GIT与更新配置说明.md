# Git 倉庫與客戶端更新配置說明

> **相關文檔：**
> - [數據庫啟動指南](./数据库启动指南.md) - TimescaleDB 啟動與管理
> - [桌面應用發布流程](../packages/desktop/RELEASE.md) - 版本發布詳細步驟

## 一、在您的 Git 服務器上新建代碼倉庫（您本人操作）

**我无法代您登录任何网站或使用您的账号密码。** 请按下面步骤在您自己的 Git 上建仓：

1. 打开浏览器，访问你的 Git 托管地址（如 **https://github.com** 或自建 Git 服务）
2. 使用您的账号登录：
   - 用户名：`wangqi`
   - 密码：（在 Git 服务后台设置或使用 Access Token）
3. 在页面上找到「新建仓库」/「New Repository」：
   - 仓库名称建议：`dapp` 或 `profit-layer`
   - 可见性按需选择（私有/公开）
   - 若需要，可勾选「使用 README 初始化」
4. 创建完成后，记下仓库的 **克隆地址**（如 `https://github.com/your-org/profit-layer.git`），用于本地推送。

### 本地推送到该 Git

```bash
# 若尚未初始化 git
git init
git remote add origin https://github.com/your-org/profit-layer.git

# 推送（首次可能需输入你的 Git 用户名与密码或 Token）
git add .
git commit -m "Initial commit"
git push -u origin main
```

---

## 二、客户端如何收到更新提示并点击确认升级

桌面端已配置为从你指定的 **更新服务器 URL**（如 `https://your-domain.com/updates`）检查更新（Generic 方式）。流程是：

1. **您发布新版本**：本地改版本号 → 打包 → 把安装包和 `latest.yml` 放到服务器上的 `updates` 目录。
2. **客户端的更新流程**：
   - 客户端定期请求 `你的更新URL/latest.yml`（Windows）或 `latest-mac.yml`（Mac）。
   - 若发现版本号高于当前安装的版本，会**自动下载**新安装包。
   - 下载完成后弹出提示：「更新已就绪，是否现在重启应用以完成更新？」。
   - 客户点击「**立即重启**」即完成升级；选「稍后」则下次启动时再装。

### 您这边需要做的：提供「更新下载地址」

客户端要能收到更新，必须在 **你的更新服务器** 上提供可访问的更新文件。有两种常见做法：

**方式 A：用同一台机上的静态文件服务（推荐）**

1. 在你的更新服务器上建一个目录，例如：`/var/www/updates/`（或您任意路径）。
2. 每次发新版本时，把打包产物复制进去：
   - 从本机 `packages/desktop/dist/` 里复制：
     - `latest.yml`（Windows 用）
     - `latest-mac.yml`、`latest-mac-arm64.yml`（Mac 用）
     - `ProfitLayer Setup x.x.x.exe`（Windows 安装包）
     - `ProfitLayer-x.x.x.dmg`、`ProfitLayer-x.x.x-arm64.dmg`（Mac 安装包）
   - 放到服务器的 `/var/www/updates/`。
3. 用 Nginx（或其它 Web 服务）把该目录对外暴露为你的更新 URL（例如 `https://your-domain.com/updates/`，访问 `https://your-domain.com/updates/latest.yml` 能下载到文件）。

**方式 B：用 Git 服务器上的「Releases / 附件」**

若你的 Git 服务是 Gitea/GitLab 等，一般会有「发布 / Release」功能，可以上传附件。但 Generic 更新需要**固定 URL 目录**（例如始终是 `.../updates/latest.yml`），而 Release 的下载链接往往带版本号路径，不能直接当 Generic 用。因此更稳妥的是用方式 A：单独一个静态目录做更新下载。

配置好后，只要你的更新 URL 下的 `latest.yml`（及对应安装包）可访问，客户端的「检查更新 → 下载 → 弹窗 → 点击确认重启」就会按上面流程工作。

---

## 三、客户安装后数据不丢失（本地缓存 / 账户机制）

客户端已做**本地持久化**，数据存在系统「用户数据目录」里，**应用升级不会删这些数据**（只有卸载才会清掉）。

- **保存内容**：
  - 服务地址（如您改过 Dashboard 的 URL）
  - 窗口大小、位置
  - 本地账户信息（如 `localAccount.id`、`localAccount.name`，供后续扩展「账户机制」）
- **存储位置**（由 Electron 管理，无需客户操作）：
  - Windows：`%APPDATA%/profit-layer-desktop/` 下的 `settings.json`
  - macOS：`~/Library/Application Support/profit-layer-desktop/` 下的 `settings.json`

因此：**每次更新只会替换程序文件，不会覆盖上述目录**，客户已有的设置和本地账户数据会保留。

### 在网页里读写这些设置（可选）

若 Dashboard 页面需要读/写「服务地址、本地账户」等，可在页面里判断是否在桌面客户端里运行，然后调用：

- `window.desktop.getSettings()`：获取当前设置（含 `dashboardUrl`、`windowBounds`、`localAccount` 等）。
- `window.desktop.setSettings({ ... })`：保存设置（合并到现有设置，不会丢其它项）。

这样即可在您的前端实现「设置页改服务地址、本地账户名」等，且这些都会持久化，升级后仍然存在。

---

## 四、配置汇总

| 项目 | 说明 |
|------|------|
| 更新检查地址 | 在 `packages/desktop/package.json` 的 `build.publish.url` 中配置你的更新服务器 |
| 修改更新地址 | 改 `build.publish.url` 或环境变量 `UPDATE_BASE_URL` |
| 本地数据目录 | 由 Electron 的 `app.getPath('userData')` 决定，见上表 |
| 建 Git 仓、登录 | 需您本人在 GitHub / 自建 Git 服务登录并新建仓库 |

完成「建仓 + 推送代码」和「在更新服务器上提供 updates 目录」后，您本地开发推送到 Git，再按上述流程发布安装包到 `updates`，客户那边就会收到更新提示，并可通过「确认升级」完成更新；客户的数据与设置会通过 userData 持久化，不会因升级而丢失。
