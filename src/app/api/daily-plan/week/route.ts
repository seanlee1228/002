import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getWeekPlans } from "@/lib/schedule-generator";
import { getLocale, createTranslator } from "@/lib/server-i18n";

// GET /api/daily-plan/week?week=3 or ?week=3,4
export async function GET(request: NextRequest) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekStr = request.nextUrl.searchParams.get("week");
  if (!weekStr) {
    return NextResponse.json({ error: t("invalidWeekRange") }, { status: 400 });
  }

  const weekNumbers = weekStr.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
  if (weekNumbers.length === 0 || weekNumbers.some((n) => n < 1 || n > 19)) {
    return NextResponse.json({ error: t("invalidWeekRange") }, { status: 400 });
  }

  try {
    const days = await getWeekPlans(weekNumbers);
    return NextResponse.json({ weeks: weekNumbers, days });
  } catch (error) {
    console.error("WeekPlan GET error:", error);
    return NextResponse.json(
      { error: t("scheduleOverviewFailed") },
      { status: 500 }
    );
  }
}
