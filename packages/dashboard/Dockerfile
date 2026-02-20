FROM node:20-alpine

WORKDIR /app

# 复制文件
COPY packages/dashboard/package.json ./

# 安装依赖
RUN npm install

# 复制源码
COPY packages/dashboard/ ./

# 构建
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# 复制 public 和 static 文件到 standalone
RUN cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/

# 运行
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", ".next/standalone/server.js"]
