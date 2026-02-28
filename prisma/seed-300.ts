import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// =============== 固定检查项定义 ===============

const DAILY_ITEMS = [
  { code: "D-1", title: "教室卫生与整理", description: "地面无可见垃圾/污渍，黑板擦净；桌椅偏离不超过1/3，清洁工具和体育器材定点归位", sortOrder: 1, planCategory: "resident" as const },
  { code: "D-2", title: "包干区卫生", description: "教室外包干区域（走廊、楼梯等）地面无垃圾，墙面无明显人为污损", sortOrder: 2, planCategory: "resident" as const },
  { code: "D-3", title: "课前准备", description: "铃响后1分钟内全班就座安静，走动或聊天人数不超过2人", sortOrder: 3, planCategory: "rotating" as const },
  { code: "D-4", title: "课堂纪律", description: "趴桌、转身聊天、随意插话等违纪行为人数不超过2人", sortOrder: 4, planCategory: "rotating" as const },
  { code: "D-5", title: "课间安全", description: "走廊、楼梯、教室内无奔跑追逐、推搡、攀爬栏杆等危险行为（操场正常活动不计）", sortOrder: 5, planCategory: "rotating" as const },
  { code: "D-6", title: "眼保健操", description: "音乐响后全班安静，睁眼或讲话人数不超过2人", sortOrder: 6, planCategory: "rotating" as const },
  { code: "D-7", title: "课间操", description: "铃响后3分钟内集合完毕，队列安静整齐，动作明显不到位人数不超过全班1/5", sortOrder: 7, planCategory: "rotating" as const },
  { code: "D-8", title: "文明礼仪", description: "着装整洁，按要求穿校服（校服日）；见师长能主动问好；同学间无骂人、起外号等不文明言行", sortOrder: 8, planCategory: "rotating" as const },
  { code: "D-9", title: "放学及路队秩序", description: "路队整齐安静，无学生无故逗留；教室已断电、关窗、关门", sortOrder: 9, planCategory: "rotating" as const },
];

const WEEKLY_ITEMS = [
  { code: "W-1", title: "室外课出勤", description: "统计室外课未提前请假且无事后补假的缺勤人次：0人次 / 1人次 / ≥2人次", sortOrder: 1 },
  { code: "W-2", title: "当周安全事故记录", description: "记录需送医务室及以上处理的安全事故起数及处理情况", sortOrder: 2 },
  { code: "W-3", title: "当周学生冲突记录", description: "记录需教师介入处理或已上报的学生冲突事件", sortOrder: 3 },
  { code: "W-4", title: "当周家长有效反馈/投诉", description: "记录家长通过正式渠道提出的需学校回应或处理的诉求", sortOrder: 4 },
  { code: "W-5", title: "本周班级整体运行等级", description: "A(卓越)：达标率≥90%且无严重/一般不达标，W-1~W-4均为0；B(良好)：达标率70%~89%，单项≤1起；C(预警)：达标率<70%或有严重不达标或任一≥2起", sortOrder: 5 },
];

// 动态临增项标题池
const DYNAMIC_TITLES = [
  "课桌整理", "午餐纪律", "节能环保", "红领巾佩戴",
  "垃圾分类", "图书角整理", "校服穿着", "作业提交",
  "升旗仪式纪律", "课间操纪律", "实验室安全", "美术教室整理",
  "水杯摆放", "书包柜整理", "课间文明", "节约用水",
];

// =============== 学校日历（定义学期区间） ===============

const SCHOOL_PERIODS = [
  { start: "2024-09-02", end: "2025-01-17", semester: "2024-2025学年第一学期" },
  { start: "2025-02-17", end: "2025-06-30", semester: "2024-2025学年第二学期" },
  { start: "2025-09-01", end: "2026-01-16", semester: "2025-2026学年第一学期" },
  { start: "2026-02-09", end: "2026-02-14", semester: "2025-2026学年第二学期" },
];

