export type ClassData = {
  id: string;
  name: string;
  grade: number;
  section: number;
};

export type UserData = {
  id: string;
  name: string;
  username: string;
  role?: string;
  classId?: string | null;
  managedGrade?: number | null;
};

type SyncPayload = {
  requestId: string;
  classes?: ClassData[];
  users?: UserData[];
  deleteClasses?: string[];
  deleteUsers?: string[];
};

function getSyncConfig(): { url: string; apiKey: string } | null {
  const url = process.env.ATTENDANCE_SYNC_URL;
  const apiKey = process.env.ATTENDANCE_API_KEY;
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

function buildRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function postSyncPayload(payload: SyncPayload): void {
  const config = getSyncConfig();
  if (!config) return;

  fetch(`${config.url}/api/external/sync-users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey,
    },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("[sync-attendance] Sync request failed:", {
          requestId: payload.requestId,
          status: res.status,
          data,
        });
        return;
      }
      if (Array.isArray(data?.failed) && data.failed.length > 0) {
        console.warn("[sync-attendance] Partial sync failure:", {
          requestId: payload.requestId,
          failed: data.failed,
        });
      }
    })
    .catch((err) => {
      console.error("[sync-attendance] Failed to sync payload:", {
        requestId: payload.requestId,
        err,
      });
    });
}

export function mapUserForAttendance(user: {
  id: string;
  name: string;
  username: string;
  role?: string | null;
  classId?: string | null;
  managedGrade?: number | null;
}): UserData {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role ?? "SUBJECT_TEACHER",
    classId: user.classId ?? null,
    managedGrade: user.managedGrade ?? null,
  };
}

export function mapClassForAttendance(cls: {
  id: string;
  name: string;
  grade: number;
  section: number;
}): ClassData {
  return {
    id: cls.id,
    name: cls.name,
    grade: cls.grade,
    section: cls.section,
  };
}

export function syncClassToAttendance(classData: ClassData): void {
  postSyncPayload({
    requestId: buildRequestId("class-upsert"),
    classes: [classData],
  });
}

export function syncClassDeleteToAttendance(classId: string): void {
  postSyncPayload({
    requestId: buildRequestId("class-delete"),
    deleteClasses: [classId],
  });
}

export function syncUserToAttendance(userData: UserData): void {
  postSyncPayload({
    requestId: buildRequestId("user-upsert"),
    users: [userData],
  });
}

export function syncUserDeleteToAttendance(userId: string): void {
  postSyncPayload({
    requestId: buildRequestId("user-delete"),
    deleteUsers: [userId],
  });
}

export function syncBootstrapToAttendance(classes: ClassData[], users: UserData[]): void {
  postSyncPayload({
    requestId: buildRequestId("bootstrap"),
    classes,
    users,
  });
}
