# Roadmap / 路线图

> Last updated: 2026-02-14

---

## Phase 1 — Foundation (Completed / 已完成)

- [x] Multi-chain pool scanner (DefiLlama integration)
- [x] Protocol adapters: Uniswap V3, Aave V3, Curve, Lido, Compound V3, Thala, Raydium, Marinade
- [x] Transaction execution engine with simulation
- [x] TimescaleDB time-series data storage
- [x] BullMQ async task queue
- [x] Next.js dashboard with real-time monitoring
- [x] Electron desktop client (Win/Mac)
- [x] Basic risk controls (kill switch, stop-loss, spending limits)
- [x] Telegram alert notifications

## Phase 2 — AI & Security (In Progress / 进行中)

- [x] Python AI engine (FastAPI) — yield predictor, risk scorer, portfolio optimizer
- [x] AI-driven strategy scheduling with dynamic think intervals
- [x] Multi-factor pool scoring system
- [x] GLM-5 / DeepSeek model support
- [x] JWT middleware — global authentication for all API routes
- [x] Google Authenticator (TOTP) 2FA
- [x] httpOnly cookie + Edge Runtime token verification
- [x] Deep backtesting system with pool snapshots
- [ ] Rate limiting on auth endpoints
- [ ] RBAC (role-based access control) for multi-user scenarios
- [ ] API key management for programmatic access

## Phase 3 — Advanced Strategies (Planned / 计划中)

- [ ] Reinforcement learning for dynamic position sizing
- [ ] Cross-chain arbitrage execution (bridge-aware)
- [ ] MEV protection integration (Flashbots / private mempool)
- [ ] Options strategy support (on-chain options protocols)
- [ ] Sentiment analysis integration (on-chain + social signals)
- [ ] Custom strategy SDK — user-defined strategy plugins

## Phase 4 — Production Hardening (Planned / 计划中)

- [ ] Kubernetes deployment manifests
- [ ] Prometheus + Grafana monitoring dashboards
- [ ] Automated CI/CD pipeline (GitHub Actions)
- [ ] Comprehensive test suite (unit + integration + e2e)
- [ ] Multi-user workspace support
- [ ] Encrypted backup & disaster recovery
- [ ] Formal security audit

## Phase 5 — Ecosystem (Future / 远期)

- [ ] Plugin marketplace for community strategies
- [ ] Mobile companion app (React Native)
- [ ] Webhook / API integration for external signals
- [ ] DAO governance module for shared vaults
- [ ] Multi-language dashboard (i18n)
- [ ] Public demo instance

---

## How to Contribute / 如何参与

We welcome contributions at any phase. Check [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines, or open an issue to discuss ideas.

欢迎在任何阶段参与贡献。查看 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解指南，或提交 Issue 讨论想法。