// =============== 检查项难度系数（越高越难达标） ===============

const ITEM_DIFFICULTY: Record<string, number> = {
  "D-1": 0.08,  // 教室卫生与整理
  "D-2": 0.12,  // 包干区卫生
  "D-3": 0.18,  // 课前准备
  "D-4": 0.22,  // 课堂纪律
  "D-5": 0.25,  // 课间安全
  "D-6": 0.10,  // 眼保健操
  "D-7": 0.16,  // 课间操
  "D-8": 0.08,  // 文明礼仪
  "D-9": 0.14,  // 放学及路队秩序
};

// =============== 班级基础品质分 ===============

function getClassBaseQuality(grade: number, section: number): number {
  const qualities: Record<string, number> = {
    "1-1": 0.88, "1-2": 0.82, "1-3": 0.75, "1-4": 0.80,
    "2-1": 0.85, "2-2": 0.90, "2-3": 0.78, "2-4": 0.72,
    "3-1": 0.92, "3-2": 0.83, "3-3": 0.70, "3-4": 0.86,
  };
  return qualities[`${grade}-${section}`] ?? 0.80;
}

// =============== 工具函数 ===============

function getDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function isFriday(date: Date): boolean {
  return date.getDay() === 5;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// =============== 可复现随机数生成器 ===============

class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    this.seed = (this.seed * 16807 + 0) % 2147483647;
    return this.seed / 2147483647;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(arr: T[], n: number): T[] {
    const shuffled = [...arr].sort(() => this.next() - 0.5);
    return shuffled.slice(0, Math.min(n, arr.length));
  }
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

// =============== 达标率计算 ===============

function computePassRate(
  rng: SeededRandom,
  classQuality: number,
  itemDifficulty: number,
  dayOfWeek: number,
  dayIndex: number,
  totalDays: number,
): number {
  let rate = classQuality;

  // 检查项难度惩罚
  rate -= itemDifficulty;

  // 时间趋势：随学期进展轻微改善 (+5%)
  rate += 0.05 * (dayIndex / totalDays);

  // 星期效应：周一/周五略差
  if (dayOfWeek === 1) rate -= 0.03;
  if (dayOfWeek === 5) rate -= 0.02;

  // 随机噪声
  rate += (rng.next() - 0.5) * 0.06;

  return Math.max(0.40, Math.min(0.98, rate));
}

// =============== 主函数 ===============

async function main() {
  const rng = new SeededRandom(42);
  const startTime = Date.now();

  console.log("🌱 开始播种 300 天模拟数据...\n");

  // ===== 1. 清理现有数据 =====
  console.log("🗑️  清理现有数据...");
  await prisma.aiAnalysis.deleteMany();
  await prisma.aiModuleConfig.deleteMany();
  await prisma.checkRecord.deleteMany();
  await prisma.dailyPlanItem.deleteMany();
  await prisma.dailyPlan.deleteMany();
  await prisma.checkItem.deleteMany();
  await prisma.user.deleteMany();
  await prisma.class.deleteMany();
  await prisma.semester.deleteMany();
  console.log("✅ 清理完成\n");

  // ===== 2. 学期 =====
  await prisma.semester.createMany({
    data: [
      { name: "2024-2025学年第一学期", startDate: "2024-09-02", endDate: "2025-01-17", isCurrent: false },
      { name: "2024-2025学年第二学期", startDate: "2025-02-17", endDate: "2025-06-30", isCurrent: false },
      { name: "2025-2026学年第一学期", startDate: "2025-09-01", endDate: "2026-01-16", isCurrent: false },
      { name: "2025-2026学年第二学期", startDate: "2026-02-09", endDate: "2026-07-10", isCurrent: true },
    ],
  });
  console.log("✅ 4 个学期创建完成");

  // ===== 3. 班级 =====
  const classes = [];
  for (let grade = 1; grade <= 3; grade++) {
    for (let section = 1; section <= 4; section++) {
      const cls = await prisma.class.create({
        data: { name: `${grade}年级${section}班`, grade, section },
      });
      classes.push(cls);
    }
  }
  console.log(`✅ ${classes.length} 个班级创建完成`);

  // ===== 4. 用户 =====
  const hashedPassword = await bcrypt.hash("123456", 10);

  const admin = await prisma.user.create({
    data: { name: "系统管理员", username: "admin", password: hashedPassword, role: "ADMIN" },
  });

  const dutyTeachers = [];
  const dtData = [
    { name: "张老师", username: "zhanglaoshi", managedGrade: 1 },
    { name: "李老师", username: "lilaoshi", managedGrade: 2 },
    { name: "何老师", username: "helaoshi", managedGrade: 3 },
  ];
  for (const dt of dtData) {
    const teacher = await prisma.user.create({
      data: { ...dt, password: hashedPassword, role: "DUTY_TEACHER" },
    });
    dutyTeachers.push(teacher);
  }

  const gradeLeaders = [];
  for (let grade = 1; grade <= 3; grade++) {
    const leader = await prisma.user.create({
      data: {
        name: `${grade === 1 ? "一" : grade === 2 ? "二" : "三"}年级负责人`,
        username: `grade${grade}`,
        password: hashedPassword,
        role: "GRADE_LEADER",
        managedGrade: grade,
      },
    });
    gradeLeaders.push(leader);
  }

  const teacherNames = ["王老师","赵老师","刘老师","陈老师","杨老师","黄老师","周老师","吴老师","徐老师","孙老师","马老师","朱老师"];
  for (let i = 0; i < classes.length; i++) {
    await prisma.user.create({
      data: { name: teacherNames[i], username: `teacher${i + 1}`, password: hashedPassword, role: "CLASS_TEACHER", classId: classes[i].id },
    });
  }
  console.log("✅ 用户创建完成");

  // ===== 5. 固定检查项 =====
  const dailyCheckItems = [];
  for (const item of DAILY_ITEMS) {
    const ci = await prisma.checkItem.create({
      data: { code: item.code, module: "DAILY", title: item.title, description: item.description, sortOrder: item.sortOrder, isDynamic: false, planCategory: item.planCategory },
    });
    dailyCheckItems.push(ci);
  }

  const weeklyCheckItems = [];
  for (const item of WEEKLY_ITEMS) {
    const ci = await prisma.checkItem.create({
      data: { code: item.code, module: "WEEKLY", title: item.title, description: item.description, sortOrder: item.sortOrder, isDynamic: false },
    });
    weeklyCheckItems.push(ci);
  }
  console.log(`✅ ${dailyCheckItems.length + weeklyCheckItems.length} 个固定检查项创建完成`);

  // ===== 6. 收集所有教学日 =====
  const schoolDays: Date[] = [];
  for (const period of SCHOOL_PERIODS) {
    let current = parseDate(period.start);
    const end = parseDate(period.end);
    while (current <= end) {
      if (isWeekday(current)) {
        schoolDays.push(new Date(current));
      }
      current = addDays(current, 1);
    }
  }
  console.log(`📅 共 ${schoolDays.length} 个教学日（横跨 ${SCHOOL_PERIODS.length} 个学期）\n`);

  // ===== 7. 生成日评数据 =====
  let planCount = 0;
  let recordCount = 0;
  let dynamicCount = 0;
  let weeklyCount = 0;
  const fridaysProcessed = new Set<string>();
  const totalDays = schoolDays.length;
  const BATCH_SIZE = 500;
  let recordBatch: Array<{
    date: string;
    passed: boolean | null;
    severity: string | null;
    optionValue: string | null;
    comment: string | null;
    classId: string;
    checkItemId: string;
    scoredById: string;
  }> = [];

  async function flushRecords() {
    if (recordBatch.length === 0) return;
    await prisma.checkRecord.createMany({ data: recordBatch });
    recordCount += recordBatch.length;
    recordBatch = [];
  }

  const failComments = ["有待改进", "需要加强", "情况一般", "请班主任关注", "已通知班级"];

  for (let dayIdx = 0; dayIdx < schoolDays.length; dayIdx++) {
    const date = schoolDays[dayIdx];
    const dateStr = getDateStr(date);
    const dayOfWeek = date.getDay();

    // 每 50 天输出进度
    if (dayIdx % 50 === 0) {
      await flushRecords();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  📊 进度 ${dayIdx + 1}/${totalDays} (${dateStr}) [${elapsed}s]`);
    }

    // 从 D-1~D-9 中随机选 3~5 个作为当日计划
    const planItemCount = rng.int(3, 5);
    const selectedItems = rng.pick(dailyCheckItems, planItemCount);

    // ~12% 概率添加动态临增项
    let dynamicItem = null;
    if (rng.chance(0.12)) {
      const title = DYNAMIC_TITLES[rng.int(0, DYNAMIC_TITLES.length - 1)];
      dynamicItem = await prisma.checkItem.create({
        data: {
          module: "DAILY",
          title,
          description: "临时增加的检查项",
          sortOrder: 9,
          isDynamic: true,
          date: dateStr,
          createdBy: admin.id,
        },
      });
      dynamicCount++;
    }

    // 创建每日计划
    await prisma.dailyPlan.create({
      data: {
        date: dateStr,
        createdById: admin.id,
        items: {
          create: [
            ...selectedItems.map((item, idx) => ({
              checkItemId: item.id,
              sortOrder: idx + 1,
            })),
            ...(dynamicItem
              ? [{ checkItemId: dynamicItem.id, sortOrder: selectedItems.length + 1 }]
              : []),
          ],
        },
      },
    });
    planCount++;

    // 为每个班级的每个计划项创建检查记录
    const allPlanItems = [...selectedItems, ...(dynamicItem ? [dynamicItem] : [])];
    for (const cls of classes) {
      const scorer = dutyTeachers[cls.grade - 1] || dutyTeachers[0];
      const classQuality = getClassBaseQuality(cls.grade, cls.section);

      for (const item of allPlanItems) {
        const difficulty = ITEM_DIFFICULTY[item.code ?? ""] ?? 0.18;
        const passRate = computePassRate(rng, classQuality, difficulty, dayOfWeek, dayIdx, totalDays);
        const passed = rng.chance(passRate);

        let severity: string | null = null;
        if (!passed) {
          const r = rng.next();
          severity = r < 0.50 ? "minor" : r < 0.85 ? "moderate" : "serious";
        }

        recordBatch.push({
          date: dateStr,
          passed,
          severity,
          optionValue: null,
          comment: passed ? null : failComments[rng.int(0, failComments.length - 1)],
          classId: cls.id,
          checkItemId: item.id,
          scoredById: scorer.id,
        });
      }
    }

    // 批量刷入
    if (recordBatch.length >= BATCH_SIZE) {
      await flushRecords();
    }

    // ===== 周五：周评数据 =====
    if (isFriday(date) && !fridaysProcessed.has(dateStr)) {
      fridaysProcessed.add(dateStr);
      const weeklyBatch: typeof recordBatch = [];

      for (const cls of classes) {
        const scorer = gradeLeaders[cls.grade - 1] || gradeLeaders[0];
        const classQuality = getClassBaseQuality(cls.grade, cls.section);

        // W-1: 室外课出勤
        const w1 = rng.chance(classQuality) ? "0" : rng.chance(0.6) ? "1" : "gte2";
        weeklyBatch.push({
          date: dateStr, passed: null, severity: null,
          optionValue: w1, comment: null,
          classId: cls.id, checkItemId: weeklyCheckItems[0].id, scoredById: scorer.id,
        });

        // W-2 ~ W-4: 事件计数
        for (let i = 1; i <= 3; i++) {
          const noEvent = rng.chance(classQuality * 0.9);
          const optionValue = noEvent ? "0" : rng.chance(0.7) ? "1" : "gte2";
          weeklyBatch.push({
            date: dateStr, passed: null, severity: null,
            optionValue,
            comment: optionValue !== "0" ? "已妥善处理" : null,
            classId: cls.id, checkItemId: weeklyCheckItems[i].id, scoredById: scorer.id,
          });
        }

        // W-5: 综合等级
        let overallGrade: string;
        if (classQuality >= 0.85) {
          overallGrade = rng.chance(0.6) ? "A" : "B";
        } else if (classQuality >= 0.75) {
          overallGrade = rng.chance(0.3) ? "A" : rng.chance(0.7) ? "B" : "C";
        } else {
          overallGrade = rng.chance(0.1) ? "A" : rng.chance(0.5) ? "B" : "C";
        }
        weeklyBatch.push({
          date: dateStr, passed: null, severity: null,
          optionValue: overallGrade, comment: null,
          classId: cls.id, checkItemId: weeklyCheckItems[4].id, scoredById: scorer.id,
        });
      }

      await prisma.checkRecord.createMany({ data: weeklyBatch });
      weeklyCount += weeklyBatch.length;
    }
  }

  // 刷入剩余记录
  await flushRecords();

  console.log(`\n✅ ${planCount} 个每日计划创建完成`);
  console.log(`✅ ${dynamicCount} 个动态检查项创建完成`);
  console.log(`✅ ${recordCount} 条日评记录创建完成`);
  console.log(`✅ ${weeklyCount} 条周评记录创建完成 (${fridaysProcessed.size} 个周五)`);

  // ===== 8. AI 模组配置 =====
  const aiModuleDefaults = [
    { scope: "daily-recommend", label: "每日推荐", description: "根据历史数据推荐每日检查项（D-1 ~ D-9 中选 3 项）" },
    { scope: "global", label: "全校综合分析", description: "面向管理员的全校维度综合分析报告" },
    { scope: "grade", label: "年级分析", description: "面向年级组长的年级维度分析（grade-1/2/3 共享配置）" },
    { scope: "duty", label: "值日教师建议", description: "面向值日教师的当日检查建议与注意事项" },
  ];
  for (const mod of aiModuleDefaults) {
    await prisma.aiModuleConfig.create({
      data: {
        scope: mod.scope,
        label: mod.label,
        description: mod.description,
        systemPrompt: "",
        temperature: 0.3,
        maxTokens: 2000,
        model: "deepseek-chat",
        isActive: true,
      },
    });
  }
  console.log(`✅ ${aiModuleDefaults.length} 个 AI 模组默认配置创建完成`);

  // ===== 统计摘要 =====
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n" + "=".repeat(50));
  console.log("📋 数据统计:");
  console.log(`  教学日总数: ${totalDays} 天`);
  console.log(`  日计划: ${planCount} 个`);
  console.log(`  日评记录: ${recordCount} 条`);
  console.log(`  周评记录: ${weeklyCount} 条`);
  console.log(`  动态检查项: ${dynamicCount} 个`);
  console.log(`  总记录数: ${recordCount + weeklyCount} 条`);
  console.log(`  耗时: ${totalElapsed} 秒`);
  console.log("=".repeat(50));

  console.log("\n📋 账号信息:");
  console.log("  管理员: admin / 123456");
  console.log("  年级负责人: grade1 / grade2 / grade3 / 123456");
  console.log("  值日老师: zhanglaoshi(1年级) / lilaoshi(2年级) / helaoshi(3年级) / 123456");
  console.log("  班主任: teacher1 ~ teacher12 / 123456");
  console.log("\n🎉 300 天模拟数据播种完成!");
}

main()
  .catch((e) => {
    console.error("❌ 播种失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
