# 考勤模块重启指南

> 文档创建：2026-02-17  
> 项目路径：`/Users/seanlee/Desktop/002`  
> 当前状态：模块代码已完成，集成点已断开，导航按钮标记为"开发中"  
> 数据库：6 张考勤表已在 schema 中，迁移文件已存在

---

## 一、当前现状

考勤模块的**所有代码已开发完毕**，包括：

- 18 个前端/API 文件（`src/app/**/attendance/**`、`src/lib/attendance/**`）
- 6 个数据库模型（`PeriodSchedule`、`CourseSlot`、`CourseSwap`、`Student`、`AttendanceRecord`、`FileUploadLog`）
- 数据库迁移文件 `prisma/migrations/20260217115034_add_attendance_module/`
- `SUBJECT_TEACHER` 角色已加入权限体系

为了不影响线上系统，做了以下**隔离处理**：

| 隔离点 | 具体操作 |
|--------|----------|
| 侧边栏导航 | 考勤管理、考勤设置按钮设为 `disabled: true`、`href: "#"`，标签加"（开发中）" |
| 仪表盘 | 移除了 `SUBJECT_TEACHER` 角色的重定向逻辑 |
| 周评页面 | 未集成 W-1 自动计算（W-1 仍为手动选择） |
| 班主任仪表盘 | 未集成考勤摘要卡片 |

**结果：** 线上系统完全不受影响，考勤模块代码静默存在于项目中。

---

## 二、重启步骤（Git 功能分支）

### 2.1 创建功能分支

```bash
# 在 002 项目目录下执行
cd /Users/seanlee/Desktop/002

# 确保当前在主分支且代码已提交
git checkout main
git status  # 确认没有未提交的更改

# 创建考勤功能分支
git checkout -b feature/attendance
```

> **为什么用分支？** 主分支（main）是部署到服务器的版本，始终保持稳定。所有考勤开发在 `feature/attendance` 分支上进行，互不干扰。

### 2.2 恢复 4 个集成点

以下是需要恢复的 4 处精确改动。每处都标注了文件路径、当前代码和目标代码。

---

#### 集成点 1：侧边栏导航（启用按钮）

**文件：** `src/components/sidebar-nav.tsx`

**当前代码（第 43-48 行，dashboard roles 数组）：**

```typescript
{
  label: t("nav.dashboard"),
  href: "/",
  icon: LayoutDashboard,
  roles: ["ADMIN", "GRADE_LEADER", "CLASS_TEACHER"],
},
```

**改为：**

```typescript
{
  label: t("nav.dashboard"),
  href: "/",
  icon: LayoutDashboard,
  roles: ["ADMIN", "GRADE_LEADER", "CLASS_TEACHER", "SUBJECT_TEACHER"],
},
```

> 让 SUBJECT_TEACHER 角色也能看到仪表盘入口。

**当前代码（第 98-111 行，两个 disabled 按钮）：**

```typescript
{
  label: t("nav.attendance") + t("nav.devTag"),
  href: "#",
  icon: UserCheck,
  roles: ["ADMIN", "GRADE_LEADER"],
  disabled: true,
},
{
  label: t("nav.attendanceSetup") + t("nav.devTag"),
  href: "#",
  icon: Settings2,
  roles: ["ADMIN"],
  disabled: true,
},
```

**改为：**

```typescript
{
  label: t("nav.attendance"),
  href: "/attendance",
  icon: UserCheck,
  roles: ["ADMIN", "GRADE_LEADER", "SUBJECT_TEACHER"],
},
{
  label: t("nav.attendanceSetup"),
  href: "/attendance/setup",
  icon: Settings2,
  roles: ["ADMIN"],
},
```

> 去掉"（开发中）"后缀，恢复真实链接，去掉 `disabled: true`。SUBJECT_TEACHER 加入考勤管理的可见角色。

---

#### 集成点 2：周评 API（W-1 自动计算）

**文件：** `src/app/api/weekly-review/route.ts`

**在 GET 函数中 `// 如果指定了 classId，计算 W-5 建议` 这行之前，插入以下逻辑：**

```typescript
// === W-1 考勤自动计算 ===
let w1Auto: Record<string, string> = {};
if (classes.length > 0) {
  for (const cls of classes) {
    try {
      const absences = await prisma.attendanceRecord.count({
        where: {
          classId: cls.id,
          date: { gte: week.startDate, lte: week.endDate },
          status: "absent",
          courseSlot: { isOutdoor: true },
        },
      });
      w1Auto[cls.id] = absences === 0 ? "0" : absences === 1 ? "1" : "gte2";
    } catch {
      // 考勤表未初始化时不报错，回退到手动模式
    }
  }
}
```

**在返回的 JSON 中加入 `w1Auto` 字段：**

```typescript
return NextResponse.json({
  week,
  weekParam,
  weeklyItems,
  classes: classData,
  gradeSuggestion,
  deadlineInfo,
  w1Auto,  // 新增
});
```

