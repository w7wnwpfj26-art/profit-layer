# 📸 ProfitLayer 宣传素材使用指南

## 🎨 已创建的宣传素材

我已经为你创建了3个专业的HTML宣传页面，可以直接在浏览器中截图使用：

### 1. 主宣传图 (1920x1080)
**文件**: `promo/banner.html`  
**用途**: GitHub README顶部横幅、博客文章配图、LinkedIn分享  
**尺寸**: 1920 x 1080 px (Full HD)

**特点**:
- ✅ 渐变背景 + 发光效果
- ✅ 4个核心功能展示
- ✅ GitHub链接 + MIT License标识
- ✅ 动画效果（浮动Logo）

### 2. 截图展示 (1920x1080)
**文件**: `promo/screenshots.html`  
**用途**: 功能演示、Product Hunt、Hacker News配图  
**尺寸**: 1920 x 1080 px (Full HD)

**特点**:
- ✅ 3张产品截图并排展示
- ✅ 自动加载现有截图（pools, positions, wallet）
- ✅ Hover悬停效果
- ✅ 专业卡片设计

### 3. Twitter/X 卡片 (1200x628)
**文件**: `promo/twitter-card.html`  
**用途**: Twitter/X 分享、GitHub Social Preview  
**尺寸**: 1200 x 628 px (Twitter推荐尺寸)

**特点**:
- ✅ 简洁明快，适合社交媒体
- ✅ 4个特性标签
- ✅ 突出GitHub链接

---

## 📷 如何截图

### 方法1: macOS 系统截图（推荐）

1. **打开HTML文件**：
   - banner.html 已经在浏览器中打开了
   - screenshots.html 也已经打开了

2. **全窗口截图**：
   ```bash
   # 按快捷键截取整个浏览器窗口
   Cmd + Shift + 4，然后按 Space，点击浏览器窗口
   ```

3. **保存位置**：
   - macOS会自动保存到桌面
   - 文件名类似：`Screenshot 2026-02-20 at 14.50.00.png`

### 方法2: Chrome DevTools（精确尺寸）

1. **打开开发者工具**: `Cmd + Option + I`

2. **切换设备模式**: `Cmd + Shift + M`

3. **设置自定义尺寸**:
   - banner.html: 设置为 `1920 x 1080`
   - screenshots.html: 设置为 `1920 x 1080`
   - twitter-card.html: 设置为 `1200 x 628`

4. **截图**:
   - 打开命令面板: `Cmd + Shift + P`
   - 输入: `Capture screenshot`
   - 选择: `Capture full size screenshot`

### 方法3: Firefox 内置截图

1. **打开HTML文件**
2. **右键点击页面** → 选择 `Take a Screenshot`
3. **选择 `Save full page`** 或手动选择区域

---

## 🎯 推荐文件命名

截图后，建议重命名为：

```bash
# 主宣传图
profitlayer-banner.png

# 截图展示
profitlayer-screenshots.png

# Twitter卡片
profitlayer-twitter-card.png

# GitHub社交预览（使用banner，调整为1280x640）
profitlayer-github-preview.png
```

---

## 📍 使用场景

### GitHub 仓库
```markdown
# 在 README.md 顶部添加
<div align="center">
  <img src="./assets/profitlayer-banner.png" alt="ProfitLayer Banner" width="100%"/>
</div>
```

**GitHub Social Preview**:
1. 进入仓库 Settings → General
2. 滚动到 "Social preview"
3. 上传 `profitlayer-github-preview.png` (1280x640 px)

### Twitter/X 发布
1. **发推时**直接上传 `profitlayer-twitter-card.png`
2. 或上传 `profitlayer-screenshots.png` 展示功能

### Reddit 发布
- r/defi, r/CryptoCurrency: 使用 `profitlayer-screenshots.png`
- r/ethdev, r/javascript: 使用 `profitlayer-banner.png`

### Hacker News
- 在评论中提供图片链接（先上传到GitHub repo的assets文件夹）

### Product Hunt
- 需要多张截图，可以直接使用：
  - `pools_screenshot.png`
  - `positions_page_screenshot.png`
  - `wallet_screenshot.png`
  - `profitlayer-banner.png` (作为主图)

---

## 🔧 自定义调整

如果需要修改文案或样式：

### 修改文字
直接编辑HTML文件中的文字内容：
```html
<!-- banner.html -->
<h1 class="logo">ProfitLayer</h1>  <!-- 修改项目名 -->
<p class="tagline">AI-Driven Multi-Chain DeFi Yield Optimizer</p>  <!-- 修改副标题 -->
```

### 修改颜色
在 `<style>` 标签中修改：
```css
/* 主色调：蓝色 */
#3b82f6  →  改为你想要的颜色

/* 次要色：紫色 */
#8b5cf6  →  改为你想要的颜色
```

### 修改尺寸
```css
body {
    width: 1920px;   /* 修改宽度 */
    height: 1080px;  /* 修改高度 */
}
```

---

## 📊 社交媒体尺寸参考

| 平台 | 推荐尺寸 | 使用素材 |
|------|----------|----------|
| GitHub Social Preview | 1280 x 640 | twitter-card.html (resize) |
| Twitter/X Card | 1200 x 628 | twitter-card.html |
| LinkedIn | 1200 x 627 | twitter-card.html |
| Facebook | 1200 x 630 | twitter-card.html |
| Reddit | 1920 x 1080 | banner.html / screenshots.html |
| Product Hunt | 240 x 240 (thumbnail) + multiple screenshots | 单独截图 |
| Dev.to | 1000 x 420 | banner.html (crop) |

---

## 🚀 快速开始

```bash
# 1. 打开宣传页面（已经打开）
open promo/banner.html
open promo/screenshots.html
open promo/twitter-card.html

# 2. 按 Cmd + Shift + 4 + Space，点击浏览器窗口截图

# 3. 重命名截图文件
mv ~/Desktop/Screenshot*.png ./promo/profitlayer-banner.png

# 4. 上传到GitHub（推送到clean仓库）
cd /Users/wangqi/Documents/ai/nexus-yield-clean
mkdir -p assets
cp ../dapp/promo/*.png assets/
git add assets/
git commit -m "docs: add promotional banners"
git push
```

---

## 💡 提示

1. **高分辨率**：使用Retina屏幕截图会得到2x分辨率（更清晰）
2. **压缩图片**：上传前使用 TinyPNG 或 ImageOptim 压缩（减小文件体积）
3. **品牌一致性**：所有素材使用相同的配色方案（蓝色#3b82f6 + 紫色#8b5cf6）
4. **A/B测试**：可以创建多个版本，测试哪个效果更好

---

## 📞 需要帮助？

如果需要：
- ✏️ 修改文案或设计
- 🎨 调整颜色方案
- 📐 创建其他尺寸
- 🖼️ 添加更多截图

随时告诉我！
