#!/bin/bash
# ============================================================
# 本机一键：导出班级/用户数据 + 提交并推送到远程
# 用法: 在项目根目录执行  npm run deploy:push
# 推送后到服务器执行: ./scripts/server-deploy.sh [--with-data]
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

if [ ! -f "package.json" ]; then
  echo "错误: 请在项目根目录执行，例如："
  echo "  cd /path/to/class-routine-score-system"
  echo "  npm run deploy:push"
  exit 1
fi

echo "[1/2] 导出班级/用户数据..."
npm run data:export

echo "[2/2] 提交并推送..."
git add .
git status
if git diff --staged --quiet 2>/dev/null; then
  echo "无变更，跳过提交。"
else
  git commit -m "chore: 部署 $(date +%Y-%m-%d_%H:%M)"
  git push origin main
  echo "已推送。"
fi

echo ""
echo "下一步："
echo "  1. 若需同步班级/用户：将 data/classes-users.json 上传到服务器 data/ 目录"
echo "  2. 服务器 Workbench 执行: cd /www/wwwroot/scoring-system && ./scripts/server-deploy.sh --with-data"
echo "     （仅更新代码则执行: ./scripts/server-deploy.sh）"
