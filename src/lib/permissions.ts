/**
 * 权限检查辅助函数
 * 角色层级: ADMIN > GRADE_LEADER > DUTY_TEACHER / CLASS_TEACHER
 * 预留扩展: PRINCIPAL(校长) / DIRECTOR(主任) 等更高层级
 */

/**
 * 评分权限等级（数字越大，权限越高）
 * 低权限人员不可覆盖高权限人员的评分结果
 */
export const SCORING_AUTHORITY: Record<string, number> = {
  CLASS_TEACHER: 0,
  SUBJECT_TEACHER: 5,
  DUTY_TEACHER: 10,
  GRADE_LEADER: 20,
  ADMIN: 30,
  // 预留上层角色
  // DIRECTOR: 40,
  // PRINCIPAL: 50,
};

/** 获取角色的评分权限等级 */
export function getScoringAuthority(role: string): number {
  return SCORING_AUTHORITY[role] ?? 0;
}

/** 是否为管理级别角色（ADMIN 或 GRADE_LEADER） */
export function isManagerRole(role: string): boolean {
  return role === "ADMIN" || role === "GRADE_LEADER";
}

/** ADMIN 或 GRADE_LEADER 对应年级有权限 */
export function canManageGrade(
  role: string,
  managedGrade: number | null,
  targetGrade: number
): boolean {
  if (role === "ADMIN") return true;
  if (role === "GRADE_LEADER" && managedGrade === targetGrade) return true;
  return false;
}

/**
 * 判断操作者是否可以修改目标用户
 * 规则:
 *  - ADMIN 可以修改任何人
 *  - GRADE_LEADER 不可修改自身角色
 *  - GRADE_LEADER 不可修改 ADMIN 用户
 *  - GRADE_LEADER 不可修改其他 GRADE_LEADER 用户
 */
export function canEditUser(
  operatorRole: string,
  operatorId: string,
  targetRole: string,
  targetId: string
): boolean {
  if (operatorRole === "ADMIN") return true;
  if (operatorRole === "GRADE_LEADER") {
    // 不可修改自身
    if (operatorId === targetId) return false;
    // 不可修改 ADMIN 或其他 GRADE_LEADER
    if (targetRole === "ADMIN" || targetRole === "GRADE_LEADER") return false;
    return true;
  }
  return false;
}

/**
 * GRADE_LEADER 可以分配的角色列表（不包含 ADMIN 和 GRADE_LEADER）
 */
export function getAllowedRolesForGradeLeader(): string[] {
  return ["DUTY_TEACHER", "SUBJECT_TEACHER", "CLASS_TEACHER"];
}

/** 是否为任课教师角色 */
export function isSubjectTeacher(role: string): boolean {
  return role === "SUBJECT_TEACHER";
}

/** 是否有考勤录入权限 */
export function canRecordAttendance(role: string): boolean {
  return ["ADMIN", "GRADE_LEADER", "SUBJECT_TEACHER"].includes(role);
}

/** 是否有考勤管理权限（设置、学生管理等） */
export function canManageAttendance(role: string): boolean {
  return ["ADMIN", "GRADE_LEADER"].includes(role);
}
