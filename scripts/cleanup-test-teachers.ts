/**
 * 清理测试用教师账号：
 * - 保留：从小学部通讯录 Excel 导入的所有老师账号 + admin
 * - 删除：其他所有用户账号（及其相关测试数据）
 *
 * 相关测试数据包括：
 * - 由这些测试账号参与的检查记录（CheckRecord）
 * - 由这些账号记录的考勤（AttendanceRecord）
 * - 课程格子上的任课老师引用（CourseSlot.teacherId 置空）
 * - 调课记录中的创建人 / 代课老师（CourseSwap）
 * - 文件上传日志（FileUploadLog）
 *
 * 用法：
 *   npx tsx scripts/cleanup-test-teachers.ts /Users/seanlee/Desktop/小学部通讯录20260228_拼音版.xlsx
 */

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

interface CleanupStats {
  totalUsers: number;
  keepUsers: number;
  deleteUsers: number;
  deletedCheckRecords: number;
  deletedAttendanceRecords: number;
  updatedCourseSlots: number;
  deletedCourseSwaps: number;
  deletedFileUploadLogs: number;
}

function loadExcelUsernames(filePath: string): Set<string> {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
  });

  const usernames = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // 跳过表头：A 列包含“姓名”字样
    if (
      i === 0 &&
      row[0] != null &&
      typeof row[0] === "string" &&
      row[0].includes("姓名")
    ) {
      continue;
    }

    const usernameCell = row[1];
    const username =
      usernameCell != null ? String(usernameCell).trim() : "";
    if (!username) continue;

    usernames.add(username);
  }

  return usernames;
}

async function main() {
  const filePath =
    process.argv[2] ||
    "/Users/seanlee/Desktop/小学部通讯录20260228_拼音版.xlsx";

  console.log("📂 读取通讯录 Excel：", filePath);
  const excelUsernames = loadExcelUsernames(filePath);
  console.log(`🧾 Excel 中共发现 ${excelUsernames.size} 个教师用户名`);

  const KEEP_SYSTEM_USERS = new Set<string>(["admin"]);
  const KEEP = new Set<string>([
    ...excelUsernames,
    ...KEEP_SYSTEM_USERS,
  ]);

  const stats: CleanupStats = {
    totalUsers: 0,
    keepUsers: 0,
    deleteUsers: 0,
    deletedCheckRecords: 0,
    deletedAttendanceRecords: 0,
    updatedCourseSlots: 0,
    deletedCourseSwaps: 0,
    deletedFileUploadLogs: 0,
  };

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
    },
  });
  stats.totalUsers = users.length;

  console.log(`👥 当前数据库中共有 ${users.length} 个用户`);

  for (const user of users) {
    const shouldKeep = KEEP.has(user.username);
    if (shouldKeep) {
      stats.keepUsers++;
      continue;
    }

    console.log(
      `🗑️  删除测试账号：${user.name} (${user.username}) [${user.role}]`
    );

    // 分批清理与该用户相关的记录，避免外键约束
    const [
      crRes,
      arRes,
      csRes,
      csSwapRes,
      csSwapSubUpdateRes,
      fulRes,
    ] = await prisma.$transaction([
      prisma.checkRecord.deleteMany({
        where: {
          OR: [
            { scoredById: user.id },
            { originalScoredById: user.id },
            { reviewedById: user.id },
          ],
        },
      }),
      prisma.attendanceRecord.deleteMany({
        where: { recordedById: user.id },
      }),
      prisma.courseSlot.updateMany({
        where: { teacherId: user.id },
        data: { teacherId: null },
      }),
      prisma.courseSwap.deleteMany({
        where: { createdById: user.id },
      }),
      prisma.courseSwap.updateMany({
        where: { substituteId: user.id },
        data: { substituteId: null },
      }),
      prisma.fileUploadLog.deleteMany({
        where: { uploadedById: user.id },
      }),
    ]);

    stats.deletedCheckRecords += crRes.count;
    stats.deletedAttendanceRecords += arRes.count;
    stats.updatedCourseSlots += csRes.count;
    stats.deletedCourseSwaps += csSwapRes.count;
    stats.deletedFileUploadLogs += fulRes.count;

    await prisma.user.delete({
      where: { id: user.id },
    });

    stats.deleteUsers++;
  }

  console.log("\n✅ 清理完成，结果统计：");
  console.log(`  总用户数：${stats.totalUsers}`);
  console.log(`  保留用户数（Excel + admin）：${stats.keepUsers}`);
  console.log(`  删除测试账号数：${stats.deleteUsers}`);
  console.log(`  删除检查记录数（CheckRecord）：${stats.deletedCheckRecords}`);
  console.log(
    `  删除考勤记录数（AttendanceRecord）：${stats.deletedAttendanceRecords}`
  );
  console.log(
    `  置空课程任课老师的课程格子数（CourseSlot.teacherId=null）：${stats.updatedCourseSlots}`
  );
  console.log(
    `  删除调课记录数（CourseSwap.createdById）：${stats.deletedCourseSwaps}`
  );
  console.log(
    `  删除文件上传日志数（FileUploadLog）：${stats.deletedFileUploadLogs}`
  );
}

main()
  .catch((e) => {
    console.error("❌ 清理过程中出现错误：", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

