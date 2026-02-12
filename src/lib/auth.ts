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
          role: user.role,
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
        token.role = (user as any).role;
        token.username = (user as any).username;
        token.classId = (user as any).classId;
        token.className = (user as any).className;
        token.managedGrade = (user as any).managedGrade;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).username = token.username;
        (session.user as any).classId = token.classId;
        (session.user as any).className = token.className;
        (session.user as any).managedGrade = token.managedGrade;
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
