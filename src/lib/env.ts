/**
 * 环境变量校验模块
 * 在应用启动时检查必要的环境变量是否已配置
 * 缺少必要变量时立即抛出错误，避免运行时才崩溃
 */

const REQUIRED_VARS = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
] as const;

const OPTIONAL_VARS = [
  { key: "DEEPSEEK_API_KEY", desc: "AI 分析功能" },
  { key: "AI_CRON_SECRET", desc: "AI 定时分析" },
  {
    key: "DEPLOY_WEBHOOK_SECRET",
    desc: "GitHub Webhook 自动部署密钥（与 GitHub 仓库 Webhook 的 Secret 一致）",
  },
  {
    key: "DEPLOY_PROJECT_PATH",
    desc: "部署脚本执行的项目根路径（默认 process.cwd）",
  },
] as const;

export function validateEnv() {
  // 检查必要变量
  const missing = REQUIRED_VARS.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `[启动失败] 缺少必要环境变量: ${missing.join(", ")}\n` +
        `请检查 .env 文件是否已正确配置。`
    );
  }

  // 可选变量仅输出警告
  for (const { key, desc } of OPTIONAL_VARS) {
    if (!process.env[key]) {
      console.warn(`[env] 未配置 ${key}，${desc}将不可用`);
    }
  }

  console.log("[env] 环境变量校验通过");
}
