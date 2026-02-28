import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

/**
 * POST /api/deploy-webhook
 * GitHub 推送后自动触发服务器部署，无需在 Workbench 手动执行。
 * 验证方式：GitHub Webhook Secret → X-Hub-Signature-256
 * 或：Authorization: Bearer <DEPLOY_WEBHOOK_SECRET>
 */
export async function POST(req: Request) {
  const secret = process.env.DEPLOY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "DEPLOY_WEBHOOK_SECRET 未配置" },
      { status: 501 }
    );
  }

  const body = await req.text();
  const sig256 = req.headers.get("x-hub-signature-256");
  const auth = req.headers.get("authorization");
  const event = req.headers.get("x-github-event");

  let valid = false;
  if (sig256) {
    const expected =
      "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    valid = sig256 === expected;
  } else if (auth === `Bearer ${secret}`) {
    valid = true;
  }

  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (event === "ping") {
    return NextResponse.json({ ok: true, message: "pong" });
  }
  if (event !== "push") {
    return NextResponse.json({ ok: true, message: "ignored" });
  }

  const projectPath = process.env.DEPLOY_PROJECT_PATH || process.cwd();
  const scriptPath = join(projectPath, "scripts", "server-deploy.sh");

  if (!existsSync(scriptPath)) {
    return NextResponse.json(
      { error: `部署脚本不存在: ${scriptPath}` },
      { status: 500 }
    );
  }

  const child = spawn("bash", [scriptPath], {
    cwd: projectPath,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PATH: process.env.PATH ?? "" },
  });
  child.unref();

  return NextResponse.json(
    { ok: true, message: "部署已启动，请稍候约 30 秒" },
    { status: 202 }
  );
}
