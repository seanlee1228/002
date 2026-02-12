import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "GRADE_LEADER" | "DUTY_TEACHER" | "CLASS_TEACHER";
      username: string;
      classId: string | null;
      className: string | null;
      managedGrade: number | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "GRADE_LEADER" | "DUTY_TEACHER" | "CLASS_TEACHER";
    username: string;
    classId: string | null;
    className: string | null;
    managedGrade: number | null;
  }
}
