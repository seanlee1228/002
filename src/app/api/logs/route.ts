import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

type ParsedLog = {
  timestamp?: string;
  level?: string;
  [key: string]: unknown;
};

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit") ?? "200");
  const limit = Number.isNaN(rawLimit)
    ? 200
    : Math.min(Math.max(Math.floor(rawLimit), 1), 1000);
  const level = (searchParams.get("level") ?? "ALL").toUpperCase();
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const download = searchParams.get("download") === "1";

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const validFrom = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null;
  const validTo = toDate && !Number.isNaN(toDate.getTime()) ? toDate : null;

  // 结束日期按当天 23:59:59.999 处理，便于前端按日筛选
  if (validTo) {
    validTo.setHours(23, 59, 59, 999);
  }

  try {
    const logPath = path.join(process.cwd(), "system.log");
    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    const parsed = lines.map((line) => {
      try {
        return { raw: line, item: JSON.parse(line) as ParsedLog };
      } catch {
        return {
          raw: line,
          item: { timestamp: new Date().toISOString(), level: "WARN", raw: line } as ParsedLog,
        };
      }
    });

    const filtered = parsed.filter(({ item }) => {
      const levelMatch =
        level === "ALL" ? true : (item.level ?? "").toString().toUpperCase() === level;
      if (!levelMatch) return false;

      if (validFrom || validTo) {
        const time = item.timestamp ? new Date(item.timestamp) : null;
        if (!time || Number.isNaN(time.getTime())) return false;
        if (validFrom && time < validFrom) return false;
        if (validTo && time > validTo) return false;
      }

      return true;
    });

    if (download) {
      const payload = filtered.map((entry) => entry.raw).join("\n");
      return new NextResponse(payload, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"system.log\"",
        },
      });
    }

    // 聚合指标（基于全量日志，不受 limit/level/date 过滤影响）
    const loginCount = parsed.filter(
      ({ item }) => String(item.action ?? "").toUpperCase() === "LOGIN_SUCCESS"
    ).length;
    const scoreRecordCount = parsed.filter(({ item }) => {
      const model = String(item.model ?? "").toUpperCase();
      const action = String(item.action ?? "").toUpperCase();
      return model === "SCORE" || action === "UPSERT";
    }).length;
    const systemErrorCount = parsed.filter(
      ({ item }) => String(item.level ?? "").toUpperCase() === "ERROR"
    ).length;

    const latest = filtered.slice(-limit).reverse().map((entry) => entry.item);
    return NextResponse.json({
      logs: latest,
      total: lines.length,
      filteredTotal: filtered.length,
      loginCount,
      scoreRecordCount,
      systemErrorCount,
    });
  } catch (error) {
    // 日志文件尚不存在时返回空数组
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({
        logs: [],
        total: 0,
        filteredTotal: 0,
        loginCount: 0,
        scoreRecordCount: 0,
        systemErrorCount: 0,
      });
    }
    return NextResponse.json(
      { error: "Failed to read logs" },
      { status: 500 }
    );
  }
}
