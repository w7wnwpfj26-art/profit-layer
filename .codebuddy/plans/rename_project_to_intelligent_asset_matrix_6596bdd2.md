---
name: rename_project_to_intelligent_asset_matrix
overview: "将项目名称从“DeFi 智能收益系统”统一更新为“ProfitLayer: 智能资产矩阵 (Intelligent Asset Matrix)”，涵盖所有文档、前端标题及客户端描述。"
todos:
  - id: update-docs-titles
    content: 更新 docs 目录下设置指南、快速开始和 AI 能力说明的 H1 标题为新项目名称
    status: completed
  - id: update-desktop-metadata
    content: 修改 packages/desktop/package.json 中的 description 字段为新名称
    status: completed
  - id: update-dashboard-layout
    content: 更新 packages/dashboard/app/layout.tsx 中的所有 title 标签内容
    status: completed
  - id: update-report-page
    content: 修改 packages/dashboard/app/report/page.tsx 中的报告标题和生成器说明
    status: completed
  - id: update-subproject-readme
    content: 更新 packages/okx-auto-approve/README.md 中的项目名称标识
    status: completed
  - id: verify-renaming
    content: 执行全局搜索验证是否仍有遗留的旧项目名称文本
    status: completed
    dependencies:
      - update-docs-titles
      - update-desktop-metadata
      - update-dashboard-layout
      - update-report-page
      - update-subproject-readme
---

## 产品概述

本项目已确定更名为 "ProfitLayer: 智能资产矩阵 (Intelligent Asset Matrix)"。现需将代码库中所有残留的旧名称 "DeFi 智能收益系统"（包括简体和繁体形式）更新为新名称，以提升专业形象并保持品牌一致性。

## 核心任务

- 更新文档标题：包括设置指南、快速开始、AI 能力说明等文档的 H1 标题。
- 更新桌面应用配置：修改 `packages/desktop/package.json` 中的 `description` 字段。
- 更新 Dashboard 页面内容：
    - `layout.tsx` 中的 `<title>` 标签（登录页、首页、控制台）。
    - `report/page.tsx` 中的报告标题及自动生成说明。
- 更新子项目说明：修改 `packages/okx-auto-approve/README.md` 中的项目名称描述。

## 实现方案

1. **全局搜索与替换**：

- 针对 "DeFi 智能收益系统" 进行全局不区分简繁体的搜索。
- 替换为 "ProfitLayer: 智能资产矩阵"。

2. **文档更新**：

- 直接修改 Markdown 文件的头部标题。

3. **前端代码更新**：

- 修改 Next.js 布局文件中的动态标题逻辑。
- 更新报告生成页面的静态文本。

4. **元数据更新**：

- 更新 Electron 桌面端的项目描述。

## 涉及文件列表

- `docs/设置指南.md`
- `docs/快速开始.md`
- `docs/AI能力说明.md`
- `packages/desktop/package.json`
- `packages/okx-auto-approve/README.md`
- `packages/dashboard/app/report/page.tsx`
- `packages/dashboard/app/layout.tsx`