# 部署步骤（每次部署按此执行）

生产环境：阿里云轻量服务器 8.145.51.48，项目路径 `/www/wwwroot/scoring-system/`。

**约定：凡在本机执行的命令，均需先进入项目根目录。**

---

## 一、自动部署（推荐，配置一次后零手动操作）

配置完成后：你在 Cursor 中说「部署」，或本地执行 `npm run deploy:push`，代码推送到 GitHub 后**服务器会自动部署**，无需再打开 Workbench 执行任何命令。

### 一次性配置（仅首次）

#### 1. 服务器安装 git 并确认脚本存在

在 **阿里云 Workbench** 终端执行：

```bash
sudo dnf install -y git
# 若 dnf 不可用，试: sudo yum install -y git

cd /www/wwwroot/scoring-system
git pull origin main
# 拉取后 scripts/server-deploy.sh 应存在
ls scripts/server-deploy.sh
```

若项目最初不是用 git clone 部署的，需先初始化并关联远程：

```bash
cd /www/wwwroot/scoring-system
git init
git remote add origin https://github.com/seanlee1228/002.git
git fetch origin main
git reset --hard origin/main
```

#### 2. 服务器 .env 添加 Webhook 相关变量

编辑 `/www/wwwroot/scoring-system/.env`，添加（密钥请自设随机字符串，如 `openssl rand -hex 32`）：

```
DEPLOY_WEBHOOK_SECRET=你生成的随机密钥
DEPLOY_PROJECT_PATH=/www/wwwroot/scoring-system
```

#### 3. 部署含 Webhook 的代码（首次手动触发一次）

本机：

```bash
cd /Users/seanlee/Desktop/00-Cursor与AI工具/开发项目/class-routine-score-system
npm run deploy:push
```

服务器 Workbench（**仅此一次**）：

```bash
cd /www/wwwroot/scoring-system
git pull origin main
npm run build
pm2 restart scoring-system
```

#### 4. 配置 GitHub Webhook

- 打开 https://github.com/seanlee1228/002/settings/hooks
- **Add webhook**
- Payload URL: `http://8.145.51.48:3000/api/deploy-webhook`（若使用 Nginx 反向代理 80，可改为 `http://8.145.51.48/api/deploy-webhook`）
- Content type: `application/json`
- Secret: 与 `.env` 中 `DEPLOY_WEBHOOK_SECRET` **完全一致**
- 勾选 "Just the push event" 或保留默认
- Add webhook

### 日常部署（零手动操作）

在 Cursor 中说「部署」，或在本机项目根执行：

```bash
cd /Users/seanlee/Desktop/00-Cursor与AI工具/开发项目/class-routine-score-system
npm run deploy:push
```

推送后 GitHub 会触发 Webhook，约 30 秒内服务器自动完成 `git pull` → `npm install` → `npm run build` → `pm2 restart`。

**同步班级/用户数据**：仍需手动上传 `data/classes-users.json` 到服务器 `data/` 目录，并在 Workbench 执行一次 `./scripts/server-deploy.sh --with-data`（或后续可扩展 Webhook 支持该场景）。

---

## 二、手动部署（未配置 Webhook 时）

### 本机（先 cd 到项目根）

```bash
cd /Users/seanlee/Desktop/00-Cursor与AI工具/开发项目/class-routine-score-system
npm run deploy:push
```

### 服务器（Workbench 终端）

```bash
cd /www/wwwroot/scoring-system
git pull origin main
./scripts/server-deploy.sh
```

若需替换班级/用户：先上传 `data/classes-users.json` 到 `data/`，再执行 `./scripts/server-deploy.sh --with-data`。

---

## 三、常见报错

| 报错 | 原因 | 处理 |
|------|------|------|
| `ENOENT ... package.json` | 本机当前目录不是项目根 | 先 `cd` 到项目根再执行 |
| `git: command not found` | 服务器未安装 git | `sudo dnf install -y git` 或 `sudo yum install -y git` |
| `No such file or directory`（server-deploy.sh） | 服务器代码未拉取到最新 | `git pull origin main` 后重试 |
| `Permission denied` | 脚本或目录权限问题 | `sudo chown -R admin:admin /www/wwwroot/scoring-system` |

---

## 四、生产环境检查

| 检查项 | 说明 |
|--------|------|
| 环境变量 | `.env` 中 `DATABASE_URL`、`NEXTAUTH_URL`、`NEXTAUTH_SECRET` 已设置；启用 Webhook 时需加 `DEPLOY_WEBHOOK_SECRET`、`DEPLOY_PROJECT_PATH` |
| Git | 服务器已安装 `git`，项目目录为 git 仓库且已关联 `origin` |
| 进程 | `pm2 list` 中 `scoring-system` 为 online |
| 端口 | 应用监听 3000，Nginx 已反向代理 |

---

## 五、服务器信息速查

| 项目 | 值 |
|------|-----|
| 地址 | 8.145.51.48 |
| 项目路径 | `/www/wwwroot/scoring-system/` |
| PM2 进程名 | `scoring-system` |
| 应用端口 | 3000 |
| 宝塔面板 | http://8.145.51.48:8888 |
