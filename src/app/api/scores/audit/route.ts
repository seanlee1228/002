import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logError, getClientIP } from "@/lib/logger";
import { getLocale, createTranslator } from "@/lib/server-i18n";
import { isManagerRole } from "@/lib/permissions";

// GET: 查询评分审计记录（仅管理级别可访问）
// 参数: date(可选), grade(可选), page(可选,默认1), limit(可选,默认50)
export async function GET(request: Request) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 仅管理级别可访问
  if (!isManagerRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = getClientIP(request);
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const gradeStr = searchParams.get("grade");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const onlyReviewed = searchParams.get("reviewed") === "true";

  try {
    const where: Record<string, unknown> = {};

    if (date) {
      where.date = date;
    }

    if (gradeStr) {
      const grade = parseInt(gradeStr, 10);
      if (!isNaN(grade)) {
        where.class = { grade };
      }
    }

    // 年级主管只能查看自己年级
    if (session.user.role === "GRADE_LEADER" && session.user.managedGrade != null) {
      where.class = { grade: session.user.managedGrade };
    }

    // 仅查看有审核/修正的记录
    if (onlyReviewed) {
      where.reviewAction = { not: null };
    }

    const [records, total] = await Promise.all([
      prisma.checkRecord.findMany({
        where,
        include: {
          checkItem: { select: { code: true, title: true } },
          class: { select: { name: true, grade: true, section: true } },
        },
        orderBy: [{ date: "desc" }, { updatedAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.checkRecord.count({ where }),
    ]);

    // 构建审计视图
    const auditRecords = records.map((r) => ({
      id: r.id,
      date: r.date,
      className: r.class.name,
      grade: r.class.grade,
      checkItemCode: r.checkItem.code,
      checkItemTitle: r.checkItem.title,
      // 当前评分
      passed: r.passed,
      severity: r.severity,
      scoredByName: r.scoredByName,
      scoredByRole: r.scoredByRole,
      // 原始评分
      originalScoredByName: r.originalScoredByName,
      originalScoredByRole: r.originalScoredByRole,
      originalPassed: r.originalPassed,
      originalSeverity: r.originalSeverity,
      originalScoredAt: r.originalScoredAt,
      // 审核信息
      reviewedByName: r.reviewedByName,
      reviewedByRole: r.reviewedByRole,
      reviewedAt: r.reviewedAt,
      reviewAction: r.reviewAction,
      // 时间
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return NextResponse.json({
      records: auditRecords,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logError("审计记录查询", session.user, error, ip);
    return NextResponse.json({ error: t("operationFailed") }, { status: 500 });
  }
}
