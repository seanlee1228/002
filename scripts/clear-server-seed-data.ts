#!/usr/bin/env npx tsx
/**
 * 清空服务器上的 seed 数据：班级、用户及所有依赖记录，便于用本地导出的班级/用户覆盖。
 * 仅限在服务器生产库上执行；执行后需运行 npm run data:import 导入本地 data/classes-users.json。
 * 用法: npm run data:clear-seed
 * 保留：CheckItem、Semester、PeriodSchedule、AiModuleConfig 等结构数据。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const steps: { name: string; fn: () => Promise<{ count: number }> }[] = [
    { name: "CheckRecord", fn: () => prisma.checkRecord.deleteMany() },
    { name: "DailyPlanItem", fn: () => prisma.dailyPlanItem.deleteMany() },
    { name: "DailyPlan", fn: () => prisma.dailyPlan.deleteMany() },
    { name: "AiAnalysis", fn: () => prisma.aiAnalysis.deleteMany() },
    { name: "AttendanceRecord", fn: () => prisma.attendanceRecord.deleteMany() },
    { name: "CourseSwap", fn: () => prisma.courseSwap.deleteMany() },
    { name: "FileUploadLog", fn: () => prisma.fileUploadLog.deleteMany() },
    { name: "CourseSlot", fn: () => prisma.courseSlot.deleteMany() },
    { name: "Student", fn: () => prisma.student.deleteMany() },
    {
      name: "CheckItem.createdBy 置空",
      fn: async () => prisma.checkItem.updateMany({ where: { createdBy: { not: null } }, data: { createdBy: null } }),
    },
    { name: "User", fn: () => prisma.user.deleteMany() },
    { name: "Class", fn: () => prisma.class.deleteMany() },
  ];

  console.log("清空服务器 seed 数据（班级/用户及依赖记录），结构数据保留…\n");
  for (const { name, fn } of steps) {
    const result = await fn();
    console.log(`  ${name}: 已处理 ${result.count} 条`);
  }
  console.log("\n清空完成。请执行 npm run data:import 导入 data/classes-users.json。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
