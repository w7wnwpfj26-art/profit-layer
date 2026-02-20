#!/bin/bash

# ProfitLayer 运维控制台启动脚本

echo "🚀 启动运维控制台..."

# 检查端口占用
if lsof -Pi :3005 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  端口 3005 已被占用，正在终止旧进程..."
    lsof -ti :3005 | xargs kill -9 2>/dev/null
    sleep 2
fi

# 启动 HTTP 服务器
cd /Users/wangqi/Documents/ai/dapp

echo "📡 启动 HTTP 服务器..."
node -e "
const http = require('http');
const fs = require('fs');
const url = require('url');

const server = http.createServer((req, res) => {
  const pathname = url.parse(req.url).pathname;
  
  if (pathname === '/' || pathname === '/ops') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream('./ops.html').pipe(res);
  } else if (pathname === '/status') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      status: 'running',
      wallet: '0x41f7...6677',
      funds: '$500+',
      pools: 'loaded',
      positions: 0
    }));
  } else {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end('Not Found');
  }
});

server.listen(3005, '127.0.0.1', () => {
  console.log('✅ 运维控制台启动成功!');
  console.log('🌐 访问地址: http://127.0.0.1:3005/ops');
  console.log('📊 状态接口: http://127.0.0.1:3005/status');
  console.log('กด Ctrl+C 停止服务');
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\\n🛑 正在停止服务...');
  server.close(() => {
    console.log('✅ 服务已停止');
    process.exit(0);
  });
});
" &

SERVER_PID=$!
echo "sPid: $SERVER_PID"

# 等待服务启动
sleep 3

# 检查服务状态
if curl -s http://127.0.0.1:3005/status >/dev/null 2>&1; then
    echo "✅ 服务运行正常"
else
    echo "❌ 服务启动失败"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# 保持前台运行
wait $SERVER_PID
