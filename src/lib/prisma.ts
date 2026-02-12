import { PrismaClient } from "@prisma/client";
import { logPrisma } from "@/lib/logger";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient();

  // Prisma 中间件：自动拦截所有数据变更操作（兜底日志）
  const mutationActions = ["create", "update", "delete", "upsert", "deleteMany", "updateMany", "createMany"];

  client.$use(async (params, next) => {
    const result = await next(params);

    // 仅记录数据变更操作
    if (params.action && mutationActions.includes(params.action)) {
      try {
        logPrisma(
          params.model || "Unknown",
          params.action,
          params.args
        );
      } catch {
        // 日志记录失败不影响业务
      }
    }

    return result;
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
