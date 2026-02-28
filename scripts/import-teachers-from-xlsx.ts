/**
 * 从小学部通讯录 Excel 导入教师账号、班主任和考勤老师信息
 *
 * 用法：
 *   npx tsx scripts/import-teachers-from-xlsx.ts /Users/seanlee/Desktop/小学部通讯录20260228_拼音版.xlsx
 *
 * 规则（根据用户确认）：
 * - A 列：姓名 → User.name
 * - B 列：用户名 → User.username
 * - C 列：密码 → User.password（新用户必填，已有用户填则更新密码）
 * - F 列：考勤老师负责的年级
 * - G 列：班主任所在班级
 *
 * 行角色判定（保证系统中一个老师只有一个主角色）：
 * 1）如果 G 有班级 → 作为班主任：
 *    - role = "CLASS_TEACHER"
 *    - 解析 G → 绑定到对应 Class（classId）
 *    - 即使 F 也有年级，也「不记为值日老师」
 * 2）如果 G 为空且 F 有年级 → 作为有年级的值日老师：
 *    - role = "DUTY_TEACHER"
 *    - managedGrade = 解析后的年级
 * 3）如果 G 为空且 F 也为空 → 作为无年级归属的值日老师：
 *    - role = "DUTY_TEACHER"
 *    - managedGrade = null
 */

import { PrismaClient, User } from "@prisma/client";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type ParsedRole =
  | { kind: "SKIP" }
  | {
      kind: "CLASS_TEACHER";
      classNameRaw: string;
    }
  | {
      kind: "DUTY_TEACHER";
      managedGrade: number | null;
    };

interface ImportStats {
  totalRows: number;
  skippedEmpty: number;
  skippedNoUsername: number;
  createdUsers: number;
  updatedUsers: number;
  classTeacherBound: number;
  dutyWithGrade: number;
  dutyWithoutGrade: number;
  classNotFound: number;
}

const CHINESE_GRADE_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function parseGradeCell(value: unknown): number | null {
  if (value == null) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const g = Math.round(value);
    if (g >= 1 && g <= 9) return g;
  }

  const s = String(value).trim();
  if (!s) return null;

  const digitMatch = s.match(/[1-9]/);
  if (digitMatch) {
    const g = parseInt(digitMatch[0], 10);
    if (g >= 1 && g <= 9) return g;
  }

  for (const [ch, num] of Object.entries(CHINESE_GRADE_MAP)) {
    if (s.includes(ch)) return num;
  }

  return null;
}

function normalizeClassNameCell(value: unknown): string | null {
  if (value == null) return null;
  let s = String(value).trim();
  if (!s) return null;

  s = s.replace(/班$/u, "").replace(/\s+/g, "");

  if (/^\d+$/.test(s)) {
    return s;
  }

  const m = s.match(/(\d+)[^\d]+(\d+)/);
  if (m) {
    const grade = parseInt(m[1], 10);
    const section = parseInt(m[2], 10);
    if (Number.isFinite(grade) && Number.isFinite(section)) {
      return String(grade * 100 + section);
    }
  }

  const first = s[0];
  const grade = CHINESE_GRADE_MAP[first];
  if (grade) {
    const secMatch = s.slice(1).match(/\d+/);
    if (secMatch) {
      const section = parseInt(secMatch[0], 10);
      if (Number.isFinite(section)) {
        return String(grade * 100 + section);
      }
    }
  }

  return null;
}

function decideRole(fCell: unknown, gCell: unknown): ParsedRole {
  const hasClass = gCell != null && String(gCell).trim() !== "";
  const grade = parseGradeCell(fCell);

  if (hasClass) {
    return {
      kind: "CLASS_TEACHER",
      classNameRaw: String(gCell),
    };
  }

  if (grade != null) {
    return {
      kind: "DUTY_TEACHER",
      managedGrade: grade,
    };
  }

  return {
    kind: "DUTY_TEACHER",
    managedGrade: null,
  };
}

async function findClassByGCell(gCell: unknown): Promise<{ id: string; name: string } | null> {
  const normalized = normalizeClassNameCell(gCell);
  if (!normalized) return null;

  const byName = await prisma.class.findFirst({
    where: { name: normalized },
    select: { id: true, name: true },
  });
  if (byName) return byName;

  const m = normalized.match(/^(\d)(\d{2})$/);
  if (m) {
    const grade = parseInt(m[1], 10);
    const section = parseInt(m[2], 10);
    const byGradeSection = await prisma.class.findFirst({
      where: { grade, section },
      select: { id: true, name: true },
    });
    if (byGradeSection) return byGradeSection;
  }

  return null;
}

