FROM node:20-alpine AS base

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# 复制 monorepo 配置文件
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./

# 复制所有需要的包
COPY packages/common/package.json ./packages/common/
COPY packages/adapters/package.json ./packages/adapters/
COPY packages/executor/package.json ./packages/executor/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY packages/common/ ./packages/common/
COPY packages/adapters/ ./packages/adapters/
COPY packages/executor/ ./packages/executor/

# 构建依赖包
RUN pnpm --filter @defi-yield/common build
RUN pnpm --filter @defi-yield/adapters build
RUN pnpm --filter @defi-yield/executor build

ENV NODE_ENV=production

CMD ["node", "packages/executor/dist/index.js"]
