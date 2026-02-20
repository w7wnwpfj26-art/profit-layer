# Changelog

All notable changes to ProfitLayer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Mobile-responsive dashboard optimization
- More DEX aggregator integrations (Paraswap, 0x)
- Cross-chain bridge automation
- Advanced backtesting module

---

## [1.0.0] - 2026-02-07

### Added
- **Multi-chain Support**: 10+ chains including Ethereum, Arbitrum, Polygon, Base, Optimism, Avalanche, BSC, Aptos, Solana
- **AI Engine (Python/FastAPI)**
  - Yield Predictor with ML-based forecasting
  - Multi-factor Risk Scorer
  - Portfolio Optimizer using Sharpe ratio
  - Anomaly Detector (rug pull, TVL crash)
  - Impermanent Loss Calculator
- **Protocol Adapters**
  - Uniswap V3, Aave V3, Curve, Lido, Compound V3
  - Thala Finance (Aptos)
  - Raydium, Marinade Finance (Solana)
- **Professional Dashboard (Next.js 16)**
  - Real-time pool discovery with health scoring
  - Position management with P&L tracking
  - Wallet overview with multi-chain balance
  - Trading center (DEX swap, CEX integration)
  - Cross-chain bridge interface
  - AI chat assistant
  - Alert configuration
  - Transaction logs
- **Security Features**
  - JWT + Google Authenticator (TOTP) 2FA
  - AES-256 encrypted key storage
  - Transaction simulation before execution
  - Per-transaction and daily spending limits
  - Emergency kill switch
  - Stop-loss and trailing stop monitoring
- **Desktop App (Electron)**
  - Windows and macOS support
  - Auto-update via Generic provider
- **Infrastructure**
  - TimescaleDB for time-series data
  - Redis/BullMQ for task queuing
  - Grafana monitoring dashboards
  - Docker Compose orchestration
- **Internationalization (i18n)**
  - Full English and Simplified Chinese support
  - next-intl integration with cookie persistence
- **One-Click Deployment**
  - `install.sh` for quick setup
  - `docker-compose.prod.yml` for production
- **Documentation**
  - Comprehensive README (EN/CN)
  - API documentation
  - Architecture guide
  - Security policy

### Security
- Removed all hardcoded credentials from codebase
- Environment-based configuration via `.env.example`
- Database credentials use secure defaults
- API keys require user configuration

---

## [0.9.0] - 2026-01-15 (Internal Beta)

### Added
- Initial multi-chain scanner implementation
- Basic AI risk scoring model
- Dashboard MVP with pool discovery
- Prototype executor for EVM chains

### Changed
- Migrated from PostgreSQL to TimescaleDB
- Upgraded to Next.js 16 and React 19

### Fixed
- Pool health score calculation accuracy
- WebSocket connection stability

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 1.0.0 | 2026-02-07 | First public release, full feature set |
| 0.9.0 | 2026-01-15 | Internal beta, core functionality |

---

## Upgrade Notes

### From 0.9.x to 1.0.0
1. Run database migrations: `psql -f infra/postgres/migrations/*.sql`
2. Update `.env` with new required variables (see `.env.example`)
3. Rebuild all packages: `pnpm install && pnpm build`

---

[Unreleased]: https://github.com/w7wnwpfj26-art/profit-layer/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/w7wnwpfj26-art/profit-layer/releases/tag/v1.0.0
[0.9.0]: https://github.com/w7wnwpfj26-art/profit-layer/releases/tag/v0.9.0
