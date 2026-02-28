# 首次部署：清空服务器 seed 数据并导入本地班级/用户

适用于：服务器上已有 seed 测试数据，希望清空后用本地的系统与班级/用户信息覆盖。

---

## 一、本机准备

1. **导出本地班级与用户**
   ```bash
   npm run data:export
   ```
   会生成 `data/classes-users.json`（班级 + 用户，含密码哈希）。

2. **确认代码已提交**（若用方式 B 部署）
   ```bash
   git add .
   git commit -m "chore: 部署前同步"
   git push origin main
   ```

---

## 二、先部署系统代码（脚本在代码里，必须先同步到服务器）

**先**把包含 `data:clear-seed` 的代码部署到服务器，否则服务器上没有该命令。

### 方式 A：本机一键（需本机可 SSH 到服务器）

在**本机**项目根目录执行：

```bash
expect deploy.sh
```

会完成：上传代码（不含 .db/.env）→ 服务器备份数据库 → 解压 → 安装依赖 → 构建 → 重启 PM2。

### 方式 B：服务器上拉取代码

先在本机提交并推送：`git push origin main`。  
然后在**服务器**上执行：

```bash
cd /www/wwwroot/scoring-system
./scripts/server-deploy.sh
```

会完成：`git pull` → `npm install` → `npm run build` → `pm2 restart scoring-system`。

---

## 三、服务器上清空 seed 数据

登录服务器（阿里云 Workbench 或 SSH），执行：

```bash
cd /www/wwwroot/scoring-system
npm run data:clear-seed
```

说明：
- 会删除：班级、用户、以及所有依赖记录（评分、计划、考勤、调课、上传日志等）。
- **不会**删除：检查项(CheckItem)、学期(Semester)、作息(PeriodSchedule)、AI 配置等结构数据。
- 执行后服务器上班级和用户为空，等待下一步导入。

---

## 四、将班级/用户导入服务器

1. **把本机的 `data/classes-users.json` 放到服务器**
   - 方式一：宝塔面板 → 文件 → `/www/wwwroot/scoring-system/data/` → 上传 `classes-users.json`。
   - 方式二：本机 SCP 上传到服务器 `data/` 目录。

2. **在服务器上执行导入**
   ```bash
   cd /www/wwwroot/scoring-system
   npm run data:import
   ```
   控制台会输出导入的班级数、用户数。

---

## 五、检查

- 访问 http://8.145.51.48（或你的域名），用本地导出的账号密码登录。
- 在用户管理、班级管理中确认班级与用户与本地一致。

---

## 步骤汇总（复制执行顺序）

| 顺序 | 位置   | 操作 |
|------|--------|------|
| 1    | 本机   | `npm run data:export` |
| 2    | 本机/服务器 | **先部署代码**：本机 `expect deploy.sh` **或** 服务器 `./scripts/server-deploy.sh`（需先 git push） |
| 3    | 服务器 | `cd /www/wwwroot/scoring-system && npm run data:clear-seed` |
| 4    | 本机   | 将 `data/classes-users.json` 上传到服务器 `data/` 目录 |
| 5    | 服务器 | `cd /www/wwwroot/scoring-system && npm run data:import` |