async function upsertUserFromRow(
  row: unknown[],
  rowIndex: number,
  stats: ImportStats
): Promise<void> {
  const nameCell = row[0];
  const usernameCell = row[1];
  const passwordCell = row[2];
  const fCell = row[5];
  const gCell = row[6];

  const name = nameCell != null ? String(nameCell).trim() : "";
  const username = usernameCell != null ? String(usernameCell).trim() : "";
  const passwordRaw = passwordCell != null ? String(passwordCell) : "";

  if (!name && !username) {
    stats.skippedEmpty++;
    return;
  }

  if (!username) {
    console.warn(`第 ${rowIndex + 1} 行：缺少用户名，已跳过（姓名=${name || "空"}）`);
    stats.skippedNoUsername++;
    return;
  }

  const roleDecision = decideRole(fCell, gCell);

  let targetRole: User["role"];
  let targetClassId: string | null = null;
  let targetManagedGrade: number | null = null;

  if (roleDecision.kind === "SKIP") {
    return;
  }

  if (roleDecision.kind === "CLASS_TEACHER") {
    targetRole = "CLASS_TEACHER";
    const cls = await findClassByGCell(roleDecision.classNameRaw);
    if (!cls) {
      console.warn(
        `第 ${rowIndex + 1} 行：找不到匹配班级（G 列="${String(
          roleDecision.classNameRaw
        )}"），该老师暂不绑定班级`
      );
      stats.classNotFound++;
      targetClassId = null;
    } else {
      targetClassId = cls.id;
      stats.classTeacherBound++;
    }
  } else {
    targetRole = "DUTY_TEACHER";
    targetManagedGrade = roleDecision.managedGrade;
    if (targetManagedGrade != null) {
      stats.dutyWithGrade++;
    } else {
      stats.dutyWithoutGrade++;
    }
  }

  const existing = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      name: true,
      role: true,
      classId: true,
      managedGrade: true,
    },
  });

  const dataToUpdate: Partial<User> = {
    name,
    role: targetRole,
    classId: targetClassId,
    managedGrade: targetManagedGrade,
  };

  if (passwordRaw && passwordRaw.trim()) {
    const hashed = await bcrypt.hash(passwordRaw.trim(), 10);
    (dataToUpdate as any).password = hashed;
  }

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: dataToUpdate,
    });
    stats.updatedUsers++;
  } else {
    if (!passwordRaw || !passwordRaw.trim()) {
      console.warn(
        `第 ${rowIndex + 1} 行：新用户缺少密码，已跳过创建（username=${username}）`
      );
      stats.skippedNoUsername++;
      return;
    }
    const hashed = await bcrypt.hash(passwordRaw.trim(), 10);
    await prisma.user.create({
      data: {
        name,
        username,
        password: hashed,
        role: targetRole,
        classId: targetClassId,
        managedGrade: targetManagedGrade,
      },
    });
    stats.createdUsers++;
  }
}

async function main() {
  const filePath =
    process.argv[2] ||
    "/Users/seanlee/Desktop/小学部通讯录20260228_拼音版.xlsx";

  console.log("📂 正在读取 Excel 文件：", filePath);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
  });

  const stats: ImportStats = {
    totalRows: rows.length,
    skippedEmpty: 0,
    skippedNoUsername: 0,
    createdUsers: 0,
    updatedUsers: 0,
    classTeacherBound: 0,
    dutyWithGrade: 0,
    dutyWithoutGrade: 0,
    classNotFound: 0,
  };

  console.log(
    `📑 工作表 "${sheetName}" 共有 ${rows.length} 行（含表头），开始处理...`
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) {
      stats.skippedEmpty++;
      continue;
    }

    if (
      i === 0 &&
      row[0] != null &&
      typeof row[0] === "string" &&
      row[0].includes("姓名")
    ) {
      continue;
    }

    try {
      await upsertUserFromRow(row, i, stats);
    } catch (err) {
      console.error(`第 ${i + 1} 行处理失败：`, err);
    }
  }

  console.log("\n✅ 导入完成，统计如下：");
  console.log(`  总行数（含表头）：${stats.totalRows}`);
  console.log(`  跳过空行：${stats.skippedEmpty}`);
  console.log(`  跳过因缺少用户名/新用户缺少密码：${stats.skippedNoUsername}`);
  console.log(`  新建用户：${stats.createdUsers}`);
  console.log(`  更新用户：${stats.updatedUsers}`);
  console.log(`  绑定为班主任的老师：${stats.classTeacherBound}`);
  console.log(`  值日老师（带年级）：${stats.dutyWithGrade}`);
  console.log(`  值日老师（无年级）：${stats.dutyWithoutGrade}`);
  console.log(`  班级匹配失败（需手动检查 G 列或班级列表）：${stats.classNotFound}`);
}

main()
  .catch((e) => {
    console.error("❌ 导入过程中出现错误：", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

