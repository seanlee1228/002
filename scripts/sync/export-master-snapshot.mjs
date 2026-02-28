#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseOutputPath() {
  const arg = process.argv[2];
  if (!arg) {
    return resolve(process.cwd(), "artifacts/master-data-snapshot.json");
  }
  return resolve(process.cwd(), arg);
}

async function main() {
  const outputPath = parseOutputPath();
  const [classes, users] = await Promise.all([
    prisma.class.findMany({
      orderBy: [{ grade: "asc" }, { section: "asc" }],
      select: {
        id: true,
        name: true,
        grade: true,
        section: true,
      },
    }),
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { username: "asc" }],
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        classId: true,
        managedGrade: true,
      },
    }),
  ]);

  const snapshot = {
    source: "002",
    generatedAt: new Date().toISOString(),
    classes,
    users,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        classes: classes.length,
        users: users.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[export-master-snapshot] failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
