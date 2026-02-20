# 桌面應用發布流程

本文檔說明如何發布新版本的 DeFi 桌面應用並讓現有客戶端收到更新。

## 快速發布（3 步驟）

```bash
# 1. 修改版本號並打包
cd packages/desktop
npm version patch  # 或 minor / major
npm run build

# 2. 部署到更新服務器
cd ../..
bash scripts/deploy-update.sh

# 3. （可選）驗證更新
curl -I https://YOUR_UPDATE_SERVER/updates/latest.yml
```

## 詳細步驟

### 1. 準備發布

#### 1.1 更新版本號

```bash
cd packages/desktop

# 根據變更類型選擇：
npm version patch   # 0.1.0 → 0.1.1 (bug 修復)
npm version minor   # 0.1.0 → 0.2.0 (新功能)
npm version major   # 0.1.0 → 1.0.0 (重大變更)
```

#### 1.2 更新 CHANGELOG（可選）

在 `packages/desktop/CHANGELOG.md` 中記錄本次更新內容：

```markdown
## [0.1.1] - 2026-02-07
### Added
- 新增本地賬戶持久化功能
### Fixed
- 修復窗口大小未保存的問題
```

#### 1.3 提交變更

```bash
git add .
git commit -m "chore: bump version to 0.1.1"
git push origin main
```

### 2. 打包應用

#### 2.1 全平台打包

```bash
cd packages/desktop

# 打包所有平台（需要在 Mac 上運行以打包 Mac 版本）
npm run build:all

# 或分別打包：
npm run build:win    # 僅 Windows
npm run build:mac    # 僅 macOS
```

#### 2.2 檢查產物

打包完成後，在 `packages/desktop/dist/` 目錄下會生成：

```
dist/
├── latest.yml                          # Windows 更新配置
├── latest-mac.yml                      # macOS x64 更新配置
├── latest-mac-arm64.yml                # macOS arm64 更新配置
├── Nexus Yield Setup 0.1.1.exe      # Windows 安裝包
├── Nexus Yield-0.1.1.dmg             # macOS x64 安裝包
└── Nexus Yield-0.1.1-arm64.dmg       # macOS arm64 安裝包
```

### 3. 部署更新

#### 3.1 使用部署腳本（推薦）

```bash
cd ../..  # 回到項目根目錄
bash scripts/deploy-update.sh
```

腳本會：
- ✅ 檢查本地打包文件
- ✅ 顯示將要上傳的文件列表
- ✅ 確認後上傳到服務器
- ✅ 驗證遠程文件

#### 3.2 手動部署

如果不使用腳本，可以手動上傳：

```bash
# 創建遠程目錄
ssh root@YOUR_UPDATE_SERVER "mkdir -p /var/www/updates"

# 上傳文件
scp packages/desktop/dist/*.yml \
    packages/desktop/dist/*.exe \
    packages/desktop/dist/*.dmg \
    root@YOUR_UPDATE_SERVER:/var/www/updates/
```

### 4. 驗證部署

#### 4.1 檢查文件可訪問性

```bash
# 測試 Windows 更新配置
curl -I https://YOUR_UPDATE_SERVER/updates/latest.yml

# 測試 macOS 更新配置
curl -I https://YOUR_UPDATE_SERVER/updates/latest-mac.yml

# 應該返回 HTTP 200 OK
```

#### 4.2 查看更新配置內容

```bash
curl https://YOUR_UPDATE_SERVER/updates/latest.yml
```

應該看到類似：

```yaml
version: 0.1.1
files:
  - url: Nexus Yield Setup 0.1.1.exe
    sha512: ...
    size: ...
path: Nexus Yield Setup 0.1.1.exe
sha512: ...
releaseDate: 2026-02-07T...
```

### 5. 客戶端更新流程

#### 5.1 自動更新時間線

| 時間點 | 動作 |
|--------|------|
| 應用啟動後 5 秒 | 執行第一次更新檢查 |
| 每 1 小時 | 自動檢查更新 |
| 發現新版本 | 後台下載，顯示「正在下載」提示 |
| 下載完成 | 彈窗「更新已就緒，是否重啟？」 |
| 用戶點擊「立即重啟」 | 安裝更新並重啟應用 |
| 用戶點擊「稍後」 | 下次啟動時自動安裝 |

#### 5.2 用戶體驗

1. **發現更新**
   ```
   ┌─────────────────────────────┐
   │     發現新版本              │
   │                             │
   │  正在後台下載，完成後將     │
   │  提示您重啟應用以完成更新。 │
   │                             │
   │         [ 確定 ]            │
   └─────────────────────────────┘
   ```

2. **下載完成**
   ```
   ┌─────────────────────────────┐
   │     更新已就緒              │
   │                             │
   │  是否現在重啟應用以完成     │
   │  更新？                     │
   │                             │
   │  [ 立即重啟 ]  [ 稍後 ]    │
   └─────────────────────────────┘
   ```

3. **保持數據**
   - ✅ 用戶設置保留（窗口大小、位置）
   - ✅ 服務地址保留
   - ✅ 本地賬戶信息保留

## 故障排查

### 問題 1：客戶端檢測不到更新

**檢查清單：**

1. 確認更新文件可訪問：
   ```bash
   curl https://YOUR_UPDATE_SERVER/updates/latest.yml
   ```

2. 檢查版本號是否更新：
   ```bash
   grep version packages/desktop/package.json
   ```

3. 查看客戶端日誌（開發模式）：
   ```bash
   # 在客戶端控制台查看自動更新日誌
   ```

### 問題 2：下載失敗

**可能原因：**

- 安裝包文件未上傳或路徑錯誤
- 服務器帶寬限制
- 客戶端網絡問題

**解決方案：**

```bash
# 確認安裝包存在
ssh root@YOUR_UPDATE_SERVER "ls -lh /var/www/updates/"

# 測試下載速度
curl -o /tmp/test.exe "https://YOUR_UPDATE_SERVER/updates/Nexus%20Yield%20Setup%200.1.1.exe"
```

### 問題 3：更新後數據丟失

**說明：**

正常更新不會清除數據。數據丟失可能因為：
- 用戶執行了「卸載」操作
- 用戶手動刪除了數據目錄

**數據位置：**

- Windows: `%APPDATA%/defi-yield-desktop/settings.json`
- macOS: `~/Library/Application Support/defi-yield-desktop/settings.json`

## 版本策略建議

| 版本類型 | 說明 | 示例 |
|----------|------|------|
| Patch (0.0.x) | Bug 修復、小改進 | 0.1.0 → 0.1.1 |
| Minor (0.x.0) | 新功能、向後兼容 | 0.1.0 → 0.2.0 |
| Major (x.0.0) | 重大變更、可能不兼容 | 0.9.0 → 1.0.0 |

## 安全注意事項

1. **代碼簽名**（生產環境推薦）
   - macOS 需要 Apple Developer 證書
   - Windows 需要 Code Signing 證書

2. **HTTPS**（生產環境必須）
   - 當前使用 HTTP 僅用於開發
   - 正式環境應配置 SSL 證書

3. **訪問控制**
   - 考慮為 `/updates/` 目錄添加基本認證
   - 或使用 Token 驗證

## 相關文檔

- [Git 與更新配置說明](../../docs/GIT与更新配置说明.md)
- [Electron Builder 文檔](https://www.electron.build/)
- [electron-updater 文檔](https://www.electron.build/auto-update)
