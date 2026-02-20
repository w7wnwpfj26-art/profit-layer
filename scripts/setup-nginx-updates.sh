#!/bin/bash
# Nginx 更新目錄配置生成器
# 用途：在服務器上配置 Nginx 提供更新文件服務

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cat << 'EOF'
╔════════════════════════════════════════════════════════════════╗
║          DeFi 桌面應用 - Nginx 更新服務配置                   ║
╚════════════════════════════════════════════════════════════════╝

本腳本將生成 Nginx 配置，用於在服務器上提供應用更新服務。

配置目標：
  • 服務器：請在生成的配置中替換為你的域名或 IP
  • 監聽端口：443（或 80）
  • 更新路徑：/updates
  • 本地目錄：/var/www/updates/

EOF

echo -e "${YELLOW}請選擇配置方式：${NC}"
echo "  1) 生成新的 Nginx 配置文件（推薦）"
echo "  2) 生成配置片段（添加到現有配置）"
echo "  3) 僅顯示配置示例"
echo ""
read -p "請選擇 [1-3]: " choice

case $choice in
    1)
        echo ""
        echo -e "${GREEN}生成完整配置文件...${NC}"
        cat > nginx-updates.conf << 'NGINX_EOF'
# DeFi 桌面應用更新服務配置（部署時請替換 your-update-server.com 與端口）
# 放置位置：/etc/nginx/sites-available/defi-updates 或 /etc/nginx/conf.d/defi-updates.conf

server {
    listen 443 ssl;
    server_name your-update-server.com;
    
    # 日誌
    access_log /var/log/nginx/defi-updates-access.log;
    error_log /var/log/nginx/defi-updates-error.log;
    
    # 更新文件服務
    location /updates/ {
        alias /var/www/updates/;
        autoindex on;  # 可選：允許目錄瀏覽
        
        # 允許跨域（客戶端下載需要）
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, HEAD, OPTIONS' always;
        
        # 緩存控制（更新文件不應被緩存太久）
        add_header Cache-Control "public, max-age=300" always;
        
        # 支持大文件下載
        client_max_body_size 500M;
    }
    
    # 其他路由（可選）
    location / {
        proxy_pass http://localhost:3000;  # 假設 Git 服務在 3000 端口
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Git 需要的額外配置
        proxy_buffering off;
        proxy_request_buffering off;
        client_max_body_size 500M;
    }
    
    # 健康檢查
    location /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
}
NGINX_EOF
        echo ""
        echo -e "${GREEN}✓ 配置文件已生成: nginx-updates.conf${NC}"
        echo ""
        echo "部署步驟："
        echo "  1. 上傳到服務器："
        echo "     scp nginx-updates.conf root@YOUR_SERVER:/etc/nginx/conf.d/defi-updates.conf"
        echo ""
        echo "  2. 創建更新目錄："
        echo "     ssh root@YOUR_SERVER 'mkdir -p /var/www/updates'"
        echo ""
        echo "  3. 測試配置："
        echo "     ssh root@YOUR_SERVER 'nginx -t'"
        echo ""
        echo "  4. 重載 Nginx："
        echo "     ssh root@YOUR_SERVER 'nginx -s reload'"
        echo ""
        ;;
    
    2)
        echo ""
        echo -e "${GREEN}生成配置片段...${NC}"
        cat > nginx-location-snippet.conf << 'SNIPPET_EOF'
# 添加到現有的 server {} 塊中

location /updates/ {
    alias /var/www/updates/;
    autoindex on;
    
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, HEAD, OPTIONS' always;
    add_header Cache-Control "public, max-age=300" always;
    
    client_max_body_size 500M;
}
SNIPPET_EOF
        echo ""
        echo -e "${GREEN}✓ 配置片段已生成: nginx-location-snippet.conf${NC}"
        echo ""
        echo "使用方法："
        echo "  將此片段添加到現有 Nginx 配置的 server {} 塊中"
        echo "  通常在：/etc/nginx/sites-available/default"
        echo "  或：/etc/nginx/conf.d/default.conf"
        echo ""
        ;;
    
    3)
        echo ""
        cat << 'EXAMPLE_EOF'
═══════════════════════════════════════════════════════════════
                      配置示例
═══════════════════════════════════════════════════════════════

【方案 A：獨立配置文件（推薦）】

文件：/etc/nginx/conf.d/defi-updates.conf

server {
    listen 443 ssl;
    server_name your-update-server.com;
    
    location /updates/ {
        alias /var/www/updates/;
        autoindex on;
        add_header 'Access-Control-Allow-Origin' '*' always;
    }
    
    location / {
        proxy_pass http://localhost:3000;  # 可選
    }
}

═══════════════════════════════════════════════════════════════

【方案 B：添加到現有配置】

在現有 server {} 塊中添加：

location /updates/ {
    alias /var/www/updates/;
    autoindex on;
    add_header 'Access-Control-Allow-Origin' '*' always;
}

═══════════════════════════════════════════════════════════════

【驗證步驟】

1. 創建目錄：
   mkdir -p /var/www/updates

2. 測試配置：
   nginx -t

3. 重載服務：
   nginx -s reload

4. 測試訪問：
   curl -I https://your-update-server.com/updates/

═══════════════════════════════════════════════════════════════
EXAMPLE_EOF
        ;;
    
    *)
        echo "無效選擇"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}完成！${NC}"
