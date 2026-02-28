import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isManagerRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  mapClassForAttendance,
  mapUserForAttendance,
  syncBootstrapToAttendance,
} from "@/lib/sync-attendance";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManagerRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [classes, users] = await Promise.all([
    prisma.class.findMany({
      orderBy: [{ grade: "asc" }, { section: "asc" }],
    }),
    prisma.user.findMany({
      where: {
        role: {
          in: ["ADMIN", "GRADE_LEADER", "DUTY_TEACHER", "CLASS_TEACHER", "SUBJECT_TEACHER"],
        },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);

  syncBootstrapToAttendance(
    classes.map(mapClassForAttendance),
    users.map(mapUserForAttendance),
  );

  return NextResponse.json({
    ok: true,
    syncedClasses: classes.length,
    syncedUsers: users.length,
  });
}
