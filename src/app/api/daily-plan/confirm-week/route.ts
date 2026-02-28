import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { confirmWeekPlan } from "@/lib/schedule-generator";
import { logDataChange, logError, getClientIP } from "@/lib/logger";
import { getLocale, createTranslator } from "@/lib/server-i18n";

// POST /api/daily-plan/confirm-week
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
    const body = await request.json();
    const { week, checkItemIds } = body;

    if (!week || !Array.isArray(checkItemIds) || checkItemIds.length === 0) {
      return NextResponse.json({ error: t("invalidWeekRange") }, { status: 400 });
    }

    const result = await confirmWeekPlan(week, checkItemIds, session.user.id);

    logDataChange("CREATE", session.user, "ConfirmWeekPlan", {
      week,
      itemCount: checkItemIds.length,
      generated: result.generated,
    }, ip);

    return NextResponse.json(result);
  } catch (error) {
    logError("确认周计划", session.user, error, ip);
    return NextResponse.json(
      { error: t("scheduleGenerateFailed") },
      { status: 500 }
    );
  }
}
