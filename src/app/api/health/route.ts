import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health — 健康检查端点（无需认证）
 * 用途: PM2 / Nginx / 监控系统检测服务是否存活
 * 返回: { status, db, uptime, timestamp }
 */
export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    // 检查数据库连通性
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      db: "connected",
      uptime: process.uptime(),
      timestamp,
    });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        db: "disconnected",
        uptime: process.uptime(),
        timestamp,
      },
      { status: 503 }
    );
  }
}
