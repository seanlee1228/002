import fs from "fs/promises";
import path from "path";

// 日志文件路径：项目根目录 system.log
const LOG_FILE = path.join(process.cwd(), "system.log");

// 敏感字段列表
const SENSITIVE_FIELDS = ["password", "hashedPassword"];

/**
 * 过滤敏感字段（如密码），替换为 [FILTERED]
 */
function sanitize(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(sanitize);

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
      sanitized[key] = "[FILTERED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * 格式化错误对象为可序列化的字符串
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

interface LogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  category: "AUTH" | "DATA" | "SYSTEM" | "DB";
  action: string;
  user?: string;
  role?: string;
  ip?: string;
  model?: string;
  data?: unknown;
  error?: string;
  detail?: string;
}

/**
 * 核心写入方法：追加一行 JSON 到日志文件（异步，不阻塞事件循环）
 */
function appendLog(entry: LogEntry): void {
  const line = JSON.stringify(entry) + "\n";
  // 使用异步写入，fire-and-forget，避免阻塞请求处理
  fs.appendFile(LOG_FILE, line, "utf-8").catch((err) => {
    // 日志写入失败时回退到 console，避免影响业务
    console.error("[Logger] Failed to write log:", err);
    console.error("[Logger] Original entry:", line);
  });
}

/**
 * 从 Request headers 中提取客户端 IP 地址
 * 支持 x-forwarded-for、x-real-ip，以及直连场景
 */
export function getClientIP(request: Request): string {
  const headers = request.headers;

  // 优先使用代理转发的 IP
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIP = headers.get("x-real-ip");
  if (realIP) {
    return realIP.trim();
  }

  return "unknown";
}

/**
 * 记录用户登录/登出事件
 */
export function logAuth(
  action: "LOGIN_SUCCESS" | "LOGIN_FAILED" | "LOGOUT",
  username: string,
  extra?: { role?: string; ip?: string; detail?: string; failedAttempts?: number; locked?: boolean }
): void {
  appendLog({
    timestamp: new Date().toISOString(),
    level: action === "LOGIN_FAILED" ? "WARN" : "INFO",
    category: "AUTH",
    action,
    user: username,
    role: extra?.role,
    ip: extra?.ip,
    detail: extra?.detail,
  });
}

/**
 * 记录数据变更操作（增删改）
 */
export function logDataChange(
  action: "CREATE" | "UPDATE" | "DELETE" | "UPSERT" | "SOFT_DELETE",
  user: { name?: string | null; username?: string | null; role?: string | null },
  model: string,
  data: unknown,
  ip: string
): void {
  appendLog({
    timestamp: new Date().toISOString(),
    level: "INFO",
    category: "DATA",
    action,
    user: user.username || user.name || "unknown",
    role: user.role || undefined,
    model,
    data: sanitize(data),
    ip,
  });
}

/**
 * 记录 API 错误
 */
export function logError(
  action: string,
  user: { name?: string | null; username?: string | null; role?: string | null } | null,
  error: unknown,
  ip: string
): void {
  appendLog({
    timestamp: new Date().toISOString(),
    level: "ERROR",
    category: "SYSTEM",
    action,
    user: user?.username || user?.name || "unknown",
    role: user?.role || undefined,
    error: formatError(error),
    ip,
  });
}

/**
 * Prisma 中间件专用 - 记录 DB 层面的变更操作（兜底，无用户上下文）
 */
export function logPrisma(
  model: string,
  action: string,
  args: unknown
): void {
  appendLog({
    timestamp: new Date().toISOString(),
    level: "INFO",
    category: "DB",
    action,
    model,
    data: sanitize(args),
  });
}
