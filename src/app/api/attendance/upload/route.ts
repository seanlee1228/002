import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  parsePeriodSchedule,
  parseTimetable,
  parseTeacherAssignment,
  extractUniqueSubjects,
  extractUniqueClasses,
  extractUniqueTeachers,
} from "@/lib/attendance/xlsx-parser";

/**
 * POST /api/attendance/upload
 * 上传并解析 xlsx 文件（作息时间表 / 课程表 / 任课表）
 * Body: FormData { file: File, type: "period_schedule" | "timetable" | "teacher_assignment" }
 * 返回解析预览数据，不写入数据库
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    if (!file) {
      return NextResponse.json({ error: "请选择文件" }, { status: 400 });
    }

    if (
      !type ||
      !["period_schedule", "timetable", "teacher_assignment"].includes(type)
    ) {
      return NextResponse.json(
        { error: "无效的文件类型" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();

    switch (type) {
      case "period_schedule": {
        const result = parsePeriodSchedule(buffer);
        return NextResponse.json({
          type,
          filename: file.name,
          data: result.data,
          errors: result.errors,
          summary: {
            totalPeriods: result.data.length,
            errorCount: result.errors.length,
          },
        });
      }

      case "timetable": {
        const result = parseTimetable(buffer);
        const subjects = extractUniqueSubjects(result.data);
        const classes = extractUniqueClasses(result.data, []);
        return NextResponse.json({
          type,
          filename: file.name,
          data: result.data,
          errors: result.errors,
          subjects,
          classes,
          summary: {
            totalSlots: result.data.length,
            totalClasses: classes.length,
            totalSubjects: subjects.length,
            errorCount: result.errors.length,
          },
        });
      }

      case "teacher_assignment": {
        const result = parseTeacherAssignment(buffer);
        const teachers = extractUniqueTeachers(result.data);
        const classes = extractUniqueClasses([], result.data);
        return NextResponse.json({
          type,
          filename: file.name,
          data: result.data,
          errors: result.errors,
          teachers,
          classes,
          summary: {
            totalAssignments: result.data.length,
            totalTeachers: teachers.length,
            totalClasses: classes.length,
            errorCount: result.errors.length,
          },
        });
      }
    }
  } catch (error) {
    console.error("[attendance/upload] Error:", error);
    return NextResponse.json(
      { error: "文件解析失败，请检查文件格式" },
      { status: 500 }
    );
  }
}
