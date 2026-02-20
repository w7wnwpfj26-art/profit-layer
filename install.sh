#!/bin/bash

# ============================================================
# ProfitLayer - One-Click Installation Script
# AI-Driven Multi-Chain DeFi Yield Optimization System
# https://github.com/w7wnwpfj26-art/profit-layer
# ============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ASCII Art Banner
print_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
    ____             _____ __  __                     
   / __ \_________  / __(_) /_/ /   ____ ___  _____  _____
  / /_/ / ___/ __ \/ /_/ / __/ /   / __ `/ / / / _ \/ ___/
 / ____/ /  / /_/ / __/ / /_/ /___/ /_/ / /_/ /  __/ /    
/_/   /_/   \____/_/ /_/\__/_____/\__,_/\__, /\___/_/     
                                       /____/             
EOF
    echo -e "${NC}"
    echo -e "${GREEN}AI-Driven Multi-Chain DeFi Yield Optimization System${NC}"
    echo ""
}

# Print colored message
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# Check if command exists
check_command() {
    if command -v "$1" &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    else
        error "Unsupported OS: $OSTYPE"
    fi
    info "Detected OS: $OS"
}

# Check and install Docker
check_docker() {
    if check_command docker; then
        success "Docker is installed"
        if ! docker info &> /dev/null; then
            warn "Docker is not running. Starting Docker..."
            if [[ "$OS" == "macos" ]]; then
                open -a Docker
                sleep 10
            else
                sudo systemctl start docker
            fi
        fi
    else
        warn "Docker not found. Installing..."
        if [[ "$OS" == "macos" ]]; then
            error "Please install Docker Desktop from https://docker.com/products/docker-desktop"
        else
            curl -fsSL https://get.docker.com | sh
            sudo usermod -aG docker $USER
            sudo systemctl enable docker
            sudo systemctl start docker
        fi
    fi
}

# Check Node.js
check_node() {
    if check_command node; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ "$NODE_VERSION" -ge 20 ]]; then
            success "Node.js $(node -v) is installed"
        else
            warn "Node.js version is too old. Need 20+"
            install_node
        fi
    else
        warn "Node.js not found. Installing..."
        install_node
    fi
}

install_node() {
    if [[ "$OS" == "macos" ]]; then
        if check_command brew; then
            brew install node@20
        else
            error "Please install Node.js 20+ from https://nodejs.org"
        fi
    else
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
}

# Check pnpm
check_pnpm() {
    if check_command pnpm; then
        success "pnpm is installed"
    else
        info "Installing pnpm..."
        npm install -g pnpm
        success "pnpm installed"
    fi
}

# Clone or update repository
setup_repo() {
    INSTALL_DIR="${INSTALL_DIR:-$HOME/profit-layer}"
    
    if [[ -d "$INSTALL_DIR" ]]; then
        info "Updating existing installation at $INSTALL_DIR..."
        cd "$INSTALL_DIR"
        git pull origin main 2>/dev/null || git pull github main 2>/dev/null || true
    else
        info "Cloning ProfitLayer to $INSTALL_DIR..."
        git clone https://github.com/w7wnwpfj26-art/profit-layer.git "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
    success "Repository ready"
}

# Setup environment
setup_env() {
    cd "$INSTALL_DIR"
    if [[ ! -f .env ]]; then
        if [[ -f .env.example ]]; then
            cp .env.example .env
            success "Created .env from .env.example"
            warn "Please edit .env to add your configuration"
        fi
    else
        success ".env file exists"
    fi
}

# Start database services
start_database() {
    cd "$INSTALL_DIR"
    info "Starting database services (TimescaleDB + Redis)..."
    
    if [[ -f docker-compose.yml ]]; then
        docker compose up -d postgres redis 2>/dev/null || docker-compose up -d postgres redis
        success "Database services started"
    else
        warn "docker-compose.yml not found, skipping database setup"
    fi
}

# Install dependencies
install_deps() {
    cd "$INSTALL_DIR"
    info "Installing dependencies..."
    pnpm install
    success "Dependencies installed"
}

# Start dashboard
start_dashboard() {
    cd "$INSTALL_DIR"
    info "Starting Dashboard..."
    
    # Check if port 3002 is in use
    if lsof -Pi :3002 -sTCP:LISTEN -t >/dev/null 2>&1; then
        warn "Port 3002 is already in use"
        echo -e "${YELLOW}Dashboard may already be running at http://localhost:3002${NC}"
    else
        # Start in background
        cd packages/dashboard
        nohup pnpm dev > /tmp/profitlayer-dashboard.log 2>&1 &
        sleep 5
        success "Dashboard started"
    fi
}

# Print completion message
print_complete() {
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ProfitLayer Installation Complete!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${CYAN}Dashboard:${NC}     http://localhost:3002"
    echo -e "  ${CYAN}Install Dir:${NC}   $INSTALL_DIR"
    echo ""
    echo -e "  ${YELLOW}Next Steps:${NC}"
    echo -e "  1. Edit ${CYAN}.env${NC} file with your configuration"
    echo -e "  2. Connect your wallet in the Dashboard"
    echo -e "  3. Start exploring DeFi opportunities!"
    echo ""
    echo -e "  ${YELLOW}Commands:${NC}"
    echo -e "  ${CYAN}cd $INSTALL_DIR && pnpm dashboard${NC}  - Start Dashboard"
    echo -e "  ${CYAN}cd $INSTALL_DIR && pnpm scanner${NC}    - Start Pool Scanner"
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Main installation flow
main() {
    print_banner
    
    info "Starting ProfitLayer installation..."
    echo ""
    
    detect_os
    check_docker
    check_node
    check_pnpm
    
    echo ""
    setup_repo
    setup_env
    start_database
    install_deps
    start_dashboard
    
    print_complete
}

# Run main function
main "$@"
