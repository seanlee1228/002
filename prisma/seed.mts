import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// 固定检查项定义
const DAILY_ITEMS = [
  { code: "D-1", title: "教室卫生与整理", description: "地面无可见垃圾/污渍，黑板擦净；桌椅偏离不超过1/3，清洁工具和体育器材定点归位", sortOrder: 1 },
  { code: "D-2", title: "包干区卫生", description: "教室外包干区域（走廊、楼梯等）地面无垃圾，墙面无明显人为污损", sortOrder: 2 },
  { code: "D-3", title: "课前准备", description: "铃响后1分钟内全班就座安静，走动或聊天人数不超过2人", sortOrder: 3 },
  { code: "D-4", title: "课堂纪律", description: "趴桌、转身聊天、随意插话等违纪行为人数不超过2人", sortOrder: 4 },
  { code: "D-5", title: "课间安全", description: "走廊、楼梯、教室内无奔跑追逐、推搡、攀爬栏杆等危险行为（操场正常活动不计）", sortOrder: 5 },
  { code: "D-6", title: "眼保健操", description: "音乐响后全班安静，睁眼或讲话人数不超过2人", sortOrder: 6 },
  { code: "D-7", title: "课间操", description: "铃响后3分钟内集合完毕，队列安静整齐，动作明显不到位人数不超过全班1/5", sortOrder: 7 },
  { code: "D-8", title: "文明礼仪", description: "着装整洁，按要求穿校服（校服日）；见师长能主动问好；同学间无骂人、起外号等不文明言行", sortOrder: 8 },
  { code: "D-9", title: "放学及路队秩序", description: "路队整齐安静，无学生无故逗留；教室已断电、关窗、关门", sortOrder: 9 },
];

const WEEKLY_ITEMS = [
  { code: "W-1", title: "室外课出勤", description: "统计室外课未提前请假且无事后补假的缺勤人次：0人次 / 1人次 / ≥2人次", sortOrder: 1 },
  { code: "W-2", title: "当周安全事故记录", description: "记录需送医务室及以上处理的安全事故起数及处理情况", sortOrder: 2 },
  { code: "W-3", title: "当周学生冲突记录", description: "记录需教师介入处理或已上报的学生冲突事件", sortOrder: 3 },
  { code: "W-4", title: "当周家长有效反馈/投诉", description: "记录家长通过正式渠道提出的需学校回应或处理的诉求", sortOrder: 4 },
  { code: "W-5", title: "本周班级整体运行等级", description: "A(卓越)：达标率≥90%且无严重/一般不达标，W-1~W-4均为0；B(良好)：达标率70%~89%，单项≤1起；C(预警)：达标率<70%或有严重不达标或任一≥2起", sortOrder: 5 },
];

function getDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function getWeekFriday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day <= 5 ? 5 - day : -2; // distance to Friday
  d.setDate(d.getDate() + diff);
  return d;
}