---

#### 集成点 3：周评前端页面（W-1 自动填入）

**文件：** `src/app/(dashboard)/weekly-review/page.tsx`

**第一步：在 `ApiResponse` 接口中加入 `w1Auto` 字段：**

```typescript
interface ApiResponse {
  week: WeekInfo;
  weekParam: string;
  weeklyItems: WeeklyItem[];
  classes: ClassData[];
  gradeSuggestion?: GradeSuggestion | null;
  deadlineInfo?: DeadlineInfo | null;
  w1Auto?: Record<string, string>;  // 新增
}
```

**第二步：在初始化 formValues 的 useEffect 中，对 W-1 项使用自动值：**

找到这段代码：

```typescript
initial[item.id] = {
  optionValue: record?.optionValue ?? "",
  comment: record?.comment ?? "",
};
```

改为：

```typescript
const autoW1Value = (item.code === "W-1" && selectedClass && data?.w1Auto?.[selectedClass.id])
  ? data.w1Auto[selectedClass.id]
  : null;
initial[item.id] = {
  optionValue: record?.optionValue ?? autoW1Value ?? "",
  comment: record?.comment ?? "",
};
```

**第三步：在 W-1 选项按钮旁显示自动计算标签（可选）：**

```tsx
{item.code === "W-1" && data?.w1Auto?.[selectedClass!.id] && (
  <Chip size="sm" variant="flat" classNames={{ base: "bg-blue-500/10", content: "text-blue-400 text-xs" }}>
    考勤自动计算
  </Chip>
)}
```

---

#### 集成点 4：班主任仪表盘（考勤摘要卡片）

**文件：** `src/app/(dashboard)/_components/class-teacher-view.tsx`

在"今日检查记录"卡片之前，插入室外课考勤摘要卡片：

```tsx
{/* 今日室外课考勤摘要 */}
<HCard className="bg-v-card border border-v-border">
  <HCardHeader className="px-6 pt-5 pb-3">
    <h3 className="text-base font-semibold text-v-text1">
      今日室外课出勤
    </h3>
  </HCardHeader>
  <HCardBody className="px-6 pb-5">
    {/* 调用 /api/attendance/class-summary 获取数据并渲染 */}
    {/* 显示：已考勤课程数/总课程数、缺勤学生列表 */}
  </HCardBody>
</HCard>
```

> 这个卡片需要调用 `/api/attendance/class-summary` API（已开发完毕）。具体渲染逻辑在重启开发时补充完善。

---

#### （可选）集成点 5：SUBJECT_TEACHER 仪表盘重定向

**文件：** `src/app/(dashboard)/page.tsx`

如果希望 SUBJECT_TEACHER 登录后直接跳转到考勤页面，在角色判断之后、return 之前添加：

```typescript
if (role === "SUBJECT_TEACHER") {
  window.location.href = "/attendance";
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center text-v-text3">{tc("loading")}</div>
    </div>
  );
}
```

---

### 2.3 运行数据库迁移

```bash
# 如果是全新数据库，需要执行迁移
npx prisma migrate deploy

# 如果迁移已应用过（本地开发库），跳过此步
npx prisma migrate status  # 检查状态
```

### 2.4 安装依赖

```bash
# xlsx 库（Excel 解析）应该已在 package.json 中
npm install
```

### 2.5 本地验证

```bash
# 类型检查
npx tsc --noEmit

# 构建测试
npx next build

# 本地运行
npm run dev
```

验证清单：

- [ ] ADMIN 登录：侧边栏出现"考勤管理"和"考勤设置"
- [ ] 考勤设置页面：能上传三张表（作息表、课程表、任课表）
- [ ] SUBJECT_TEACHER 登录：能看到今日待考勤课程
- [ ] 考勤录入：能选择学生并保存出勤状态
- [ ] 周评页面：W-1 项自动填入考勤计算值
- [ ] 班主任仪表盘：显示当日室外课考勤摘要

### 2.6 合并上线

```bash
# 确认一切正常后，合并到主分支
git checkout main
git merge feature/attendance

# 推送到服务器
git push origin main
```

---

## 三、考勤模块文件清单

### 3.1 前端页面

| 文件路径 | 功能 |
|---------|------|
| `src/app/(dashboard)/attendance/page.tsx` | 教师考勤录入主页 |
| `src/app/(dashboard)/attendance/setup/page.tsx` | 管理员考勤设置（上传三表） |
| `src/app/(dashboard)/attendance/students/page.tsx` | 学生名册管理 |
| `src/app/(dashboard)/attendance/overview/page.tsx` | 考勤概览仪表盘 |
| `src/app/(dashboard)/attendance/records/page.tsx` | 考勤记录查询 |

### 3.2 API 路由

