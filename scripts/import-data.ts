#!/usr/bin/env npx tsx
/**
 * 从 JSON 导入班级、用户数据（用于服务器同步本地修改）
 * 用法: npm run data:import
 * 需将 data/classes-users.json 放到项目根目录或 data/ 下
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

interface ExportedClass {
  id: string;
  name: string;
  grade: number;
  section: number;
}

interface ExportedUser {
  name: string;
  username: string;
  password: string;
  role: string;
  classRef: { grade: number; section: number } | null;
  managedGrade: number | null;
}

interface ExportedData {
  classes: ExportedClass[];
  users: ExportedUser[];
}

async function main() {
  const candidates = [
    path.join(process.cwd(), "data", "classes-users.json"),
    path.join(process.cwd(), "classes-users.json"),
  ];

  let file: string | null = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      file = p;
      break;
    }
  }

  if (!file) {
    console.error("❌ 未找到 data/classes-users.json，请先在本机执行 npm run data:export 并上传该文件");
    process.exit(1);
  }

  const raw = fs.readFileSync(file, "utf-8");
  const data: ExportedData = JSON.parse(raw);

  // 1. 导入班级（按 grade+section upsert）
  const gradeSectionToId = new Map<string, string>();

  for (const c of data.classes) {
    const existing = await prisma.class.findUnique({
      where: { grade_section: { grade: c.grade, section: c.section } },
    });

    if (existing) {
      await prisma.class.update({
        where: { id: existing.id },
        data: { name: c.name },
      });
      gradeSectionToId.set(`${c.grade}-${c.section}`, existing.id);
    } else {
      const created = await prisma.class.create({
        data: { name: c.name, grade: c.grade, section: c.section },
      });
      gradeSectionToId.set(`${c.grade}-${c.section}`, created.id);
    }
  }

  console.log(`✅ 班级: ${data.classes.length} 个`);

  // 2. 导入用户（按 username upsert）
  for (const u of data.users) {
    const classId = u.classRef
      ? gradeSectionToId.get(`${u.classRef.grade}-${u.classRef.section}`) ?? null
      : null;

    await prisma.user.upsert({
      where: { username: u.username },
      create: {
        name: u.name,
        username: u.username,
        password: u.password,
        role: u.role,
        classId,
        managedGrade: u.managedGrade,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      update: {
        name: u.name,
        password: u.password,
        role: u.role,
        classId,
        managedGrade: u.managedGrade,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  console.log(`✅ 用户: ${data.users.length} 个`);
  console.log("导入完成。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
