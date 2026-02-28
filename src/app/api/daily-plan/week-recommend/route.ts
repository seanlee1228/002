import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getWeekRecommendation, getAdjustSuggestions } from "@/lib/schedule-generator";
import { getLocale, createTranslator } from "@/lib/server-i18n";

// GET /api/daily-plan/week-recommend?week=N
export async function GET(request: NextRequest) {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekStr = request.nextUrl.searchParams.get("week");
  const week = weekStr ? parseInt(weekStr, 10) : 0;
  if (!week || week < 1 || week > 19) {
    return NextResponse.json({ error: t("invalidWeekRange") }, { status: 400 });
  }

  try {
    const [recommendation, adjustSuggestions] = await Promise.all([
      getWeekRecommendation(week),
      getAdjustSuggestions(),
    ]);

    return NextResponse.json({ recommendation, adjustSuggestions });
  } catch (error) {
    console.error("WeekRecommend GET error:", error);
    return NextResponse.json(
      { error: t("scheduleOverviewFailed") },
      { status: 500 }
    );
  }
}
