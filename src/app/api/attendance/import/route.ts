import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type {
  ParsedPeriod,
  ParsedCourseSlot,
  ParsedTeacherAssignment,
} from "@/lib/attendance/xlsx-parser";

/**
 * POST /api/attendance/import
 * 确认导入解析后的数据到数据库
 * Body JSON:
 * {
 *   periods: ParsedPeriod[],
 *   slots: ParsedCourseSlot[],
 *   assignments: ParsedTeacherAssignment[],
 *   outdoorSubjects: string[],   // 被标记为室外课的科目
 *   defaultPassword?: string,    // 新教师的默认密码
 *   clearExisting?: boolean,     // 是否清除现有考勤配置数据
 * }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      periods,
      slots,
      assignments,
      outdoorSubjects = [],
      defaultPassword = "bgys2026",
      clearExisting = false,
    } = body as {
      periods: ParsedPeriod[];
      slots: ParsedCourseSlot[];
      assignments: ParsedTeacherAssignment[];
      outdoorSubjects: string[];
      defaultPassword?: string;
      clearExisting?: boolean;
    };

    const result = await prisma.$transaction(async (tx) => {
      const stats = {
        periodsCreated: 0,
        slotsCreated: 0,
        teachersCreated: 0,
        teachersExisting: 0,
        classesNotFound: [] as string[],
        unmatchedAssignments: [] as string[],
      };

      // 1. 清除现有数据（可选）
      if (clearExisting) {
        await tx.attendanceRecord.deleteMany({});
        await tx.courseSwap.deleteMany({});
        await tx.courseSlot.deleteMany({});
        await tx.periodSchedule.deleteMany({});
      }

      // 2. 导入作息时间表
      for (const p of periods) {
        await tx.periodSchedule.upsert({
          where: {
            periodNo_gradeScope: { periodNo: p.periodNo, gradeScope: "ALL" },
          },
          create: {
            periodNo: p.periodNo,
            startTime: p.startTime,
            endTime: p.endTime,
            label: p.label,
            gradeScope: "ALL",
          },
          update: {
            startTime: p.startTime,
            endTime: p.endTime,
            label: p.label,
          },
        });
        stats.periodsCreated++;
      }

      // 3. 获取现有班级映射
      const allClasses = await tx.class.findMany();
      const classMap = new Map<string, { id: string; grade: number }>();
      for (const c of allClasses) {
        classMap.set(c.name, { id: c.id, grade: c.grade });
        // 也用 "X(Y)班" 格式做备用匹配
        const altName = `${c.grade}(${c.section})班`;
        classMap.set(altName, { id: c.id, grade: c.grade });
      }

      // 4. 获取现有 PeriodSchedule 映射
      const allPeriods = await tx.periodSchedule.findMany();
      const periodMap = new Map<number, string>();
      for (const p of allPeriods) {
        periodMap.set(p.periodNo, p.id);
      }

      // 5. 构建任课表查找表 (className + subject → teacherName)
      const assignmentMap = new Map<string, string>();
      for (const a of assignments) {
        assignmentMap.set(`${a.className}|${a.subject}`, a.teacherName);
      }

      // 6. 收集需要创建的教师，去重
      const teacherNames = new Set<string>();
      for (const a of assignments) {
        teacherNames.add(a.teacherName);
      }

      // 创建 / 查找教师账号
      const teacherMap = new Map<string, string>(); // name → userId
      const hashedPwd = await bcrypt.hash(defaultPassword, 10);

      for (const name of teacherNames) {
        // 先查找是否已有同名用户
        const existing = await tx.user.findFirst({
          where: { name },
          select: { id: true },
        });

        if (existing) {
          teacherMap.set(name, existing.id);
          stats.teachersExisting++;
        } else {
          // 生成用户名：使用 teacher_ + 自增序号
          const count = await tx.user.count({
            where: { username: { startsWith: "teacher_" } },
          });
          const username = `teacher_${String(count + 1).padStart(3, "0")}`;

          const newUser = await tx.user.create({
            data: {
              name,
              username,
              password: hashedPwd,
              role: "SUBJECT_TEACHER",
            },
          });
          teacherMap.set(name, newUser.id);
          stats.teachersCreated++;
        }
      }

      // 7. 导入课程表（CourseSlot）
      const outdoorSet = new Set(outdoorSubjects);

      for (const slot of slots) {
        const cls = classMap.get(slot.className);
        if (!cls) {
          if (!stats.classesNotFound.includes(slot.className)) {
            stats.classesNotFound.push(slot.className);
          }
          continue;
        }

        const periodId = periodMap.get(slot.periodNo);
        if (!periodId) continue;

        // 查找对应的任课教师
        const teacherName = assignmentMap.get(
          `${slot.className}|${slot.subject}`
        );
        const teacherId = teacherName
          ? teacherMap.get(teacherName) ?? null
          : null;

        if (teacherName && !teacherId) {
          stats.unmatchedAssignments.push(
            `${slot.className} ${slot.subject} → ${teacherName}`
          );
        }

        await tx.courseSlot.upsert({
          where: {
            classId_dayOfWeek_periodId: {
              classId: cls.id,
              dayOfWeek: slot.dayOfWeek,
              periodId,
            },
          },
          create: {
            classId: cls.id,
            dayOfWeek: slot.dayOfWeek,
            periodId,
            subject: slot.subject,
            isOutdoor: outdoorSet.has(slot.subject),
            teacherId,
          },
          update: {
            subject: slot.subject,
            isOutdoor: outdoorSet.has(slot.subject),
            teacherId,
          },
        });
        stats.slotsCreated++;
      }

      // 8. 记录上传日志
      await tx.fileUploadLog.create({
        data: {
          type: "full_import",
          filename: "batch_import",
          rowCount:
            periods.length + slots.length + assignments.length,
          status:
            stats.classesNotFound.length > 0 ? "partial" : "success",
          errors:
            stats.classesNotFound.length > 0
              ? JSON.stringify({
                  classesNotFound: stats.classesNotFound,
                  unmatchedAssignments: stats.unmatchedAssignments,
                })
              : null,
          uploadedById: session.user.id,
        },
      });

      return stats;
    });

    return NextResponse.json({ success: true, stats: result });
  } catch (error) {
    console.error("[attendance/import] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "导入失败",
      },
      { status: 500 }
    );
  }
}
