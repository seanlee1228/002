#!/usr/bin/env npx tsx
/**
 * 导出班级、用户数据到 JSON，用于同步到服务器
 * 用法: npm run data:export
 * 输出: data/classes-users.json（不入库，已加入 .gitignore）
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  const classes = await prisma.class.findMany({
    orderBy: [{ grade: "asc" }, { section: "asc" }],
    select: { id: true, name: true, grade: true, section: true },
  });

  const users = await prisma.user.findMany({
    orderBy: { username: "asc" },
    select: {
      id: true,
      name: true,
      username: true,
      password: true,
      role: true,
      classId: true,
      managedGrade: true,
    },
  });

  // 建立 classId -> { grade, section } 映射，便于导入时按年级班级查找
  const classMap = new Map(classes.map((c) => [c.id, { grade: c.grade, section: c.section }]));

  const usersWithClassRef = users.map((u) => {
    const ref = u.classId ? classMap.get(u.classId) : null;
    return {
      ...u,
      classRef: ref ? { grade: ref.grade, section: ref.section } : null,
    };
  });

  const out = {
    exportedAt: new Date().toISOString(),
    classes,
    users: usersWithClassRef,
  };

  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "classes-users.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2), "utf-8");

  console.log(`✅ 导出完成: ${file}`);
  console.log(`   班级: ${classes.length} 个`);
  console.log(`   用户: ${users.length} 个`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
