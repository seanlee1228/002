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

const DYNAMIC_TITLES = [
  "课桌整理", "午餐纪律", "节能环保", "红领巾佩戴",
  "垃圾分类", "图书角整理", "校服穿着", "作业提交",
  "升旗仪式纪律", "水杯摆放", "书包柜整理", "课间文明",
];

// =============== 检查项难度系数 ===============

const ITEM_DIFFICULTY: Record<string, number> = {
  "D-1": 0.08, "D-2": 0.12, "D-3": 0.18, "D-4": 0.22,
  "D-5": 0.25, "D-6": 0.10, "D-7": 0.16, "D-8": 0.08, "D-9": 0.14,
};

// =============== 班级基础品质分 ===============

function getClassBaseQuality(grade: number, section: number): number {
  const qualities: Record<string, number> = {
    "1-1": 0.88, "1-2": 0.82, "1-3": 0.75, "1-4": 0.80, "1-5": 0.84,
    "2-1": 0.85, "2-2": 0.90, "2-3": 0.78, "2-4": 0.72, "2-5": 0.86, "2-6": 0.81,
    "3-1": 0.92, "3-2": 0.83, "3-3": 0.70, "3-4": 0.86, "3-5": 0.79, "3-6": 0.88,
    "4-1": 0.87, "4-2": 0.80, "4-3": 0.74, "4-4": 0.91, "4-9": 0.83, "4-10": 0.77,
    "5-1": 0.89, "5-2": 0.76, "5-3": 0.84, "5-4": 0.81, "5-9": 0.72, "5-10": 0.85,
    "6-1": 0.82, "6-2": 0.78, "6-3": 0.86, "6-4": 0.90, "6-5": 0.74,
    "6-6": 0.88, "6-7": 0.80, "6-8": 0.85, "6-9": 0.77, "6-10": 0.83,
  };
  return qualities[`${grade}-${section}`] ?? 0.80;
}

// =============== 值日教师评分时间习惯 ===============
// 每位值日教师有不同的时间偏好，模拟真实行为
// 权重数组 [7时, 8时, 9时, 10时, 11时, 12时, 13时, 14时, 15时, 16时, 17时]

const TEACHER_TIME_PROFILES: Record<string, number[]> = {
  zhanglaoshi: [5, 25, 20, 15, 10, 3, 2, 8, 6, 4, 2],
  lilaoshi:    [2, 12, 15, 12, 8, 3, 5, 15, 14, 10, 4],
  helaoshi:    [1, 8, 10, 8, 5, 2, 6, 18, 22, 15, 5],
  wanglaoshi:  [3, 18, 22, 16, 12, 2, 3, 10, 8, 4, 2],
  sunlaoshi:   [1, 6, 8, 10, 6, 4, 8, 20, 18, 14, 5],
  zhoulaoshi:  [4, 15, 18, 10, 8, 2, 4, 12, 16, 8, 3],
};

// =============== 工具函数 ===============

function getDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

// 可复现随机数生成器
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

// 根据教师时间偏好生成随机评分时间
function generateScoringTime(rng: SeededRandom, date: Date, profile: number[]): Date {
  const totalWeight = profile.reduce((s, w) => s + w, 0);
  let r = rng.next() * totalWeight;
  let hour = 7; // 从7时开始
  for (let i = 0; i < profile.length; i++) {
    r -= profile[i];
    if (r <= 0) { hour = 7 + i; break; }
  }
  // 在选定小时内随机偏移分钟和秒
  const minute = rng.int(0, 59);
  const second = rng.int(0, 59);
  const result = new Date(date);
  result.setHours(hour, minute, second, 0);
  return result;
}

// 达标率计算
function computePassRate(
  rng: SeededRandom, classQuality: number, itemDifficulty: number,
  dayOfWeek: number, dayIndex: number, totalDays: number,
): number {
  let rate = classQuality;
  rate -= itemDifficulty;
  rate += 0.05 * (dayIndex / totalDays);
  if (dayOfWeek === 1) rate -= 0.03;
  if (dayOfWeek === 5) rate -= 0.02;
  rate += (rng.next() - 0.5) * 0.06;
  return Math.max(0.40, Math.min(0.98, rate));
}

// =============== 主函数 ===============

