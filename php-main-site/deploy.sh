#!/bin/bash
# php-main-site 部署脚本
# 用法: ./deploy.sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "========================================="
echo "  php-main-site 部署"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="

# 1. Git 拉取最新代码（如果有 .git 目录）
if [ -d ".git" ]; then
    echo "[1/5] git pull..."
    git pull
else
    echo "[1/5] 跳过 git pull（无 .git 目录）"
fi

# 2. 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "❌ 缺少 .env 文件，请从 .env.example 复制并配置"
    exit 1
fi

# 验证关键变量
PASSWORD_VAL="$(grep -E '^MYSQL_ROOT_PASSWORD=' .env | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
if [ -z "$PASSWORD_VAL" ] || [ "$PASSWORD_VAL" = "change_me_root_password" ]; then
    echo "❌ .env: MYSQL_ROOT_PASSWORD 未设置或仍为占位值 'change_me_root_password'"
    echo "   请在 php-main-site/.env 中设置真实的 MYSQL_ROOT_PASSWORD"
    exit 1
fi
echo "[2/5] .env 验证通过"

# 3. 检查 docker-compose 配置
echo "[3/5] docker compose config..."
docker compose config --quiet || docker compose config

# 4. 构建并启动
echo "[4/5] docker compose up -d --build..."
docker compose up -d --build

# 5. 查看状态
echo "[5/5] 检查服务状态..."
sleep 3
docker compose ps
echo ""
echo "--- 最近日志 ---"
docker compose logs --tail=100

echo ""
echo "========================================="
echo "  部署完成"
echo "  访问: http://localhost:${APP_HOST_PORT:-3001}/index.php"
echo "========================================="