async function main() {
  console.log("🌱 开始播种数据...");

  // Clean existing data (order matters for FK constraints)
  await prisma.checkRecord.deleteMany();
  await prisma.dailyPlanItem.deleteMany();
  await prisma.dailyPlan.deleteMany();
  await prisma.checkItem.deleteMany();
  await prisma.user.deleteMany();
  await prisma.class.deleteMany();
  await prisma.semester.deleteMany();

  // ========== 学期 ==========
  await prisma.semester.create({
    data: {
      name: "2025-2026学年第二学期",
      startDate: "2026-02-09",
      endDate: "2026-07-10",
      isCurrent: true,
    },
  });
  console.log("✅ 学期创建完成");

  // ========== 班级 ==========
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

  // ========== 用户 ==========
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

  // ========== 固定检查项 ==========
  const dailyCheckItems = [];
  for (const item of DAILY_ITEMS) {
    const ci = await prisma.checkItem.create({
      data: { code: item.code, module: "DAILY", title: item.title, description: item.description, sortOrder: item.sortOrder, isDynamic: false },
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

  // ========== 历史数据：过去 7 天的每日计划 + 检查记录 ==========
  const today = new Date();
  let planCount = 0;
  let recordCount = 0;

  for (let dayOffset = 7; dayOffset >= 0; dayOffset--) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    if (!isWeekday(date)) continue;

    const dateStr = getDateStr(date);

    // 从 D-1~D-9 中随机选 3-5 个作为当日计划
    const shuffled = [...dailyCheckItems].sort(() => Math.random() - 0.5);
    const planItemCount = 3 + Math.floor(Math.random() * 3); // 3-5
    const selectedItems = shuffled.slice(0, planItemCount);

    // 偶尔添加一个动态临增项
    let dynamicItem = null;
    if (Math.random() > 0.6 && dayOffset > 0) {
      dynamicItem = await prisma.checkItem.create({
        data: {
          module: "DAILY",
          title: ["课桌整理", "午餐纪律", "节能环保", "红领巾佩戴"][Math.floor(Math.random() * 4)],
          description: "临时增加的检查项",
          sortOrder: 9,
          isDynamic: true,
          date: dateStr,
          createdBy: admin.id,
        },
      });
    }

    const plan = await prisma.dailyPlan.create({
      data: {
        date: dateStr,
        createdById: admin.id,
        items: {
          create: [
            ...selectedItems.map((item, idx) => ({
              checkItemId: item.id,
              sortOrder: idx + 1,
            })),
            ...(dynamicItem ? [{ checkItemId: dynamicItem.id, sortOrder: selectedItems.length + 1 }] : []),
          ],
        },
      },
    });
    planCount++;

    // 跳过今天的记录（留给演示）
    if (dayOffset === 0) continue;

    // 为每个班级的每个计划项创建检查记录
    const allPlanItems = [...selectedItems, ...(dynamicItem ? [dynamicItem] : [])];
    for (const cls of classes) {
      const scorer = dutyTeachers[cls.grade - 1] || dutyTeachers[0];
      for (const item of allPlanItems) {
        const passed = Math.random() > 0.2; // 80% 达标率
        await prisma.checkRecord.create({
          data: {
            date: dateStr,
            passed,
            comment: passed ? null : ["有待改进", "需要加强", "情况一般"][Math.floor(Math.random() * 3)],
            classId: cls.id,
            checkItemId: item.id,
            scoredById: scorer.id,
          },
        });
        recordCount++;
      }
    }
  }
  console.log(`✅ ${planCount} 个每日计划创建完成`);
  console.log(`✅ ${recordCount} 条日评记录创建完成`);

  // ========== 历史数据：上周周评记录 ==========
  const lastFriday = getWeekFriday(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000));
  const lastFridayStr = getDateStr(lastFriday);
  let weeklyCount = 0;

  for (const cls of classes) {
    const scorer = gradeLeaders[cls.grade - 1] || gradeLeaders[0];

    // W-1: 室外课出勤
    await prisma.checkRecord.create({
      data: {
        date: lastFridayStr,
        optionValue: Math.random() > 0.15 ? "no_absence" : "has_absence",
        classId: cls.id,
        checkItemId: weeklyCheckItems[0].id,
        scoredById: scorer.id,
      },
    });

    // W-2 ~ W-4
    for (let i = 1; i <= 3; i++) {
      const rand = Math.random();
      const optionValue = rand > 0.3 ? "0" : rand > 0.1 ? "1" : "gte2";
      await prisma.checkRecord.create({
        data: {
          date: lastFridayStr,
          optionValue,
          comment: optionValue !== "0" ? "已妥善处理" : null,
          classId: cls.id,
          checkItemId: weeklyCheckItems[i].id,
          scoredById: scorer.id,
        },
      });
    }

    // W-5: 综合等级
    const grade = Math.random() > 0.3 ? (Math.random() > 0.5 ? "A" : "B") : "C";
    await prisma.checkRecord.create({
      data: {
        date: lastFridayStr,
        optionValue: grade,
        classId: cls.id,
        checkItemId: weeklyCheckItems[4].id,
        scoredById: scorer.id,
      },
    });
    weeklyCount += 5;
  }
  console.log(`✅ ${weeklyCount} 条周评记录创建完成`);

  console.log("\n📋 账号信息:");
  console.log("  管理员: admin / 123456");
  console.log("  年级负责人: grade1 / grade2 / grade3 / 123456");
  console.log("  值日老师: zhanglaoshi(1年级) / lilaoshi(2年级) / helaoshi(3年级) / 123456");
  console.log("  班主任: teacher1 ~ teacher12 / 123456");
  console.log("\n🎉 数据播种完成!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
