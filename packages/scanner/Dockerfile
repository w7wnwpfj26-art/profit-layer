FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/common/package.json packages/common/
COPY packages/scanner/package.json packages/scanner/

# Install dependencies
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy source code
COPY packages/common/ packages/common/
COPY packages/scanner/ packages/scanner/

# Build
RUN pnpm --filter @profitlayer/common build
RUN pnpm --filter @profitlayer/scanner build

# ---- Production ----
FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy entire built workspace (preserves pnpm workspace links)
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml* ./
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/packages/common/ packages/common/
COPY --from=builder /app/packages/scanner/ packages/scanner/

# Re-link workspace packages
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install --prod

CMD ["node", "packages/scanner/dist/index.js"]
