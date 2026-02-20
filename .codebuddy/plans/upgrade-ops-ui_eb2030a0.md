---
name: upgrade-ops-ui
overview: 对 /ops 运维监控页面进行高级化 UI 升级，引入极致玻璃拟态、动态网格背景、交错入场动画及专业排版细节，打造 Premium 级的监控终端体验。
todos:
  - id: update-page-header
    content: 重构 /ops 页面头部标题与刷新按钮样式，应用 text-gradient 和 glass 效果
    status: completed
  - id: upgrade-metric-cards
    content: 升级业务指标卡片 (MetricCard)，应用 rounded-[24px], glass 和 glass-hover 类
    status: completed
    dependencies:
      - update-page-header
  - id: upgrade-system-cards
    content: 重构系统指标卡片 (SystemCard)，优化状态药丸样式并引入 Outfit 字体
    status: completed
    dependencies:
      - upgrade-metric-cards
  - id: optimize-data-source-grid
    content: 优化数据源状态与交易统计模块，确保容器样式与交互效果全局对齐
    status: completed
    dependencies:
      - upgrade-system-cards
  - id: apply-stagger-animations
    content: 在页面主内容区应用 stagger-in 动画，提升加载视觉体验
    status: completed
    dependencies:
      - optimize-data-source-grid
---

## 产品概述

对运维监控页面 (/ops) 进行 UI/UX 高级化升级，使其视觉风格与主仪表盘保持高度一致。

## 核心功能与视觉改进

- **视觉风格对齐**：采用与主仪表盘一致的科技感设计，包括玻璃拟态、渐变色调和动态背景。
- **容器升级**：所有模块容器统一使用 `rounded-[24px]` 的极致玻璃拟态 (Glassmorphism) 效果。
- **交互增强**：强化卡片悬停效果 (`glass-hover`)，提升交互反馈的细腻度。
- **状态指示优化**：重构状态药丸 (Status Pills)，增强系统健康度的视觉传达。
- **字体与排版**：全面引入 `Outfit` 字体增强数字表现力，优化标签权重，提升信息密度与可读性。
- **动效引入**：利用交错入场动画 (`stagger-in`) 提升页面加载时的仪式感。

## 技术栈

- **框架**: Next.js 14+ (App Router)
- **样式**: Tailwind CSS 4.0
- **图标**: Lucide React
- **字体**: Outfit (用于数据展示), Inter (用于正文)

## 实施方案

- **全局样式复用**：利用 `globals.css` 中定义的 `.glass`, `.glass-hover`, `.text-gradient`, `.stagger-in` 等高级 CSS 类。
- **组件重构**：
    - `MetricCard`: 升级为玻璃拟态容器，增加悬停位移与发光效果。
    - `SystemCard`: 优化状态指示灯，引入 `font-outfit` 处理实时指标数据。
    - `StatusPill`: 统一设计规范，使用柔和的背景色与强化的边框。
- **响应式优化**：确保在大屏和移动端下均能保持良好的网格布局与视觉间距。

## 目录结构

```
packages/dashboard/
├── app/
│   ├── ops/
│   │   └── page.tsx      # [MODIFY] 升级运维监控页面 UI
│   └── globals.css       # [REFERENCE] 已包含定义的玻璃拟态与动画样式
```