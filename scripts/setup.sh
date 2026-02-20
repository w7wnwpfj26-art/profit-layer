#!/bin/bash
# ============================================
# ProfitLayer - One-Click Setup
# ============================================

set -e

echo "=========================================="
echo "  ProfitLayer - Setup"
echo "=========================================="

# 1. Check prerequisites
echo ""
echo "Checking prerequisites..."

command -v node >/dev/null 2>&1 || { echo "Node.js required. Install from https://nodejs.org"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "Installing pnpm..."; npm install -g pnpm; }
command -v docker >/dev/null 2>&1 || { echo "Docker required. Install from https://docker.com"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Python 3.11+ required."; exit 1; }

echo "  Node.js: $(node --version)"
echo "  pnpm: $(pnpm --version)"
echo "  Docker: $(docker --version | cut -d' ' -f3)"
echo "  Python: $(python3 --version)"

# 2. Setup environment
echo ""
echo "Setting up environment..."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Created .env from .env.example"
  echo "  ⚠️  Please edit .env with your private keys and API keys"
else
  echo "  .env already exists"
fi

# 3. Install TypeScript dependencies
echo ""
echo "Installing TypeScript dependencies..."
pnpm install --no-frozen-lockfile

# 4. Build TypeScript packages
echo ""
echo "Building TypeScript packages..."
pnpm build

# 5. Setup Python environment
echo ""
echo "Setting up Python AI engine..."
cd ai-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]" --quiet
cd ..

# 6. Start infrastructure
echo ""
echo "Starting infrastructure (TimescaleDB, Redis, Grafana)..."
docker compose up -d timescaledb redis grafana

echo ""
echo "Waiting for services to be healthy..."
sleep 5

# Verify
docker compose ps

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "  Infrastructure:"
echo "    TimescaleDB: localhost:5432"
echo "    Redis:       localhost:6379"
echo "    Grafana:     http://localhost:3001 (admin/admin)"
echo ""
echo "  Start services:"
echo "    Scanner:    pnpm scanner"
echo "    Executor:   pnpm executor"
echo "    AI Engine:  cd ai-engine && source .venv/bin/activate && uvicorn src.api.server:app --reload"
echo "    Dashboard:  pnpm dashboard"
echo ""
echo "  ⚠️  Before starting:"
echo "    1. Edit .env with your RPC URLs and wallet keys"
echo "    2. NEVER commit .env or expose private keys"
echo ""
