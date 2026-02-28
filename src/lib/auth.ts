import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAuth } from "@/lib/logger";

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

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          logAuth("LOGIN_FAILED", credentials.username, {
            detail: "密码错误",
          });
          return null;
        }

        // 登录成功日志（IP 在 route handler 层记录）
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
  },
  secret: process.env.NEXTAUTH_SECRET,
};