async function main() {
  const rng = new SeededRandom(2026);
  const startTime = Date.now();
  const TOTAL_DAYS = 90;

  console.log(`🌱 开始播种 ${TOTAL_DAYS} 天模拟数据（值日教师视角）...\n`);

  // ===== 1. 清理现有数据 =====
  console.log("🗑️  清理现有数据...");
  await prisma.aiAnalysis.deleteMany();
  await prisma.aiModuleConfig.deleteMany();
  await prisma.checkRecord.deleteMany();
  await prisma.dailyPlanItem.deleteMany();
  await prisma.dailyPlan.deleteMany();
  await prisma.checkItem.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.courseSwap.deleteMany();
  await prisma.courseSlot.deleteMany();
  await prisma.student.deleteMany();
  await prisma.fileUploadLog.deleteMany();
  await prisma.periodSchedule.deleteMany();
  await prisma.user.deleteMany();
  await prisma.class.deleteMany();
  await prisma.semester.deleteMany();
  console.log("✅ 清理完成\n");

  // ===== 2. 学期 =====
  await prisma.semester.create({
    data: {
      name: "2025-2026学年第二学期",
      startDate: "2026-02-09",
      endDate: "2026-07-10",
      isCurrent: true,
    },
  });
  console.log("✅ 学期创建完成");

  // ===== 3. 班级 =====
  const regularGrades = [
    { grade: 1, sections: [1, 2, 3, 4, 5] },
    { grade: 2, sections: [1, 2, 3, 4, 5, 6] },
    { grade: 3, sections: [1, 2, 3, 4, 5, 6] },
    { grade: 4, sections: [1, 2, 3, 4, 9, 10] },
    { grade: 5, sections: [1, 2, 3, 4, 9, 10] },
  ];
  const icClassDefs = [
    { name: "307", section: 1 }, { name: "308", section: 2 },
    { name: "405", section: 3 }, { name: "406", section: 4 },
    { name: "407", section: 5 }, { name: "408", section: 6 },
    { name: "505", section: 7 }, { name: "506", section: 8 },
    { name: "507", section: 9 }, { name: "508", section: 10 },
  ];

  const classes = [];
  for (const { grade, sections } of regularGrades) {
    for (const section of sections) {
      const cls = await prisma.class.create({
        data: { name: String(grade * 100 + section), grade, section },
      });
      classes.push(cls);
    }
  }
  for (const ic of icClassDefs) {
    const cls = await prisma.class.create({
      data: { name: ic.name, grade: 6, section: ic.section },
    });
    classes.push(cls);
  }
  console.log(`✅ ${classes.length} 个班级创建完成（含融通部 ${icClassDefs.length} 班）`);

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
    { name: "王老师", username: "wanglaoshi", managedGrade: 4 },
    { name: "孙老师", username: "sunlaoshi", managedGrade: 5 },
    { name: "周老师", username: "zhoulaoshi", managedGrade: 6 },
  ];
  for (const dt of dtData) {
    const teacher = await prisma.user.create({
      data: { ...dt, password: hashedPassword, role: "DUTY_TEACHER" },
    });
    dutyTeachers.push(teacher);
  }

  const gradeNameMap: Record<number, string> = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "融通部" };
  const gradeLeaders = [];
  for (let grade = 1; grade <= 6; grade++) {
    const label = gradeNameMap[grade];
    const leader = await prisma.user.create({
      data: {
        name: grade === 6 ? "融通部负责人" : `${label}年级负责人`,
        username: `grade${grade}`,
        password: hashedPassword,
        role: "GRADE_LEADER",
        managedGrade: grade,
      },
    });
    gradeLeaders.push(leader);
  }

  const surnames = [
    "赵","钱","孙","李","周","吴","郑","冯","陈","褚","卫","蒋","沈","韩","杨","朱",
    "秦","尤","许","何","吕","施","张","孔","曹","严","华","金","魏","陶","姜","戚",
    "谢","邹","喻","柏","水","窦","章","云","苏","潘","葛","奚","范","彭","郎","鲁",
    "韦","昌","马","苗","凤","花","方","俞","任","袁","柳","鲍","史","唐","费","廉",
  ];
  for (let i = 0; i < classes.length; i++) {
    await prisma.user.create({
      data: {
        name: `${surnames[i % surnames.length]}老师`,
        username: `teacher${i + 1}`,
        password: hashedPassword,
        role: "CLASS_TEACHER",
        classId: classes[i].id,
      },
    });
  }
  console.log(`✅ 用户创建完成（${dutyTeachers.length} 值日教师 + ${gradeLeaders.length} 年级负责人 + ${classes.length} 班主任）`);

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

  // ===== 6. 收集过去 90 天的教学日 =====
  const today = new Date();
  const schoolDays: Date[] = [];
  for (let offset = TOTAL_DAYS - 1; offset >= 0; offset--) {
    const d = addDays(today, -offset);
    if (isWeekday(d)) {
      schoolDays.push(d);
    }
  }
  console.log(`📅 过去 ${TOTAL_DAYS} 天中共 ${schoolDays.length} 个教学日\n`);

  // ===== 7. 生成日评数据（含真实评分时间） =====
  let planCount = 0;
  let recordCount = 0;
  let dynamicCount = 0;
  let weeklyCount = 0;
  const fridaysProcessed = new Set<string>();
  const totalDays = schoolDays.length;
  const BATCH_SIZE = 500;
  const failComments = ["有待改进", "需要加强", "情况一般", "请班主任关注", "已通知班级"];

  // 构建用户名到时间偏好的映射
  const teacherProfileMap = new Map<string, number[]>();
  for (const dt of dtData) {
    teacherProfileMap.set(dt.username, TEACHER_TIME_PROFILES[dt.username]);
  }

  // 由于需要设置 createdAt，使用 $executeRawUnsafe 批量插入
  // 先收集所有记录，再批量写入
  let recordBatch: Array<{
    date: string;
    passed: boolean | null;
    severity: string | null;
    optionValue: string | null;
    comment: string | null;
    classId: string;
    checkItemId: string;
    scoredById: string;
    scoredByRole: string;
    scoredByName: string;
    createdAt: Date;
  }> = [];

  async function flushRecords() {
    if (recordBatch.length === 0) return;
    // 使用逐条 create 以支持自定义 createdAt
    // 为了性能，分批使用事务
    const batch = [...recordBatch];
    recordBatch = [];
    const chunks = [];
    for (let i = 0; i < batch.length; i += 100) {
      chunks.push(batch.slice(i, i + 100));
    }
    for (const chunk of chunks) {
      await prisma.$transaction(
        chunk.map(r => prisma.checkRecord.create({
          data: {
            date: r.date,
            passed: r.passed,
            severity: r.severity,
            optionValue: r.optionValue,
            comment: r.comment,
            classId: r.classId,
            checkItemId: r.checkItemId,
            scoredById: r.scoredById,
            scoredByRole: r.scoredByRole,
            scoredByName: r.scoredByName,
            originalScoredById: r.scoredById,
            originalScoredByName: r.scoredByName,
            originalScoredByRole: r.scoredByRole,
            originalPassed: r.passed,
            originalSeverity: r.severity,
            originalScoredAt: r.createdAt,
            createdAt: r.createdAt,
          },
        }))
      );
    }
    recordCount += batch.length;
  }

  for (let dayIdx = 0; dayIdx < schoolDays.length; dayIdx++) {
    const date = schoolDays[dayIdx];
    const dateStr = getDateStr(date);
    const dayOfWeek = date.getDay();

    // 进度输出
    if (dayIdx % 10 === 0) {
      await flushRecords();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  📊 进度 ${dayIdx + 1}/${totalDays} (${dateStr}) [${elapsed}s]`);
    }

    // 从 D-1~D-9 中随机选 3~5 个作为当日计划
    const planItemCount = rng.int(3, 5);
    const selectedItems = rng.pick(dailyCheckItems, planItemCount);

    // ~10% 概率添加动态临增项
    let dynamicItem = null;
    if (rng.chance(0.10)) {
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

    // 跳过今天的检查记录（留给演示）
    if (dayIdx === schoolDays.length - 1 && getDateStr(today) === dateStr) continue;

    // 为每个班级的每个计划项创建检查记录
    const allPlanItems = [...selectedItems, ...(dynamicItem ? [dynamicItem] : [])];
    for (const cls of classes) {
      const scorerIdx = dtData.findIndex(d => d.managedGrade === cls.grade);
      const scorer = dutyTeachers[scorerIdx >= 0 ? scorerIdx : 0];
      const scorerUsername = dtData[scorerIdx >= 0 ? scorerIdx : 0].username;
      const timeProfile = teacherProfileMap.get(scorerUsername) || TEACHER_TIME_PROFILES.lilaoshi;
      const classQuality = getClassBaseQuality(cls.grade, cls.section);

      // 该教师当天的基准评分时间（同一天同一教师的评分时间相近，加一点随机偏移）
      const baseScoringTime = generateScoringTime(rng, date, timeProfile);

      for (let itemIdx = 0; itemIdx < allPlanItems.length; itemIdx++) {
        const item = allPlanItems[itemIdx];
        const difficulty = ITEM_DIFFICULTY[item.code ?? ""] ?? 0.18;
        const passRate = computePassRate(rng, classQuality, difficulty, dayOfWeek, dayIdx, totalDays);
        const passed = rng.chance(passRate);

        let severity: string | null = null;
        if (!passed) {
          const r = rng.next();
          severity = r < 0.50 ? "minor" : r < 0.85 ? "moderate" : "serious";
        }

        // 在基准时间上偏移：每个班级偏移几分钟，模拟逐班检查
        const scoringTime = new Date(baseScoringTime);
        scoringTime.setMinutes(scoringTime.getMinutes() + rng.int(0, 8) * (itemIdx + 1));
        // 偶尔有二次检查，时间跳跃较大（~5%概率推迟1-2小时）
        if (rng.chance(0.05)) {
          scoringTime.setHours(scoringTime.getHours() + rng.int(1, 2));
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
          scoredByRole: "DUTY_TEACHER",
          scoredByName: scorer.name,
          createdAt: scoringTime,
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
      for (const cls of classes) {
        const glIdx = gradeLeaders.findIndex(l => l.managedGrade === cls.grade);
        const scorer = gradeLeaders[glIdx >= 0 ? glIdx : 0];
        const classQuality = getClassBaseQuality(cls.grade, cls.section);
        const weeklyTime = new Date(date);
        weeklyTime.setHours(16, rng.int(0, 59), rng.int(0, 59), 0);

        // W-1: 室外课出勤
        const w1 = rng.chance(classQuality) ? "0" : rng.chance(0.6) ? "1" : "gte2";
        recordBatch.push({
          date: dateStr, passed: null, severity: null,
          optionValue: w1, comment: null,
          classId: cls.id, checkItemId: weeklyCheckItems[0].id, scoredById: scorer.id,
          scoredByRole: "GRADE_LEADER", scoredByName: scorer.name,
          createdAt: weeklyTime,
        });

        // W-2 ~ W-4
        for (let i = 1; i <= 3; i++) {
          const noEvent = rng.chance(classQuality * 0.9);
          const optionValue = noEvent ? "0" : rng.chance(0.7) ? "1" : "gte2";
          recordBatch.push({
            date: dateStr, passed: null, severity: null,
            optionValue,
            comment: optionValue !== "0" ? "已妥善处理" : null,
            classId: cls.id, checkItemId: weeklyCheckItems[i].id, scoredById: scorer.id,
            scoredByRole: "GRADE_LEADER", scoredByName: scorer.name,
            createdAt: new Date(weeklyTime.getTime() + rng.int(1, 5) * 60000),
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
        recordBatch.push({
          date: dateStr, passed: null, severity: null,
          optionValue: overallGrade, comment: null,
          classId: cls.id, checkItemId: weeklyCheckItems[4].id, scoredById: scorer.id,
          scoredByRole: "GRADE_LEADER", scoredByName: scorer.name,
          createdAt: new Date(weeklyTime.getTime() + rng.int(5, 10) * 60000),
        });
        weeklyCount += 5;
      }

      if (recordBatch.length >= BATCH_SIZE) {
        await flushRecords();
      }
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
    { scope: "class-summary", label: "班级周工作小结", description: "面向班主任的班级周工作小结建议" },
    { scope: "grade-report", label: "年级AI日报", description: "全部班级完成检查后自动生成的年级常规日报（约100字）", temperature: 0.1, maxTokens: 500 },
  ];
  for (const mod of aiModuleDefaults) {
    await prisma.aiModuleConfig.create({
      data: {
        scope: mod.scope,
        label: mod.label,
        description: mod.description,
        systemPrompt: "",
        temperature: "temperature" in mod ? mod.temperature : 0.3,
        maxTokens: "maxTokens" in mod ? mod.maxTokens : 2000,
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
  console.log(`  时间范围: 过去 ${TOTAL_DAYS} 天`);
  console.log(`  教学日: ${totalDays} 天`);
  console.log(`  日计划: ${planCount} 个`);
  console.log(`  日评记录: ${recordCount} 条`);
  console.log(`  周评记录: ${weeklyCount} 条`);
  console.log(`  动态检查项: ${dynamicCount} 个`);
  console.log(`  总记录数: ${recordCount + weeklyCount} 条`);
  console.log(`  耗时: ${totalElapsed} 秒`);
  console.log("=".repeat(50));

  console.log("\n📋 账号信息:");
  console.log("  管理员: admin / 123456");
  console.log("  年级负责人: grade1~grade6 / 123456（grade6=融通部）");
  console.log("  值日老师: zhanglaoshi(1年级) / lilaoshi(2年级) / helaoshi(3年级)");
  console.log("            wanglaoshi(4年级) / sunlaoshi(5年级) / zhoulaoshi(融通部) / 123456");
  console.log(`  班主任: teacher1 ~ teacher${classes.length} / 123456`);

  console.log(`\n🎉 ${TOTAL_DAYS} 天模拟数据播种完成!`);
}

main()
  .catch((e) => {
    console.error("❌ 播种失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
