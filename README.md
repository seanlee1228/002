# 班级常规管理评分系统

面向小学的班级常规管理评分平台，覆盖日常检查、周评、成绩报表、检查计划排期、考勤管理、AI 辅助分析等功能。支持中英双语、深色/浅色主题、移动端适配和 PWA。

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 16.x |
| 前端 | React + TypeScript | React 19, TS 5 |
| UI 组件 | HeroUI (`@heroui/react`) + Lucide Icons | HeroUI 2.8 |
| 样式 | Tailwind CSS 4 + 语义化主题变量 (`v-*`) | — |
| 动画 | Framer Motion | 12.x |
| 图表 | ECharts + Recharts | — |
| ORM | Prisma | 5.22 |
| 数据库 | SQLite | — |
| 认证 | NextAuth.js (Credentials, JWT) | 4.24 |
| 国际化 | next-intl | 4.8 |
| AI | OpenAI SDK → DeepSeek API | — |

## 快速开始

### 前置要求

- Node.js ≥ 20
- npm ≥ 10

### 安装与运行

```bash
# 1. 克隆项目
git clone <repo-url> && cd <project-dir>

# 2. 安装依赖（自动执行 prisma generate）
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填写必要变量（见下方环境变量说明）

# 4. 初始化数据库
npx prisma migrate dev

# 5. 注入种子数据
npm run db:seed

# 6. 启动开发服务器
npm run dev
```

访问 http://localhost:3000

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建（含 migrate deploy） |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | ESLint 检查 |
| `npm run db:seed` | 注入种子数据 |
| `npm run db:seed:300` | 注入 300 天模拟数据 |
| `npm run db:reset` | 重置数据库 |

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | SQLite 数据库路径，如 `file:./dev.db` |
| `NEXTAUTH_SECRET` | ✅ | JWT 签名密钥（随机字符串） |
| `NEXTAUTH_URL` | ✅ | 站点 URL，如 `http://localhost:3000` |
| `DEEPSEEK_API_KEY` | ❌ | DeepSeek AI API Key（AI 分析功能） |
| `AI_CRON_SECRET` | ❌ | AI 定时分析任务密钥 |

新增环境变量时需同步更新 `src/lib/env.ts` 校验。

## 项目结构

```
├── docs/                          # 项目文档
├── messages/                      # 国际化翻译文件（按命名空间拆分）
│   ├── zh/                        #   中文（attendance.json, scoring.json ...）
│   └── en/                        #   英文
├── prisma/
│   ├── schema.prisma              # 数据库模型定义
│   ├── migrations/                # 迁移文件
│   ├── seed.ts                    # 种子数据
│   └── dev.db                     # 开发数据库（不入库）
├── public/
│   ├── icons/                     # PWA 图标
│   └── manifest.json              # PWA 配置
├── scripts/                       # 工具脚本
│   ├── backup-db.sh               #   数据库备份
│   ├── seed-attendance.ts         #   考勤模块测试数据
│   └── upgrade-check-items.ts     #   检查项升级
├── src/
│   ├── app/
│   │   ├── (auth)/login/          # 登录页
│   │   ├── (dashboard)/           # 仪表盘路由组
│   │   │   ├── page.tsx           #   首页仪表盘
│   │   │   ├── scoring/           #   日常评分
│   │   │   ├── daily-plan/        #   检查计划管理
│   │   │   ├── inspection/        #   检查项管理
│   │   │   ├── weekly-review/     #   周评
│   │   │   ├── scores/            #   成绩报表
│   │   │   ├── duty-history/      #   值日历史
│   │   │   ├── attendance/        #   考勤管理
│   │   │   ├── classes/           #   班级管理
│   │   │   ├── users/             #   用户管理
│   │   │   ├── ai-panel/          #   AI 控制面板
│   │   │   ├── server-monitor/    #   服务器监控
│   │   │   ├── _components/       #   仪表盘共享组件
│   │   │   └── _lib/              #   仪表盘共享工具
│   │   ├── api/                   # API 路由（RESTful）
│   │   ├── globals.css            # 全局样式 + 语义化变量
│   │   └── layout.tsx             # 根布局
│   ├── components/                # 全局共享组件
│   │   ├── providers.tsx          #   全局 Provider
│   │   ├── sidebar-nav.tsx        #   侧边栏导航
│   │   ├── locale-provider.tsx    #   国际化 Provider
│   │   ├── locale-toggle.tsx      #   语言切换
│   │   └── theme-toggle.tsx       #   主题切换
│   ├── lib/                       # 核心工具库
│   │   ├── auth.ts                #   NextAuth 配置
│   │   ├── ai-client.ts           #   AI 客户端
│   │   ├── permissions.ts         #   权限控制
│   │   ├── logger.ts              #   系统日志（敏感字段过滤）
│   │   ├── env.ts                 #   环境变量校验
│   │   ├── deadline.ts            #   评分时效控制
│   │   ├── schedule-generator.ts  #   排期生成算法
│   │   ├── school-calendar.ts     #   校历数据
│   │   └── echarts-theme.ts       #   图表主题
│   └── types/
│       └── next-auth.d.ts         #   NextAuth 类型扩展
├── .cursor/rules/                 # Cursor AI 开发规则
├── deploy.sh                      # 自动部署脚本
├── package.json
├── tsconfig.json
└── prisma.config.ts
```

