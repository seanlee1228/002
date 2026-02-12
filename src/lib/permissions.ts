/**
 * 权限检查辅助函数
 * 角色层级: ADMIN > GRADE_LEADER > DUTY_TEACHER / CLASS_TEACHER
 */

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
  return ["DUTY_TEACHER", "CLASS_TEACHER"];
}
