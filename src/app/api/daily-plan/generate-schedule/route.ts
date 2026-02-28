import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateSchedule } from "@/lib/schedule-generator";
import { CURRENT_CALENDAR } from "@/lib/school-calendar";
import { logDataChange, logError, getClientIP } from "@/lib/logger";
import { getLocale, createTranslator } from "@/lib/server-i18n";

// POST: 生成排期
export async function POST(request: Request) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: t("onlyAdminCreatePlan") }, { status: 403 });
  }

  const ip = getClientIP(request);

  try {
    const body = await request.json().catch(() => ({}));
    const fromWeek = body.fromWeek ?? 1;
    const toWeek = body.toWeek ?? CURRENT_CALENDAR.weeks.length;

    // 校验
    if (fromWeek < 1 || toWeek > CURRENT_CALENDAR.weeks.length || fromWeek > toWeek) {
      return NextResponse.json(
        { error: t("invalidWeekRange") },
        { status: 400 }
      );
    }

    const result = await generateSchedule(fromWeek, toWeek, session.user.id);

    logDataChange("CREATE", session.user, "ScheduleGenerate", {
      fromWeek,
      toWeek,
      generated: result.generated,
      skipped: result.skipped,
    }, ip);

    return NextResponse.json(result);
  } catch (error) {
    logError("生成排期", session.user, error, ip);
    return NextResponse.json(
      { error: t("scheduleGenerateFailed") },
      { status: 500 }
    );
  }
}
