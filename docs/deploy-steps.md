# 部署步骤（每次部署按此执行）

生产环境：阿里云轻量服务器 8.145.51.48，项目路径 `/www/wwwroot/scoring-system/`。

---

## 快捷方式（最少操作）

**本机一条命令：**
```bash
npm run deploy:push
```
自动完成：导出班级/用户 → `git add` → `git commit`（带时间戳）→ `git push origin main`。若无变更会跳过提交。

**注意：必须在项目根目录执行。** 先 `cd` 到项目目录再运行，例如：
```bash
cd /Users/seanlee/Desktop/00-Cursor与AI工具/开发项目/class-routine-score-system
npm run deploy:push
```

| 报错 | 原因 | 处理 |
|------|------|------|
| `ENOENT ... package.json` | 当前目录不是项目根（如在用户主目录） | 先 `cd` 到项目根目录再执行 |
| `Permission denied`（脚本） | 旧版用 `./scripts/deploy-push.sh` 且脚本无可执行权限 | 当前已改为 `sh scripts/deploy-push.sh`，无需可执行权限；若仍报错，在项目根执行 `chmod +x scripts/deploy-push.sh` 或直接用 `sh scripts/deploy-push.sh` |

**服务器一条命令：**
- 仅更新代码：`cd /www/wwwroot/scoring-system && ./scripts/server-deploy.sh`
- 更新代码并**用本地数据替换**服务器班级/用户（需先上传 `data/classes-users.json` 到服务器 `data/` 目录）：
  ```bash
  cd /www/wwwroot/scoring-system && ./scripts/server-deploy.sh --with-data
  ```
  `--with-data` 会先清空服务器种子数据再导入 JSON，无需再单独执行 `data:clear-seed` 和 `data:import`。

**仍需手动的一步：** 若需同步班级/用户，把本机 `data/classes-users.json` 上传到服务器 `data/`（Workbench 文件管理），然后执行带 `--with-data` 的部署。

---

## 通过 Workbench 部署（服务器端操作）

部署在服务器上的部分全部在 **阿里云 Workbench** 里完成，无需本机 SSH。

### 1. 打开 Workbench

- 登录 [阿里云控制台](https://ecs.console.aliyun.com/)
- 找到轻量应用服务器实例（8.145.51.48）
- 点击 **远程连接** → 选择 **Workbench 一键连接** → **立即登录**

### 2. 在终端执行部署命令

登录后会出现终端界面，在命令行中执行：

**仅更新代码（日常部署）：**
```bash
cd /www/wwwroot/scoring-system && ./scripts/server-deploy.sh
```

**更新代码并替换班级/用户数据**（需先把本机 `data/classes-users.json` 上传到服务器的 `data/` 目录）：
```bash
cd /www/wwwroot/scoring-system && ./scripts/server-deploy.sh --with-data
```

### 3. 上传数据文件（仅当需要同步班级/用户时）

- 在 Workbench 界面中打开 **文件管理**（或「上传文件」入口）
- 将本机 `data/classes-users.json` 上传到服务器目录：`/www/wwwroot/scoring-system/data/`
- 上传完成后，在终端执行上面带 `--with-data` 的那条命令

### 4. 验证

浏览器访问 http://8.145.51.48:3000 确认可登录、功能正常。

---

### 1. 提交并推送代码

**方式 A（推荐）：** 一条命令完成导出 + 提交 + 推送
```bash
npm run deploy:push
```

**方式 B：** 手动分步
```bash
cd /path/to/class-routine-score-system
git add .
git status
git commit -m "feat: 本次更新描述"
git push origin main
```

### 2. （可选）若修改了班级或用户数据

`deploy:push` 已包含 `data:export`。将生成的 `data/classes-users.json` 上传到服务器 `/www/wwwroot/scoring-system/data/`，再在服务器执行带 `--with-data` 的部署（见下方）。

---

## 二、服务器操作（Workbench）

在阿里云控制台 → 实例 → **远程连接（Workbench）** → 登录后打开终端：

**仅更新代码：**
```bash
cd /www/wwwroot/scoring-system
./scripts/server-deploy.sh
```

**更新代码并替换班级/用户（需已上传 data/classes-users.json）：**
```bash
cd /www/wwwroot/scoring-system
./scripts/server-deploy.sh --with-data
```

脚本会：拉取代码 → 安装依赖 → 构建 → 重启 PM2；若使用 `--with-data` 且存在 `data/classes-users.json`，会接着清空种子数据并导入。

访问：http://8.145.51.48:3000

### 仅做数据替换（不重新构建）时

若代码已是最新，只需重新导入班级/用户：
```bash
cd /www/wwwroot/scoring-system
npm run data:replace
```
（等同于先 `data:clear-seed` 再 `data:import`）

---

## 三、部署检查清单

| 步骤 | 执行位置 | 操作 | 完成 |
|------|----------|------|------|
| 1 | 本机 | `npm run deploy:push`（或手动 git add/commit/push） | ☐ |
| 2 | 本机 | 若同步班级/用户：上传 `data/classes-users.json` 到服务器 `data/` | ☐ |
| 3 | 服务器 Workbench | `cd /www/wwwroot/scoring-system && ./scripts/server-deploy.sh [--with-data]` | ☐ |
| 4 | 浏览器 | 打开 http://8.145.51.48:3000 验证 | ☐ |

---

## 四、首次部署或全量替换班级/用户（清空 Seed 再导入）

当需要**清空服务器现有班级/用户，再完整使用本地结构**时：

### 本机

1. `npm run deploy:push`（或手动推送 + 导出）。
2. 将 `data/classes-users.json` 上传到服务器 `/www/wwwroot/scoring-system/data/`。

### 服务器（Workbench）

一条命令完成部署 + 清空 + 导入：
```bash
cd /www/wwwroot/scoring-system
./scripts/server-deploy.sh --with-data
```

（无需再单独执行 `data:clear-seed` 和 `data:import`。）

导入后所有用户登录锁定状态会被重置。

---

## 五、生产环境准备检查

部署后建议确认：

| 检查项 | 说明 |
|--------|------|
| 环境变量 | 服务器 `www/wwwroot/scoring-system/.env` 中 `DATABASE_URL` 指向生产库（如 `file:./prisma/prod.db`），`NEXTAUTH_URL` 为生产地址（如 `http://8.145.51.48:3000`），`NEXTAUTH_SECRET` 已设置 |
| 数据库 | 生产库路径与 `.env` 一致，迁移已执行（`server-deploy.sh` 内含 `prisma migrate deploy`） |
| 进程 | `pm2 list` 中 `scoring-system` 为 online，`pm2 logs scoring-system` 无持续报错 |
| 端口 | 应用监听 3000，Nginx 已反向代理到 80/443（按实际配置） |
| 权限 | 项目目录归属与运行用户一致（避免 EACCES，例如 `sudo chown -R admin:admin /www/wwwroot/scoring-system`） |

---

## 服务器信息速查

| 项目 | 值 |
|------|-----|
| 地址 | 8.145.51.48 |
| 项目路径 | `/www/wwwroot/scoring-system/` |
| PM2 进程名 | `scoring-system` |
| 应用端口 | 3000（Nginx 反向代理） |
| 宝塔面板 | http://8.145.51.48:8888 |
| 生产库 | `prisma/prod.db`（不同步，仅服务器本地） |
