#!/usr/bin/env npx tsx
/**
 * 清空服务器上的种子数据：班级、用户及其所有关联数据
 * 仅在服务器执行，执行后需运行 data:import 导入本地导出的班级/用户
 * 用法: npm run data:clear-seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("开始清空种子数据（班级、用户及关联数据）...");

  // 按外键依赖顺序删除，避免违反外键约束
  const deletedCheckRecords = await prisma.checkRecord.deleteMany({});
  console.log(`  CheckRecord: ${deletedCheckRecords.count}`);

  const deletedDailyPlanItems = await prisma.dailyPlanItem.deleteMany({});
  console.log(`  DailyPlanItem: ${deletedDailyPlanItems.count}`);

  const deletedDailyPlans = await prisma.dailyPlan.deleteMany({});
  console.log(`  DailyPlan: ${deletedDailyPlans.count}`);

  const deletedCourseSwaps = await prisma.courseSwap.deleteMany({});
  console.log(`  CourseSwap: ${deletedCourseSwaps.count}`);

  const deletedAttendanceRecords = await prisma.attendanceRecord.deleteMany({});
  console.log(`  AttendanceRecord: ${deletedAttendanceRecords.count}`);

  const deletedCourseSlots = await prisma.courseSlot.deleteMany({});
  console.log(`  CourseSlot: ${deletedCourseSlots.count}`);

  const deletedStudents = await prisma.student.deleteMany({});
  console.log(`  Student: ${deletedStudents.count}`);

  const deletedFileUploadLogs = await prisma.fileUploadLog.deleteMany({});
  console.log(`  FileUploadLog: ${deletedFileUploadLogs.count}`);

  const deletedUsers = await prisma.user.deleteMany({});
  console.log(`  User: ${deletedUsers.count}`);

  const deletedClasses = await prisma.class.deleteMany({});
  console.log(`  Class: ${deletedClasses.count}`);

  console.log("✅ 种子数据已清空，可执行 npm run data:import 导入新数据。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
