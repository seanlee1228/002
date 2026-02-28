import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAuth } from "@/lib/logger";

/** 登录防暴力：每次尝试前等待（秒） */
const LOGIN_DELAY_SECONDS = 2;
/** 连续失败多少次后锁定账户 */
const MAX_FAILED_ATTEMPTS = 6;

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "用户名", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          logAuth("LOGIN_FAILED", credentials?.username || "unknown", {
            detail: "缺少用户名或密码",
          });
          return null;
        }

        // 防暴力：每次点击登录后至少间隔一段时间再处理
        await new Promise((r) => setTimeout(r, LOGIN_DELAY_SECONDS * 1000));

        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
          include: { class: true },
        });

        if (!user) {
          logAuth("LOGIN_FAILED", credentials.username, {
            detail: "用户不存在",
          });
          return null;
        }

        // 账户已锁定（需管理员重置密码后解锁）
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          logAuth("LOGIN_FAILED", user.username, { detail: "账户已锁定" });
          throw new Error("ACCOUNT_LOCKED");
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          const nextAttempts = (user.failedLoginAttempts ?? 0) + 1;
          const lockAccount = nextAttempts >= MAX_FAILED_ATTEMPTS;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: nextAttempts,
              lockedUntil: lockAccount ? new Date() : undefined,
            },
          });
          logAuth("LOGIN_FAILED", user.username, {
            detail: "密码错误",
            failedAttempts: nextAttempts,
            locked: lockAccount,
          });
          return null;
        }

        // 登录成功：清零失败次数与锁定
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        });

        logAuth("LOGIN_SUCCESS", user.username, {
          role: user.role,
        });

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role as "ADMIN" | "GRADE_LEADER" | "DUTY_TEACHER" | "SUBJECT_TEACHER" | "CLASS_TEACHER",
          classId: user.classId,
          className: user.class?.name || null,
          managedGrade: user.managedGrade ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.username = user.username;
        token.classId = user.classId;
        token.className = user.className;
        token.managedGrade = user.managedGrade;
      }
      // 验证用户是否仍存在于数据库（防止数据库重置后 token 过期）
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: { id: true },
        });
        if (!dbUser) {
          // 用户不存在，清空 token 强制重登
          return {} as typeof token;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.username = token.username;
        session.user.classId = token.classId;
        session.user.className = token.className;
        session.user.managedGrade = token.managedGrade;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 100 * 24 * 60 * 60, // 100 天
  },
  secret: process.env.NEXTAUTH_SECRET,
};