| 文件路径 | 方法 | 功能 |
|---------|------|------|
| `src/app/api/attendance/route.ts` | GET/POST | 教师获取今日课程 / 提交考勤 |
| `src/app/api/attendance/upload/route.ts` | POST | 上传 Excel 文件并预览解析 |
| `src/app/api/attendance/import/route.ts` | POST | 确认导入解析数据到数据库 |
| `src/app/api/attendance/setup/route.ts` | GET | 获取考勤配置状态 |
| `src/app/api/attendance/students/route.ts` | GET/POST/PUT/DELETE | 学生 CRUD |
| `src/app/api/attendance/students/batch/route.ts` | POST | 批量创建学生 |
| `src/app/api/attendance/records/route.ts` | GET | 查询考勤记录 |
| `src/app/api/attendance/swap/route.ts` | GET/POST | 调课/代课管理 |
| `src/app/api/attendance/w1-score/route.ts` | GET | W-1 自动计算 |
| `src/app/api/attendance/overview/route.ts` | GET | 管理员考勤概览 |
| `src/app/api/attendance/class-summary/route.ts` | GET | 班主任班级考勤摘要 |

### 3.3 工具库

| 文件路径 | 功能 |
|---------|------|
| `src/lib/attendance/xlsx-parser.ts` | Excel 文件解析（作息表、课程表、任课表） |
| `src/lib/attendance/time-matcher.ts` | 北京时间工具（匹配当前课节、判断课程状态） |

### 3.4 数据库模型

| 模型名 | 作用 |
|--------|------|
| `PeriodSchedule` | 作息时间表（几点到几点是第几节） |
| `CourseSlot` | 课程格子（哪个班、周几、第几节、什么课、谁教） |
| `CourseSwap` | 调课/代课记录 |
| `Student` | 学生名册 |
| `AttendanceRecord` | 考勤记录（每生每课一条） |
| `FileUploadLog` | 文件上传日志 |

迁移文件：`prisma/migrations/20260217115034_add_attendance_module/migration.sql`

### 3.5 被修改的已有文件

| 文件 | 改动内容 | 是否需要恢复 |
|------|---------|-------------|
| `prisma/schema.prisma` | 添加 6 个 model + User/Class 关联 | 已在主分支中 |
| `src/types/next-auth.d.ts` | role 类型加入 SUBJECT_TEACHER | 已在主分支中 |
| `src/lib/permissions.ts` | 加入 SUBJECT_TEACHER 权限 | 已在主分支中 |
| `src/lib/auth.ts` | authorize 中加入 SUBJECT_TEACHER | 已在主分支中 |
| `package.json` | 加入 xlsx 依赖 | 已在主分支中 |
| `messages/zh.json` / `en.json` | 加入 attendance 命名空间 + devTag | devTag 上线后可删除 |
| `src/components/sidebar-nav.tsx` | 导航项 disabled → 需恢复 | **需恢复（集成点 1）** |
| `src/app/api/weekly-review/route.ts` | 需加入 w1Auto 查询 | **需恢复（集成点 2）** |
| `src/app/(dashboard)/weekly-review/page.tsx` | 需加入 W-1 自动填入 | **需恢复（集成点 3）** |
| `src/app/(dashboard)/_components/class-teacher-view.tsx` | 需加入考勤卡片 | **需恢复（集成点 4）** |
| `src/app/(dashboard)/page.tsx` | 可选加入 SUBJECT_TEACHER 重定向 | **可选（集成点 5）** |

---

## 四、日常操作速查

| 场景 | 命令 |
|------|------|
| 切到考勤分支开发 | `git checkout feature/attendance` |
| 切回主分支（线上版本） | `git checkout main` |
| 查看当前在哪个分支 | `git branch` |
| 本地启动开发 | `npm run dev` |
| 类型检查 | `npx tsc --noEmit` |
| 构建测试 | `npx next build` |
| 合并考勤到主分支 | `git checkout main && git merge feature/attendance` |

---

## 五、注意事项

1. **切分支前先提交代码。** 如果有未保存的修改，切分支会失败或丢失更改。养成习惯：改完 → `git add .` → `git commit -m "说明"` → 再切分支。

2. **不要在 main 分支上直接改考勤代码。** 所有考勤相关的修改都在 `feature/attendance` 分支上进行。

3. **主分支可以正常维护。** 在主分支上修 bug、加日常功能都不影响考勤分支。合并时 Git 会自动处理。

4. **数据库是共享的。** 本地开发时，两个分支用的是同一个 SQLite 文件。考勤表的数据不会因为切分支而消失——只是主分支的代码不会去读写它们。

5. **`devTag` 翻译上线后清理。** 考勤模块正式上线后，从 `messages/zh.json` 和 `messages/en.json` 中删除 `"devTag": "（开发中）"` 这行。

6. **测试账号。** 之前创建过 SUBJECT_TEACHER 测试账号（用户名在导入任课表时自动生成）。如需新建，可在管理后台"用户管理"中手动添加角色为 SUBJECT_TEACHER 的用户。
