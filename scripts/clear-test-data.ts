/**
 * 清空系统测试数据（班级/用户与结构数据保留）
 * 执行顺序按依赖关系：先删记录类，再删计划类。
 * 使用方式：npx tsx scripts/clear-test-data.ts
 * 注意：确认当前 DATABASE_URL 指向本地/测试库，勿对生产库执行。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const order = [
    { name: "CheckRecord", fn: () => prisma.checkRecord.deleteMany() },
    { name: "DailyPlanItem", fn: () => prisma.dailyPlanItem.deleteMany() },
    { name: "DailyPlan", fn: () => prisma.dailyPlan.deleteMany() },
    { name: "AiAnalysis", fn: () => prisma.aiAnalysis.deleteMany() },
    { name: "AttendanceRecord", fn: () => prisma.attendanceRecord.deleteMany() },
    { name: "CourseSwap", fn: () => prisma.courseSwap.deleteMany() },
    { name: "FileUploadLog", fn: () => prisma.fileUploadLog.deleteMany() },
  ];

  console.log("开始清空测试数据（班级/用户/结构数据保留）…\n");
  for (const { name, fn } of order) {
    const result = await fn();
    console.log(`  ${name}: 已删除 ${result.count} 条`);
  }
  console.log("\n清空完成。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