## 开发规范

本项目通过 `.cursor/rules/` 管理 AI 辅助开发规范，以下为核心规则摘要：

### 命名约定

| 对象 | 风格 | 示例 |
|------|------|------|
| 文件/目录 | `kebab-case` | `grade-leader-view.tsx` |
| React 组件 | `PascalCase` | `GradeLeaderView` |
| 函数/变量 | `camelCase` | `getClientIP` |
| 常量 | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| Prisma Model | `PascalCase` 单数 | `User`、`DailyPlan` |
| 翻译 key | `camelCase` | `confirmDelete` |
| 页面私有组件 | `_components/` 目录 | `scoring/_components/` |
| 页面私有工具 | `_lib/` 目录 | `scoring/_lib/` |

### UI 组件规范

- **唯一 UI 库**：HeroUI (`@heroui/react`)，禁止引入 shadcn/ui、Ant Design 等其他组件库
- **样式方案**：Tailwind CSS v4 + 语义化主题变量（`v-*` 前缀）
- **颜色使用**：优先语义化变量（`text-v-text`、`bg-v-card`），禁止硬编码颜色值
- **图标**：统一使用 `lucide-react`

### 国际化（i18n）

- 所有面向用户的文本必须使用 `next-intl` 翻译，禁止硬编码中文
- 翻译文件按命名空间拆分，位于 `messages/zh/` 和 `messages/en/`
- 新增翻译文件后需在 `src/components/locale-provider.tsx` 中注册
- 中英文翻译必须同步更新

### API 路由规范

- 所有 API 路由必须进行认证检查（`getServerSession`）
- 使用 Prisma 参数化查询，禁止拼接 SQL
- 标准状态码：`400`（输入错误）、`401`（未登录）、`403`（无权限）、`404`（不存在）、`500`（服务器错误）
- 响应禁止返回 `hashedPassword` 等敏感字段

### Import 顺序

```tsx
// 1. React / Next.js
import { useState } from "react";

// 2. 第三方库
import { Button } from "@heroui/react";

// 3. 项目内部（@/ 路径）
import { prisma } from "@/lib/prisma";

// 4. 相对路径
import { columns } from "./_lib/columns";

// 5. 类型导入
import type { User } from "@prisma/client";
```

### Git 提交格式

```
<类型>: <中文描述>
```

类型：`feat` | `fix` | `refactor` | `style` | `perf` | `docs` | `chore`

示例：`feat: 新增周报导出功能`、`fix: 修复评分截止时间校验`

## 角色与权限

| 角色 | 说明 | 核心权限 |
|------|------|---------|
| `ADMIN` | 系统管理员 | 全部功能 |
| `GRADE_LEADER` | 年级负责人 | 所负责年级的评分、周评、学生管理 |
| `DUTY_TEACHER` | 值日教师 | 日常评分录入 |
| `CLASS_TEACHER` | 班主任 | 查看本班数据 |
| `SUBJECT_TEACHER` | 科任教师 | 考勤录入 |

## 部署

生产环境使用阿里云轻量服务器 + PM2 + Nginx。

### 部署流程（推荐）

**步骤 1：本机推送代码**

```bash
git add .
git commit -m "feat: 本次更新描述"
git push origin main
```

**步骤 2：服务器 Workbench 执行**

在阿里云控制台 → 远程连接（Workbench）→ 终端中执行：

```bash
cd /www/wwwroot/scoring-system
./scripts/server-deploy.sh
```

脚本自动完成：拉取最新代码 → 安装依赖 → 构建 → PM2 重启。

### 备选方式（SSH 直连可用时）

若本机能通过 SSH 登录服务器，可使用 `expect deploy.sh` 一键部署（打包上传 → 构建 → 重启）。

| 项目 | 值 |
|------|-----|
| 服务器 | 8.145.51.48（Alibaba Cloud Linux 3） |
| 项目路径 | `/www/wwwroot/scoring-system/` |
| 进程管理 | PM2（进程名 `scoring-system`） |
| 反向代理 | Nginx → 127.0.0.1:3000 |
| 管理面板 | 宝塔 Linux 面板 http://8.145.51.48:8888 |
| 数据库 | SQLite `prisma/prod.db` |

> **注意**：`.env` 和 `*.db` 文件不随部署同步，服务器使用独立的生产配置和数据。

## 完整规范文档

| 文件 | 说明 |
|------|------|
| `.cursor/rules/code-standards.mdc` | 代码基础规范（命名、Import、Git、安全、错误处理） |
| `.cursor/rules/ui-component-standards.mdc` | UI 组件规范（HeroUI + 语义化变量） |
| `.cursor/rules/api-route-standards.mdc` | API 路由规范（认证、验证、日志） |
| `.cursor/rules/i18n-bilingual-sync.mdc` | 国际化双语同步规则 |
| `docs/technical-manual.md` | 开发运维技术手册（详细） |
