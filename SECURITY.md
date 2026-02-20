# Security Policy

## 敏感信息与开源

- **切勿将 `.env`、`.env.local` 或任何包含真实密钥的文件提交到仓库。** 它们已在 `.gitignore` 中排除。
- 仅使用 **`.env.example`** 作为模板；克隆后请 `cp .env.example .env` 并填入自己的密钥。
- 若曾误提交过密钥，请立即在对应平台（OKX、Etherscan、DeepSeek 等）轮换或撤销该密钥，并从 Git 历史中移除（如使用 `git filter-branch` 或 BFG Repo-Cleaner）。

## 报告安全问题

若发现漏洞或敏感信息泄露，请通过 **GitHub Security Advisories** 或私下联系维护者说明，勿在公开 Issue 中贴出密钥或漏洞细节。

## 部署建议

- 生产环境务必修改默认的 `POSTGRES_PASSWORD`、`JWT_SECRET`、`WALLET_ENCRYPTION_KEY`。
- 使用强随机值（如 `openssl rand -base64 32`）生成 JWT 与加密密钥。
- 交易所 API 仅授予「读取 + 交易」权限，勿开启提现。
