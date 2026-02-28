import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import os from "os";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

/**
 * 获取 CPU 使用率（通过两次采样间隔 100ms 计算）
 */
async function getCpuUsage(): Promise<number> {
  const startMeasure = cpuAverage();
  await new Promise((r) => setTimeout(r, 100));
  const endMeasure = cpuAverage();

  const idleDiff = endMeasure.idle - startMeasure.idle;
  const totalDiff = endMeasure.total - startMeasure.total;

  return totalDiff === 0 ? 0 : Math.round((1 - idleDiff / totalDiff) * 1000) / 10;
}

function cpuAverage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    totalIdle += cpu.times.idle;
    totalTick += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle: totalIdle / cpus.length, total: totalTick / cpus.length };
}

/**
 * 获取磁盘使用情况（仅 Linux/macOS）
 */
function getDiskUsage(): { total: number; used: number; free: number; usagePercent: string } | null {
  try {
    const output = execSync("df -k /", { encoding: "utf-8", timeout: 5000 });
    const lines = output.trim().split("\n");
    if (lines.length < 2) return null;
    const parts = lines[1].split(/\s+/);
    // 格式：Filesystem 1K-blocks Used Available Use% Mounted
    const total = parseInt(parts[1], 10) * 1024; // 转为字节
    const used = parseInt(parts[2], 10) * 1024;
    const free = parseInt(parts[3], 10) * 1024;
    const usagePercent = parts[4]?.replace("%", "") || "0";
    return { total, used, free, usagePercent };
  } catch {
    return null;
  }
}

/**
 * 从日志文件解析登录统计和错误信息
 */
function parseLogStats() {
  const logPath = path.join(process.cwd(), "system.log");
  const stats = {
    totalLines: 0,
    logFileSize: 0,
    recentLogins: [] as Array<{ user: string; time: string; ip: string }>,
    activeUsersToday: 0,
    errorsToday: 0,
    errorsWeek: 0,
    recentErrors: [] as Array<{ time: string; action: string; error: string; user: string }>,
    loginCountToday: 0,
    loginCountWeek: 0,
  };

  if (!fs.existsSync(logPath)) return stats;

  try {
    const stat = fs.statSync(logPath);
    stats.logFileSize = stat.size;

    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    stats.totalLines = lines.length;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const todayUsers = new Set<string>();

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const time = entry.timestamp ? new Date(entry.timestamp) : null;
        if (!time) continue;

        // 登录统计
        if (entry.action === "LOGIN_SUCCESS") {
          if (time >= todayStart) {
            stats.loginCountToday++;
            todayUsers.add(entry.user || "unknown");
            stats.recentLogins.push({
              user: entry.user || "unknown",
              time: entry.timestamp,
              ip: entry.ip || "unknown",
            });
          }
          if (time >= weekStart) {
            stats.loginCountWeek++;
          }
        }

        // 错误统计
        if (entry.level === "ERROR") {
          if (time >= todayStart) {
            stats.errorsToday++;
          }
          if (time >= weekStart) {
            stats.errorsWeek++;
            stats.recentErrors.push({
              time: entry.timestamp,
              action: entry.action || "-",
              error: entry.error || "-",
              user: entry.user || "-",
            });
          }
        }
      } catch {
        // 跳过无法解析的行
      }
    }

    stats.activeUsersToday = todayUsers.size;
    // 只保留最近 10 条
    stats.recentLogins = stats.recentLogins.slice(-10).reverse();
    stats.recentErrors = stats.recentErrors.slice(-10).reverse();
  } catch {
    // 日志解析失败不影响其他数据
  }

  return stats;
}

/**
 * GET /api/server-monitor — 获取服务器状态信息
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const cpuUsage = await getCpuUsage();
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const disk = getDiskUsage();
    const logStats = parseLogStats();

    // 数据库文件大小
    let dbSize: number | null = null;
    const possibleDbPaths = [
      path.join(process.cwd(), "prisma", "prisma", "prod.db"),
      path.join(process.cwd(), "prisma", "dev.db"),
    ];
    for (const p of possibleDbPaths) {
      if (fs.existsSync(p)) {
        dbSize = fs.statSync(p).size;
        break;
      }
    }

    // 数据库表统计
    let dbStats: Record<string, number> = {};
    try {
      const [users, classes, checkItems, checkRecords, dailyPlans, aiAnalyses] = await Promise.all([
        prisma.user.count(),
        prisma.class.count(),
        prisma.checkItem.count(),
        prisma.checkRecord.count(),
        prisma.dailyPlan.count(),
        prisma.aiAnalysis.count(),
      ]);
      dbStats = { users, classes, checkItems, checkRecords, dailyPlans, aiAnalyses };
    } catch {
      // 数据库查询失败不影响其他数据
    }

    const processMemory = process.memoryUsage();

    return NextResponse.json({
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        release: os.release(),
        uptime: os.uptime(),
        loadAvg: os.loadavg(),
      },
      cpu: {
        model: cpus[0]?.model || "Unknown",
        cores: cpus.length,
        usage: cpuUsage,
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: parseFloat(((usedMem / totalMem) * 100).toFixed(1)),
      },
      disk,
      process: {
        uptime: process.uptime(),
        pid: process.pid,
        nodeVersion: process.version,
        memory: {
          rss: processMemory.rss,
          heapUsed: processMemory.heapUsed,
          heapTotal: processMemory.heapTotal,
          external: processMemory.external,
        },
      },
      database: {
        size: dbSize,
        stats: dbStats,
      },
      logs: logStats,
    });
  } catch (error) {
    console.error("[server-monitor] Error:", error);
    return NextResponse.json(
      { error: "Failed to get server status" },
      { status: 500 }
    );
  }
}
