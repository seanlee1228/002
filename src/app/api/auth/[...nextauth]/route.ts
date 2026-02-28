import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { logAuth, getClientIP } from "@/lib/logger";

const authHandler = NextAuth(authOptions);

type RouteContext = { params: Promise<{ nextauth: string[] }> };

// 包装 handler，将 Next.js 16 的 async params 解包后传给 next-auth v4
async function wrappedGET(request: Request, context: RouteContext) {
  const { nextauth } = await context.params;
  return (authHandler as Function)(request, { params: { nextauth } });
}

// 包装 POST handler，在登录请求时记录客户端 IP
async function wrappedPOST(request: Request, context: RouteContext) {
  const ip = getClientIP(request);

  // 检查是否是登录请求（credentials callback）
  const url = new URL(request.url);
  if (url.pathname.includes("callback/credentials")) {
    // 克隆请求以读取 body（不影响原始请求）
    try {
      const clonedReq = request.clone();
      const formData = await clonedReq.formData();
      const username = formData.get("username") as string;
      if (username) {
        logAuth("LOGIN_SUCCESS", username, { ip, detail: "登录请求" });
      }
    } catch {
      // formData 解析失败不影响正常登录流程
    }
  }

  const { nextauth } = await context.params;
  return (authHandler as Function)(request, { params: { nextauth } });
}

export { wrappedGET as GET, wrappedPOST as POST };
