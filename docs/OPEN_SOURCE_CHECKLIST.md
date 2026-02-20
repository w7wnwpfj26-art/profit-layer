# 开源发布清单

以下清单用于保证开源发布“体面、完整、可信”。建议在发布前逐项确认。

## 1. 基础合规
- `LICENSE` 已确定并与项目目标匹配
- `README.md` 含完整启动与使用说明
- `CONTRIBUTING.md` 与 `CODE_OF_CONDUCT.md` 已完善
- `docs/SECURITY.md` 已包含披露流程

## 2. 安全检查
- `.env` 未提交到仓库
- 所有密钥均已脱敏或替换为占位
- 默认配置不会误触真实交易（建议 Dry Run）

## 3. 可运行性
- 本地可一键启动（至少 Dashboard 可运行）
- 数据库与基础依赖有明确说明
- 最基础的测试或健康检查可执行

## 4. 维护与发布
- 有明确的版本策略与发布说明
- 维护者联系方式明确（Issue/Discussions）
- 已准备好 Roadmap 或 NEXT_STEPS
