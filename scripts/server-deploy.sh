#!/bin/bash
# ============================================================
# 服务器端部署脚本（Git 拉取 + 构建 + PM2 重启）
# 用法:
#   仅部署代码:  cd /www/wwwroot/scoring-system && ./scripts/server-deploy.sh
#   部署并替换班级/用户数据（需先上传 data/classes-users.json）:
#               cd /www/wwwroot/scoring-system && ./scripts/server-deploy.sh --with-data
# 前置: 本机已执行 git push origin main
# ============================================================

set -e

WITH_DATA=false
for arg in "$@"; do
  [ "$arg" = "--with-data" ] && WITH_DATA=true
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_FILE="$PROJECT_DIR/data/classes-users.json"

cd "$PROJECT_DIR"

echo "[1/4] 拉取最新代码..."
git pull origin main

echo "[2/4] 安装依赖..."
npm install

echo "[3/4] 构建生产版本..."
npm run build

echo "[4/4] 重启 PM2 进程..."
pm2 restart scoring-system

if [ "$WITH_DATA" = true ]; then
  if [ -f "$DATA_FILE" ]; then
    echo ""
    echo "[数据] 清空种子数据并导入班级/用户..."
    npm run data:clear-seed
    npm run data:import
    echo "[数据] 完成。"
  else
    echo ""
    echo "提示: 未找到 data/classes-users.json，跳过数据替换。"
    echo "      若需替换，请先上传该文件后重新执行: ./scripts/server-deploy.sh --with-data"
  fi
fi

echo ""
echo "部署完成。"
echo "访问: http://8.145.51.48:3000"
