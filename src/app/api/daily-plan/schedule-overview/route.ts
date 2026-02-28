import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getScheduleOverview } from "@/lib/schedule-generator";
import { getCurrentWeek } from "@/lib/school-calendar";
import { getLocale, createTranslator } from "@/lib/server-i18n";

export const dynamic = "force-dynamic";

// GET: 获取排期总览
export async function GET() {
  const locale = await getLocale();
  const t = createTranslator(locale, "api.errors");
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const overview = await getScheduleOverview();
    const currentWeek = getCurrentWeek();

    return NextResponse.json({
      ...overview,
      currentWeek: currentWeek?.week ?? null,
    });
  } catch (error) {
    console.error("ScheduleOverview GET error:", error);
    return NextResponse.json(
      { error: t("scheduleOverviewFailed") },
      { status: 500 }
    );
  }
}
