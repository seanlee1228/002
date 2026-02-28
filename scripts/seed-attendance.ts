/**
 * 考勤系统模拟数据注入脚本
 * 创建 pe_teacher 账号、作息时间表、课程安排、学生名单及历史考勤记录
 *
 * 运行方式：npx tsx scripts/seed-attendance.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ==================== 作息时间表 ====================
const PERIODS = [
  { periodNo: 1, startTime: "08:00", endTime: "08:40", label: "第一节" },
  { periodNo: 2, startTime: "08:50", endTime: "09:30", label: "第二节" },
  { periodNo: 3, startTime: "09:50", endTime: "10:30", label: "第三节" },
  { periodNo: 4, startTime: "10:40", endTime: "11:20", label: "第四节" },
  { periodNo: 5, startTime: "14:00", endTime: "14:40", label: "第五节" },
  { periodNo: 6, startTime: "14:50", endTime: "15:30", label: "第六节" },
  { periodNo: 7, startTime: "15:50", endTime: "16:30", label: "第七节" },
  { periodNo: 8, startTime: "16:40", endTime: "17:20", label: "第八节" },
];

// ==================== 学生名单（每班10人） ====================
const STUDENT_NAMES = [
  // 1年级1班
  ["陈思远", "王梓涵", "李明轩", "张雨欣", "刘子豪", "赵欣怡", "黄浩然", "周雅琪", "吴俊杰", "孙佳慧"],
  // 1年级2班
  ["林志强", "何美琳", "郭天佑", "杨紫萱", "徐文博", "马晨曦", "朱嘉琪", "胡泽宇", "罗思颖", "邓浩宇"],
  // 1年级3班
  ["冯梓轩", "蔡欣妍", "彭俊豪", "韩梦洁", "田浩然", "唐雨萱", "董子涵", "方思远", "潘嘉怡", "石明辉"],
  // 1年级4班
  ["贺子豪", "龚雅静", "万浩天", "段梓涵", "雷思琪", "侯天赐", "任雨晨", "夏明轩", "钟佳慧", "汤泽宇"],
  // 2年级1班
  ["曹思源", "邹紫涵", "吕浩宇", "戴欣悦", "范俊杰", "卢雅琪", "苏志远", "蒋美琪", "叶天宇", "谢佳慧"],
  // 2年级2班
  ["余明轩", "程雨欣", "魏浩然", "秦子涵", "丁思琪", "姜俊豪", "薛梦瑶", "沈天佑", "施嘉琪", "熊泽宇"],
  // 2年级3班
  ["白思远", "廖紫萱", "陆浩天", "贾雅琪", "尹明辉", "高欣妍", "金俊杰", "傅子涵", "钱思源", "安美琳"],
  // 2年级4班
  ["康浩然", "章紫涵", "温志强", "阮欣悦", "邱俊豪", "毛雅琪", "宋天宇", "闫梦瑶", "崔泽宇", "庄佳慧"],
  // 3年级1班
  ["翟思远", "童紫萱", "严浩天", "柳雅静", "付明轩", "顾欣妍", "武俊杰", "于子涵", "左思琪", "申天佑"],
  // 3年级2班
  ["甘浩宇", "鲁紫涵", "常志远", "梁美琳", "谭俊豪", "祝雅琪", "文明辉", "栗欣悦", "窦泽宇", "裴佳慧"],
  // 3年级3班
  ["花思远", "宁紫萱", "齐浩然", "向子涵", "凌明轩", "柏欣妍", "景俊杰", "霍雅琪", "司天宇", "解美琳"],
  // 3年级4班
  ["管浩天", "艾紫涵", "聂志强", "蓝欣悦", "辛俊豪", "岳雅静", "米明辉", "邬子涵", "尚泽宇", "满佳慧"],
];

// ==================== pe_teacher 的课表安排 ====================
// [classIndex, dayOfWeek, periodNo]
// classIndex: 0~11 对应 1年级1班 ~ 3年级4班
// dayOfWeek: 1=周一, 2=周二, 3=周三, 4=周四, 5=周五
const PE_SCHEDULE: Array<[number, number, number]> = [
  // 周一
  [0, 1, 2],   // 1年级1班 周一第2节
  [4, 1, 3],   // 2年级1班 周一第3节
  [8, 1, 5],   // 3年级1班 周一第5节

  // 周二（今天重点测试）
  [1, 2, 1],   // 1年级2班 周二第1节
  [2, 2, 3],   // 1年级3班 周二第3节
  [5, 2, 5],   // 2年级2班 周二第5节
  [9, 2, 7],   // 3年级2班 周二第7节

  // 周三
  [3, 3, 2],   // 1年级4班 周三第2节
  [6, 3, 4],   // 2年级3班 周三第4节
  [10, 3, 6],  // 3年级3班 周三第6节

  // 周四
  [0, 4, 3],   // 1年级1班 周四第3节
  [7, 4, 5],   // 2年级4班 周四第5节
  [11, 4, 7],  // 3年级4班 周四第7节

  // 周五
  [4, 5, 2],   // 2年级1班 周五第2节
  [8, 5, 4],   // 3年级1班 周五第4节
  [1, 5, 6],   // 1年级2班 周五第6节
];

// ==================== 工具函数 ====================

function getDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ==================== 主函数 ====================

async function main() {
  console.log("🏃 开始注入考勤系统模拟数据...\n");

  // 1. 清理已有考勤数据（避免冲突）
  console.log("🗑️  清理已有考勤相关数据...");
  await prisma.attendanceRecord.deleteMany();
  await prisma.courseSwap.deleteMany();
  await prisma.courseSlot.deleteMany();
  await prisma.student.deleteMany();
  await prisma.periodSchedule.deleteMany();
  await prisma.user.deleteMany({ where: { username: "pe_teacher" } });
  console.log("✅ 清理完成\n");

  // 2. 获取现有班级
  const classes = await prisma.class.findMany({
    orderBy: [{ grade: "asc" }, { section: "asc" }],
  });
  if (classes.length < 12) {
    console.error("❌ 班级数量不足（需要 12 个），请先运行 npm run db:seed 创建基础数据");
    process.exit(1);
  }
  console.log(`📚 找到 ${classes.length} 个班级`);

  // 3. 创建 pe_teacher
  const hashedPassword = await bcrypt.hash("123456", 10);
  const peTeacher = await prisma.user.create({
    data: {
      name: "体育李老师",
      username: "pe_teacher",
      password: hashedPassword,
      role: "SUBJECT_TEACHER",
    },
  });
  console.log(`👨‍🏫 创建体育教师: ${peTeacher.name} (${peTeacher.username})`);

  // 4. 创建作息时间表
  const periodMap = new Map<number, string>();
  for (const p of PERIODS) {
    const period = await prisma.periodSchedule.create({
      data: {
        periodNo: p.periodNo,
        startTime: p.startTime,
        endTime: p.endTime,
        label: p.label,
        gradeScope: "ALL",
      },
    });
    periodMap.set(p.periodNo, period.id);
  }
  console.log(`⏰ 创建 ${PERIODS.length} 个课时`);

  // 5. 创建学生
  let totalStudents = 0;
  const classStudentMap = new Map<string, string[]>();

  for (let i = 0; i < Math.min(classes.length, STUDENT_NAMES.length); i++) {
    const cls = classes[i];
    const names = STUDENT_NAMES[i];
    const studentIds: string[] = [];

    for (let j = 0; j < names.length; j++) {
      const student = await prisma.student.create({
        data: {
          name: names[j],
          studentNo: `${cls.grade}${String(cls.section).padStart(2, "0")}${String(j + 1).padStart(2, "0")}`,
          classId: cls.id,
        },
      });
      studentIds.push(student.id);
      totalStudents++;
    }
    classStudentMap.set(cls.id, studentIds);
  }
  console.log(`👨‍🎓 创建 ${totalStudents} 名学生`);

  // 6. 创建课程安排
  const slotRecords: Array<{ id: string; classId: string; dayOfWeek: number }> = [];

  for (const [classIdx, dayOfWeek, periodNo] of PE_SCHEDULE) {
    const cls = classes[classIdx];
    const periodId = periodMap.get(periodNo);
    if (!periodId) continue;

    const slot = await prisma.courseSlot.create({
      data: {
        classId: cls.id,
        dayOfWeek,
        periodId,
        subject: "体育",
        isOutdoor: true,
        teacherId: peTeacher.id,
        isActive: true,
      },
    });
    slotRecords.push({ id: slot.id, classId: cls.id, dayOfWeek });
  }
  console.log(`📋 创建 ${PE_SCHEDULE.length} 节体育课/周`);

  // 7. 生成上周历史考勤记录
  const today = new Date();
  const todayDow = today.getDay() === 0 ? 7 : today.getDay();
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - todayDow - 6);

  let attendanceCount = 0;

  for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
    const d = new Date(lastMonday);
    d.setDate(lastMonday.getDate() + dayOffset);
    const dateStr = getDateStr(d);
    const dow = d.getDay() === 0 ? 7 : d.getDay();

    for (const slot of slotRecords) {
      if (slot.dayOfWeek !== dow) continue;

      const studentIds = classStudentMap.get(slot.classId) || [];
      if (studentIds.length === 0) continue;

      const records = studentIds.map((studentId) => {
        const rand = Math.random();
        let status: string;
        if (rand < 0.88) status = "present";
        else if (rand < 0.94) status = "absent";
        else if (rand < 0.97) status = "excused";
        else status = "late";

        return {
          date: dateStr,
          studentId,
          courseSlotId: slot.id,
          classId: slot.classId,
          status,
          recordedById: peTeacher.id,
        };
      });

      await prisma.attendanceRecord.createMany({ data: records });
      attendanceCount += records.length;
    }
  }
  console.log(`📝 创建 ${attendanceCount} 条上周历史考勤记录`);

  // 统计
  const dowNames = ["日", "一", "二", "三", "四", "五", "六"];
  const todayCourseCount = PE_SCHEDULE.filter(([, dow]) => dow === todayDow).length;

  console.log("\n" + "=".repeat(50));
  console.log("📋 注入数据统计:");
  console.log(`  体育教师: pe_teacher / 123456`);
  console.log(`  作息时间: ${PERIODS.length} 个课时 (${PERIODS[0].startTime} ~ ${PERIODS[PERIODS.length - 1].endTime})`);
  console.log(`  学生人数: ${totalStudents} 人 (每班 10 人)`);
  console.log(`  课程安排: ${PE_SCHEDULE.length} 节体育课/周`);
  console.log(`  今日 (周${dowNames[today.getDay()]}): ${todayCourseCount} 节课`);
  console.log(`  历史考勤: ${attendanceCount} 条`);
  console.log("=".repeat(50));
  console.log("\n🎉 考勤系统数据注入完成！");
  console.log("   登录 pe_teacher / 123456 → 考勤管理 即可测试");
}

main()
  .catch((e) => {
    console.error("❌ 注入失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
