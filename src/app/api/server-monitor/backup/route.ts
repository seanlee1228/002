import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

/**
 * POST /api/server-monitor/backup — 数据备份下载
 * 支持类型：database（数据库）、logs（日志）、full（完整备份）
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { type } = await request.json();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    if (type === "database") {
      // 备份数据库文件
      const possiblePaths = [
        path.join(process.cwd(), "prisma", "prisma", "prod.db"),
        path.join(process.cwd(), "prisma", "dev.db"),
      ];
      let dbPath: string | null = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          dbPath = p;
          break;
        }
      }

      if (!dbPath) {
        return NextResponse.json({ error: "Database file not found" }, { status: 404 });
      }

      const data = fs.readFileSync(dbPath);
      return new Response(data, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="backup-db-${timestamp}.db"`,
          "Content-Length": data.length.toString(),
        },
      });
    }

    if (type === "logs") {
      // 备份日志文件
      const logPath = path.join(process.cwd(), "system.log");
      if (!fs.existsSync(logPath)) {
        return NextResponse.json({ error: "Log file not found" }, { status: 404 });
      }

      const data = fs.readFileSync(logPath, "utf-8");
      return new Response(data, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="backup-logs-${timestamp}.log"`,
        },
      });
    }

    if (type === "full") {
      // 完整备份：数据库 + 日志打包
      const tmpDir = "/tmp";
      const archiveName = `full-backup-${timestamp}.tar.gz`;
      const archivePath = path.join(tmpDir, archiveName);
      const cwd = process.cwd();

      // 收集要备份的文件（相对路径）
      const filesToBackup: string[] = [];

      // 数据库文件
      const dbRelPaths = ["prisma/prisma/prod.db", "prisma/dev.db"];
      for (const rel of dbRelPaths) {
        if (fs.existsSync(path.join(cwd, rel))) {
          filesToBackup.push(rel);
        }
      }

      // 日志文件
      if (fs.existsSync(path.join(cwd, "system.log"))) {
        filesToBackup.push("system.log");
      }

      if (filesToBackup.length === 0) {
        return NextResponse.json({ error: "No files to backup" }, { status: 404 });
      }

      try {
        const fileArgs = filesToBackup.map((f) => `"${f}"`).join(" ");
        execSync(`tar -czf "${archivePath}" ${fileArgs}`, {
          cwd,
          timeout: 30000,
        });

        const data = fs.readFileSync(archivePath);

        // 清理临时文件
        try { fs.unlinkSync(archivePath); } catch { /* 忽略清理失败 */ }

        return new Response(data, {
          headers: {
            "Content-Type": "application/gzip",
            "Content-Disposition": `attachment; filename="${archiveName}"`,
            "Content-Length": data.length.toString(),
          },
        });
      } catch {
        // tar 命令失败，回退到只下载数据库
        try { fs.unlinkSync(archivePath); } catch { /* 忽略 */ }
        return NextResponse.json(
          { error: "Failed to create archive, try downloading database only" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: "Invalid backup type" }, { status: 400 });
  } catch (error) {
    console.error("[backup] Error:", error);
    return NextResponse.json({ error: "Backup failed" }, { status: 500 });
  }
}
