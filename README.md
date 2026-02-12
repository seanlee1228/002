# 班级常规评分系统

学校班级常规检查评分管理平台，支持管理员发布每日检查项、值日老师对班级进行评分、班主任查看多维度成绩统计。

## 技术栈

- **框架**: Next.js 16 (App Router)
- **UI**: Tailwind CSS + shadcn/ui
- **数据库**: SQLite + Prisma ORM
- **认证**: NextAuth.js (角色权限管理)
- **图表**: Recharts

## 快速开始（本地运行）

```bash
# 克隆仓库
git clone https://github.com/seanlee1228/002.git
cd 002

# 复制环境变量模板
cp .env.example .env

# 安装依赖
npm install

# 初始化数据库并应用迁移
npx prisma migrate dev

# 播种测试数据
npm run db:seed

# 启动开发服务器
npm run dev
```

打开 http://localhost:3000 访问系统。

## 在线部署（Vercel）

本项目支持通过 Vercel 一键部署：

1. Fork 或导入本仓库到 [Vercel](https://vercel.com)
2. 在 Vercel 项目设置中添加环境变量：
   - `DATABASE_URL` = `file:./dev.db`
   - `NEXTAUTH_SECRET` = 自定义密钥
   - `NEXTAUTH_URL` = Vercel 分配的域名（如 `https://your-app.vercel.app`）
3. 点击 Deploy，构建时会自动执行数据库迁移和种子数据播种

> **注意**: SQLite 在 Vercel Serverless 环境下为只读模式，适合演示展示。如需完整读写功能，建议切换到云数据库（如 Vercel Postgres）。

## 测试账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | 123456 |
| 值日老师 | zhanglaoshi | 123456 |
| 值日老师 | lilaoshi | 123456 |
| 班主任 | teacher1 ~ teacher12 | 123456 |

## 角色功能

### 管理员 (ADMIN)
- 仪表盘：查看全校数据概览、评分进度、趋势图表
- 检查项管理：创建/编辑/删除每日检查项目
- 今日评分：对班级进行评分
- 成绩查看：查看全校/指定班级的成绩数据
- 班级管理：管理班级信息
- 用户管理：管理系统用户

### 值日老师 (DUTY_TEACHER)
- 仪表盘：查看今日检查项和评分进度
- 今日评分：选择班级逐项评分

### 班主任 (CLASS_TEACHER)
- 仪表盘：查看本班今日得分和本周趋势
- 成绩查看：今日 / 本周 / 本学期 / 本学年 多维度数据

## 稳定性测试

项目包含 200 个工作日的数据注入稳定性测试脚本：

```bash
# 启动 dev server 后运行
npm run test:stability
```

测试报告输出到 `tests/stability-report.md`。
