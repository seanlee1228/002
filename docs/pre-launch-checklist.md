# 上线前最后一天本地测试清单

执行时在对应项打勾；未通过项在「问题记录」中写明现象与决策。

---

## 一、代码一致性

| 步骤 | 命令/动作 | 通过标准 | □ |
|------|-----------|----------|---|
| Lint | `npm run lint` | 0 error | |
| 类型与构建 | `npm run build` | 成功（含 prisma generate + migrate deploy + next build） | |

---

## 二、可靠性

| 步骤 | 内容 | 通过标准 | □ |
|------|------|----------|---|
| 迁移 | `prisma/migrations` | build 时 migrate deploy 无报错 | |
| 数据库 | SQLite | 无 dev.db-journal 残留锁库 | |
| E2E | `npx playwright test`（dev 已起） | 全部 spec 通过 | |

---

## 三、安全性抽查

| 步骤 | 内容 | 通过标准 | □ |
|------|------|----------|---|
| API 认证 | 写操作接口 | 未登录返回 401，抽查 3～5 个 | |
| 权限 | GRADE_LEADER | 不可改 ADMIN/其他 GRADE_LEADER | |
| 响应体 | 用户 API | 无 hashedPassword/password | |
| 环境变量 | `.env` / `src/lib/env.ts` | DATABASE_URL、NEXTAUTH_* 已填且启动无报错 | |
| 输入校验 | POST/PUT body | 失败返回 400，抽查 1～2 个 | |

---

## 四、本地运行与冲突

| 步骤 | 内容 | 通过标准 | □ |
|------|------|----------|---|
| 环境 | Node ≥20、npm ≥10 | 与 README 一致 | |
| 启动 | `npm run dev` | 编译完成，http://localhost:3000 可访问 | |
| 冒烟 | 登录后侧栏各菜单 | 无白屏、无控制台红错、无接口 500 | |
| Git | `git status` | 计划上线改动已提交或明确故意不提交项 | |
| 依赖 | package.json / lock | 一致；可选 npm audit 无高危 | |

---

## 五、检查完成后：清空测试数据

| 步骤 | 内容 | □ |
|------|------|---|
| 确认 | 当前库为本地/测试库（如 prisma/dev.db） | |
| 执行 | `npm run data:clear-test` | |
| 结果 | 仅清空 7 类记录，班级/用户/结构数据保留 | |

---

## 问题记录

（未通过项：现象、复现步骤、当日是否修复或遗留原因）

| 项 | 现象 | 决策 |
|----|------|------|
|    |      |      |

---

## 上线决策

- [ ] Lint/Build 通过 + E2E 通过 + 关键路径无阻塞性 Bug + 安全抽查无问题 → 具备上线条件
- [ ] 若有遗留问题：已知风险与回滚方案已明确
