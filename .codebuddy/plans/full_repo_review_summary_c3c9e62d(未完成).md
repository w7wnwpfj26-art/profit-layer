---
name: full_repo_review_summary
overview: 全量检查代码与文档，梳理结构与问题点，并给出后续处理计划。
todos:
  - id: scan-frontend-pages
    content: 使用 [subagent:code-explorer] 复查 positions/strategies/settings 页面数据流与错误展示
    status: in_progress
  - id: audit-docs-consistency
    content: 核对 README 与 docs/快速开始 版本与仓库信息一致性并拟定修复
    status: pending
    dependencies:
      - scan-frontend-pages
  - id: check-backend-contracts
    content: 核对前端依赖的 API 端点与字段契约，整理后端待办清单
    status: pending
    dependencies:
      - scan-frontend-pages
  - id: apply-fixes
    content: 按清单修复前端与文档问题，保持样式与交互一致
    status: pending
    dependencies:
      - audit-docs-consistency
      - check-backend-contracts
  - id: final-review
    content: 复核修改范围与风险，输出前端修复摘要与后端需求汇总
    status: pending
    dependencies:
      - apply-fixes
---

## User Requirements

- 重新检查项目的前端页面与开源文档，识别不一致、潜在缺陷与可改进点。
- 若涉及后端接口问题，整理成清单供后端处理。

## Product Overview

- 前端页面需要保证加载状态、错误反馈、数据展示与交互的完整性和稳定性。
- 文档需要保持版本、依赖、仓库地址与功能描述一致，避免开源展示上的不一致。

## Core Features

- 页面级数据拉取与错误提示是否可用、是否存在缺失字段或显示错误。
- 文档一致性与开源发布信息完整性校验。
- 输出前端修复建议与后端需配合的事项清单。

## Tech Stack Selection

- 前端：Next.js 16、React 19、TypeScript、Tailwind CSS
- 共享工具：统一 API 客户端与校验器（app/lib/api.ts、app/lib/validators.ts）

## Implementation Approach

- 基于现有页面组件与统一 apiFetch 约定，对页面数据流、错误状态、边界展示进行回溯审查。
- 对文档进行一致性比对，统一版本要求与仓库信息，避免对外开源描述偏差。
- 对可能依赖后端支持的能力（2FA、AI 测试、策略控制等）进行端点对齐核查，形成后端待办。

## Implementation Notes

- 保持页面视觉与交互一致，不引入新的样式体系，复用现有组件（FeedbackBar、Skeleton）。
- 只做必要的修复与文档对齐，不做大范围重构，避免影响稳定性。
- 对轮询与刷新提示保持当前间隔与提示逻辑，避免额外负载。

## Architecture Design

- Next.js App Router 页面（positions/strategies/settings）依赖统一 apiFetch 与工具函数层。
- 页面状态管理为本地 state + 周期刷新，错误信息统一通过 FeedbackBar 展示。

## Directory Structure

project-root/
├── packages/dashboard/app/positions/page.tsx  # [MODIFY] 核对交易日志展示与字段一致性，修复潜在展示错误与边界处理。
├── packages/dashboard/app/strategies/page.tsx # [MODIFY] 核对策略数据渲染、反馈提示与轮询一致性。
├── packages/dashboard/app/settings/page.tsx   # [MODIFY] 核对配置验证逻辑与 2FA 状态交互一致性。
├── packages/dashboard/app/lib/api.ts          # [MODIFY] 必要时补齐错误信息与返回结构的一致性。
├── docs/快速开始.md                             # [MODIFY] 对齐 Node/Next 版本与仓库地址描述。
├── README.md                                  # [MODIFY] 对齐版本说明、文档链接与开源声明一致性。

## Agent Extensions

- **code-explorer**
- Purpose: 扫描前端页面与文档中的不一致、潜在缺陷与遗漏点
- Expected outcome: 输出可验证的问题清单与对应修复位置