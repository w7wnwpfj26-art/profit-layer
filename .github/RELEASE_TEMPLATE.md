# Release / 版本发布

## What's Changed / 更新内容

### New Features / 新功能
-

### Improvements / 优化
-

### Bug Fixes / 修复
-

### Security / 安全
-

---

## Breaking Changes / 破坏性变更

None / 无

## Migration Guide / 迁移指南

No migration needed. / 无需迁移。

## Database Migrations / 数据库迁移

```bash
# Run if applicable / 如有需要请执行
psql -U defi -d defi_yield -f infra/postgres/migrations/xxx.sql
```

---

## Quick Upgrade / 快速升级

```bash
git pull origin main
pnpm install
pnpm build

# Restart services / 重启服务
bash scripts/start-database.sh --all
pnpm dashboard
```

## Full Changelog / 完整变更日志

**Full Changelog**: https://github.com/user/nexus-yield/compare/v0.0.0...v0.0.0
