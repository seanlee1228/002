import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 开始播种数据...");

  // Clean existing data
  await prisma.score.deleteMany();
  await prisma.inspectionItem.deleteMany();
  await prisma.user.deleteMany();
  await prisma.class.deleteMany();
  await prisma.semester.deleteMany();

  // Create semesters
  await prisma.semester.create({
    data: {
      name: "2025-2026学年第二学期",
      startDate: "2026-02-09",
      endDate: "2026-07-10",
      isCurrent: true,
    },
  });
  console.log("✅ 学期创建完成");

  // Create classes: 3 grades x 4 sections = 12 classes
  const classes = [];
  for (let grade = 1; grade <= 3; grade++) {
    for (let section = 1; section <= 4; section++) {
      const cls = await prisma.class.create({
        data: {
          name: `${grade}年级${section}班`,
          grade,
          section,
        },
      });
      classes.push(cls);
    }
  }
  console.log(`✅ ${classes.length} 个班级创建完成`);

  const hashedPassword = await bcrypt.hash("123456", 10);

  // Create admin
  const admin = await prisma.user.create({
    data: {
      name: "系统管理员",
      username: "admin",
      password: hashedPassword,
      role: "ADMIN",
    },
  });
  console.log("✅ 管理员创建完成");

  // Create duty teachers (each assigned to a grade)
  const dutyTeacher1 = await prisma.user.create({
    data: {
      name: "张老师",
      username: "zhanglaoshi",
      password: hashedPassword,
      role: "DUTY_TEACHER",
      managedGrade: 1,
    },
  });
  const dutyTeacher2 = await prisma.user.create({
    data: {
      name: "李老师",
      username: "lilaoshi",
      password: hashedPassword,
      role: "DUTY_TEACHER",
      managedGrade: 2,
    },
  });
  const dutyTeacher3 = await prisma.user.create({
    data: {
      name: "何老师",
      username: "helaoshi",
      password: hashedPassword,
      role: "DUTY_TEACHER",
      managedGrade: 3,
    },
  });
  console.log("✅ 值日老师创建完成（各归属对应年级）");

  // Create grade leaders (one per grade)
  const gradeLeaderNames = ["一年级负责人", "二年级负责人", "三年级负责人"];
  const gradeLeaders = [];
  for (let grade = 1; grade <= 3; grade++) {
    const leader = await prisma.user.create({
      data: {
        name: gradeLeaderNames[grade - 1],
        username: `grade${grade}`,
        password: hashedPassword,
        role: "GRADE_LEADER",
        managedGrade: grade,
      },
    });
    gradeLeaders.push(leader);
  }
  console.log("✅ 年级负责人创建完成");

  // Create class teachers (one per class)
  const teacherNames = [
    "王老师", "赵老师", "刘老师", "陈老师",
    "杨老师", "黄老师", "周老师", "吴老师",
    "徐老师", "孙老师", "马老师", "朱老师",
  ];
  const classTeachers = [];
  for (let i = 0; i < classes.length; i++) {
    const teacher = await prisma.user.create({
      data: {
        name: teacherNames[i],
        username: `teacher${i + 1}`,
        password: hashedPassword,
        role: "CLASS_TEACHER",
        classId: classes[i].id,
      },
    });
    classTeachers.push(teacher);
  }
  console.log(`✅ ${classTeachers.length} 位班主任创建完成`);

  // Create inspection items for the past 7 days + today
  const inspectionTemplates = [
    [
      { title: "教室卫生", description: "检查教室地面、桌面整洁度", maxScore: 10 },
      { title: "课间纪律", description: "课间活动秩序及安全情况", maxScore: 10 },
      { title: "两操评比", description: "广播操和眼保健操完成质量", maxScore: 10 },
    ],
    [
      { title: "教室卫生", description: "检查教室地面、桌面整洁度", maxScore: 10 },
      { title: "课间纪律", description: "课间活动秩序及安全情况", maxScore: 10 },
      { title: "红领巾佩戴", description: "学生红领巾佩戴情况", maxScore: 10 },
      { title: "桌椅摆放", description: "课后桌椅摆放整齐", maxScore: 10 },
    ],
    [
      { title: "教室卫生", description: "检查教室地面、桌面整洁度", maxScore: 10 },
      { title: "午餐纪律", description: "午餐时间用餐秩序", maxScore: 10 },
      { title: "两操评比", description: "广播操和眼保健操完成质量", maxScore: 10 },
      { title: "放学秩序", description: "放学路队整齐有序", maxScore: 10 },
      { title: "节能环保", description: "随手关灯关窗、节约用水", maxScore: 10 },
    ],
    [
      { title: "教室卫生", description: "检查教室地面、桌面整洁度", maxScore: 10 },
      { title: "课间纪律", description: "课间活动秩序及安全情况", maxScore: 10 },
      { title: "文明礼仪", description: "学生见面问好、礼貌用语", maxScore: 10 },
    ],
    [
      { title: "教室卫生", description: "检查教室地面、桌面整洁度", maxScore: 10 },
      { title: "两操评比", description: "广播操和眼保健操完成质量", maxScore: 10 },
      { title: "红领巾佩戴", description: "学生红领巾佩戴情况", maxScore: 10 },
      { title: "课桌整理", description: "课桌内部和桌面物品摆放", maxScore: 10 },
    ],
  ];

  const today = new Date();
  const allInspectionItems: any[] = [];

  for (let dayOffset = 7; dayOffset >= 0; dayOffset--) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const dateStr = date.toISOString().split("T")[0];
    const templateIndex = Math.abs(dayOffset) % inspectionTemplates.length;
    const template = inspectionTemplates[templateIndex];

    for (const item of template) {
      const inspection = await prisma.inspectionItem.create({
        data: {
          title: item.title,
          description: item.description,
          maxScore: item.maxScore,
          date: dateStr,
          createdBy: admin.id,
        },
      });
      allInspectionItems.push(inspection);
    }
  }
  console.log(`✅ ${allInspectionItems.length} 条检查项创建完成`);

  // Create scores for past days (not today, to leave room for demo)
  let scoreCount = 0;
  for (const item of allInspectionItems) {
    const todayStr = today.toISOString().split("T")[0];
    if (item.date === todayStr) continue;

    for (const cls of classes) {
      const randomScore = Math.round((6 + Math.random() * 4) * 10) / 10;
      const scorer = Math.random() > 0.5 ? dutyTeacher1 : dutyTeacher2;

      await prisma.score.create({
        data: {
          score: randomScore,
          comment: randomScore >= 9 ? "表现优秀" : randomScore >= 7 ? "表现良好" : "有待改进",
          classId: cls.id,
          inspectionItemId: item.id,
          scoredById: scorer.id,
        },
      });
      scoreCount++;
    }
  }
  console.log(`✅ ${scoreCount} 条评分记录创建完成`);

  console.log("\n📋 账号信息:");
  console.log("  管理员: admin / 123456");
  console.log("  年级负责人: grade1 / 123456 (1年级)");
  console.log("  年级负责人: grade2 / 123456 (2年级)");
  console.log("  年级负责人: grade3 / 123456 (3年级)");
  console.log("  值日老师: zhanglaoshi / 123456 (1年级)");
  console.log("  值日老师: lilaoshi / 123456 (2年级)");
  console.log("  值日老师: helaoshi / 123456 (3年级)");
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
