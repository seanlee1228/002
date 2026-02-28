#!/bin/bash
# ============================================================
# 数据库定时备份脚本
# 功能: 备份 SQLite 数据库，保留最近 30 天
# 部署: 通过宝塔面板计划任务或 crontab 添加
#   cron: 0 3 * * * /bin/bash /www/wwwroot/scoring-system/scripts/backup-db.sh
# ============================================================

BACKUP_DIR="/www/wwwroot/scoring-system/prisma/backups"
DB_FILE="/www/wwwroot/scoring-system/prisma/prod.db"
LOG_FILE="/www/wwwroot/scoring-system/scripts/backup.log"

# 确保备份目录存在
mkdir -p "$BACKUP_DIR"

# 检查数据库文件是否存在
if [ ! -f "$DB_FILE" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] 数据库文件不存在: $DB_FILE" >> "$LOG_FILE"
  exit 1
fi

# 备份（带时间戳）
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp "$DB_FILE" "$BACKUP_DIR/prod.db.$TIMESTAMP"

if [ $? -eq 0 ]; then
  SIZE=$(ls -lh "$BACKUP_DIR/prod.db.$TIMESTAMP" | awk '{print $5}')
  echo "$(date '+%Y-%m-%d %H:%M:%S') [OK] 备份成功: prod.db.$TIMESTAMP ($SIZE)" >> "$LOG_FILE"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] 备份失败" >> "$LOG_FILE"
  exit 1
fi

# 清理：保留最近 30 个备份
ls -t "$BACKUP_DIR"/prod.db.* 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null

# 清理备份日志：只保留最近 200 行
if [ -f "$LOG_FILE" ]; then
  tail -200 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
