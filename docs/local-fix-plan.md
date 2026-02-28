# 本地代码一致性修正方案

目标：在**不修改当前班级结构、用户结构**（Prisma 模型与 API 契约）的前提下，修正已发现的一致性与质量问题，确保本地 `npm run lint`、`npm run build`、`npm run dev` 均通过。

---

## 范围与约束

- **可改**：ESLint 报错/警告、重复的 UI 与筛选逻辑、过长的页面逻辑抽取到 `_lib`、类型与导入方式。
- **不改**：`prisma/schema.prisma` 中 Class/User 模型；`/api/classes/*`、`/api/users/*` 的请求/响应结构与业务规则；班级、用户管理页面的数据字段与业务含义。

---

## Phase 1：消除 ESLint 错误（仅 src/ 与 tests）

1. **缩小 Lint 范围**  
   在 `eslint.config.mjs` 中忽略 `_archive/**`、`scripts/**`、`prisma/seed.mts`、`prisma/seed-300.ts`，避免改动归档与种子脚本，专注应用代码。

2. **API 与 lib**  
   - `api/auth/[...nextauth]/route.ts`：`Function` 改为具体类型或 `eslint-disable` 下一行。  
   - `api/inspection/route.ts`：避免对 `module` 赋值（改用其他变量名或封装）。  
   - `api/server-monitor/route.ts`：`require` 改为 `import`。  
   - `api/server-monitor/backup/route.ts`：`any` 改为明确类型。  
   - 其他 API：删除或前缀未使用变量（如 `_request`、`_`）。

3. **组件与页面**  
   - `set-state-in-effect`：在 `theme-toggle`、`locale-provider`、`ai-panel`、`weekly-summary`、`inspector-profile-panel`、`detail-view` 等处，将 effect 内同步 setState 改为 `queueMicrotask`/`startTransition`/或拆成“初始化 + 订阅”等合规写法。  
   - `detail-view`：useMemo 依赖与 React Compiler 提示不一致时，按推荐依赖修正或暂时禁用该规则。  
   - 未使用变量：删除或改为 `_` 前缀；未使用的 eslint-disable 删除。

4. **tests**  
   - `class-teacher-and-subject-teacher.spec.ts`：`let` 改为 `const` 等，消除报错。

**完成标准**：`npm run lint` 在 src/ 与 tests 上 **0 error**（warning 可保留后续处理）。

**状态**：✅ 已完成（已忽略 _archive、scripts、prisma/seed*.ts；API/组件/test 的 15 个 error 已全部修复，当前 0 error、39 warnings）。

---

## Phase 2：抽取重复的年级/班级选择 UI（可选，后续迭代）

- 在 `src/components/` 或 `src/app/(dashboard)/_components/` 中新增：  
  - `GradeSelect`：接收 `selectedKeys`、`onSelectionChange`、`label`、`placeholder`、`gradeOptions`（或从 common 读取），内部使用 `HSelect` + `items` + 渲染函数。  
  - `ClassSelect`：接收班级列表与选中值，同上。  
- 在 **users**、**scores**、**duty-history**、**logs**、**server-monitor** 等页面的筛选/表单中，替换为上述组件，**不改变** 年级/班级的数据来源与含义（仍从现有 API 或 props 传入）。

**完成标准**：相关页面使用统一组件，筛选与表单行为与修正前一致，无新增功能。

---

## Phase 3：验证本地运行

- 执行 `npm run lint` → **0 error**。 ✅
- 执行 `npm run build` → **成功**。 ✅
- 执行 `npm run dev`，浏览器访问登录、班级管理、用户管理、日常评分、成绩报表等，确认无白屏与接口报错。

---

## 执行顺序

按 Phase 1 → Phase 2 → Phase 3 依次执行；每阶段完成后跑一次 lint/build，再进入下一阶段。
