#!/bin/bash
# ============================================================
# 服务器端部署脚本（Git 拉取 + 构建 + PM2 重启）
# 用法: 在阿里云 Workbench 中执行
#   cd /www/wwwroot/scoring-system && ./scripts/server-deploy.sh
# 前置: 本机已执行 git push origin main
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "[1/4] 拉取最新代码..."
git pull origin main

echo "[2/4] 安装依赖..."
npm install

echo "[3/4] 构建生产版本..."
npm run build

echo "[4/4] 重启 PM2 进程..."
pm2 restart scoring-system

echo ""
echo "部署完成。"
echo "访问: http://8.145.51.48:3000"
