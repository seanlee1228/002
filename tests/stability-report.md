# 班级常规评分系统 — 稳定性测试报告

## 1. 测试概要

| 项目 | 值 |
|------|-----|
| 测试时间 | 2026/2/12 19:18:09 |
| 模拟范围 | 200 个工作日 (2025-05-09 → 2026-02-12) |
| 数据库 | SQLite (Prisma ORM) |
| 服务地址 | http://localhost:3000 |
| Node 版本 | v24.13.1 |

## 2. 数据注入统计

| 数据类型 | 数量 |
|----------|------|
| 用户 | 15 (1 管理员 + 2 值日老师 + 12 班主任) |
| 班级 | 12 (3年级 × 4班) |
| 学期 | 1 |
| 检查项 (InspectionItem) | 694 |
| 评分 (Score) | 8328 |
| **总记录数** | **9050** |
| 注入耗时 | 3.9 秒 |

### 每日数据量

- 每日检查项: 3~4 项 (随机)
- 每日评分: 每项 × 12 班级 = 36~48 条/天
- 分数范围: 6.0~10.0 (随机)

## 3. 数据完整性检查

| # | 检查项 | 结果 | 详情 |
|---|--------|------|------|
| 1 | 用户总数 | ✅ 通过 | 期望 15, 实际 15 |
| 2 | 班级总数 | ✅ 通过 | 期望 12, 实际 12 |
| 3 | 检查项总数 | ✅ 通过 | 期望 694, 实际 694 |
| 4 | 评分总数 | ✅ 通过 | 期望 8328, 实际 8328 |
| 5 | 唯一约束 (classId, inspectionItemId) | ✅ 通过 | 无重复 |
| 6 | 分数范围 (0~10) | ✅ 通过 | 全部在范围内 |
| 7 | 工作日覆盖 | ✅ 通过 | 期望 200 天, 实际 200 天 |
| 8 | 外键关联完整性 | ✅ 通过 | 全部外键有效 |
| 9 | 每日检查项数量 (3~4) | ✅ 通过 | 全部符合 |

**完整性结论: ✅ 全部通过**

## 4. API 响应测试

### 4.1 管理员视角

| 端点 | 状态 | 耗时 | 结果 | 详情 |
|------|------|------|------|------|
| GET /api/scores/dashboard | 200 | 88ms | ✅ | stats.totalClasses=12, weeklyTrend=7天, todayItems=3项 |
| GET /api/scores?period=today | 200 | 12ms | ✅ | classes=12, overallTotal=282.1, overallAvg=7.84 |
| GET /api/scores?period=week | 200 | 12ms | ✅ | classes=12, overallTotal=1232.7, overallAvg=7.9 |
| GET /api/scores?period=month | 200 | 23ms | ✅ | classes=12, overallTotal=3065.9, overallAvg=7.98 |
| GET /api/scores?period=year | 200 | 50ms | ✅ | classes=12, overallTotal=10037.1, overallAvg=7.97 |
| GET /api/inspection?date=2025-06-11 | 200 | 9ms | ✅ | 2025-06-11: 3项 |
| GET /api/inspection?date=2025-08-29 | 200 | 8ms | ✅ | 2025-08-29: 4项 |
| GET /api/inspection?date=2025-05-13 | 200 | 8ms | ✅ | 2025-05-13: 3项 |
| GET /api/inspection?date=2025-12-09 | 200 | 7ms | ✅ | 2025-12-09: 4项 |
| GET /api/inspection?date=2025-05-21 | 200 | 7ms | ✅ | 2025-05-21: 3项 |
| GET /api/classes | 200 | 7ms | ✅ | 12 个班级 |
| GET /api/users | 200 | 8ms | ✅ | 15 个用户 |

### 4.2 值日老师视角

| 端点 | 状态 | 耗时 | 结果 | 详情 |
|------|------|------|------|------|
| GET /api/scores/dashboard | 200 | 178ms | ✅ | stats.scoredClasses=12, inspectionCount=3 |
| GET /api/scoring | 200 | 10ms | ✅ | classes=12, items=3 |

### 4.3 班主任视角

| 角色 | 端点 | 状态 | 耗时 | 结果 | 详情 |
|------|------|------|------|------|------|
| 班主任(teacher1) | GET /api/scores/dashboard | 200 | 86ms | ✅ | classTotalToday=19.9, classAvgWeek=N/A |
| 班主任(teacher1) | GET /api/scores?period=today | 200 | 8ms | ✅ | itemSummaries=3, total=19.9, avg=6.63 |
| 班主任(teacher1) | GET /api/scores?period=week | 200 | 8ms | ✅ | itemSummaries=8, total=100.4, avg=7.72 |
| 班主任(teacher1) | GET /api/scores?period=month | 200 | 8ms | ✅ | itemSummaries=10, total=253.9, avg=7.93 |
| 班主任(teacher1) | GET /api/scores?period=year | 200 | 15ms | ✅ | itemSummaries=12, total=836.7, avg=7.97 |
| 班主任(teacher5) | GET /api/scores/dashboard | 200 | 88ms | ✅ | classTotalToday=24.8, classAvgWeek=N/A |
| 班主任(teacher5) | GET /api/scores?period=today | 200 | 7ms | ✅ | itemSummaries=3, total=24.8, avg=8.27 |
| 班主任(teacher5) | GET /api/scores?period=week | 200 | 7ms | ✅ | itemSummaries=8, total=106.4, avg=8.18 |
| 班主任(teacher5) | GET /api/scores?period=month | 200 | 7ms | ✅ | itemSummaries=10, total=254.1, avg=7.94 |
| 班主任(teacher5) | GET /api/scores?period=year | 200 | 9ms | ✅ | itemSummaries=12, total=830.3, avg=7.91 |
| 班主任(teacher10) | GET /api/scores/dashboard | 200 | 87ms | ✅ | classTotalToday=20.5, classAvgWeek=N/A |
| 班主任(teacher10) | GET /api/scores?period=today | 200 | 7ms | ✅ | itemSummaries=3, total=20.5, avg=6.83 |
| 班主任(teacher10) | GET /api/scores?period=week | 200 | 6ms | ✅ | itemSummaries=8, total=101.9, avg=7.84 |
| 班主任(teacher10) | GET /api/scores?period=month | 200 | 7ms | ✅ | itemSummaries=10, total=263.1, avg=8.22 |
| 班主任(teacher10) | GET /api/scores?period=year | 200 | 8ms | ✅ | itemSummaries=12, total=851.9, avg=8.11 |

## 5. 用户可用性与准确性（使用者视角）

| 角色 | 场景 | 结果 | 详情 |
|------|------|------|------|
| 管理员 | 创建检查项 | ✅ 通过 | HTTP 200, itemId=cmljd7o6i000512tsz9sjpur3 |
| 值日老师 | 提交评分 | ✅ 通过 | HTTP 200 |
| 值日老师 | 评分写入准确性 | ✅ 通过 | DB=8.8, expected=8.8 |
| 班主任 | 查看今日成绩 | ✅ 通过 | API total=28.7, DB total=28.7 |
| 班主任 | 权限限制验证 | ✅ 通过 | expected=403, actual=403 |

## 6. 性能报告

| 端点 | 请求次数 | 最小耗时 | 平均耗时 | 最大耗时 | 状态 |
|------|----------|----------|----------|----------|------|
| GET /api/scores/dashboard | 5 | 86ms | 105ms | 178ms | ✅ |
| GET /api/scores?period=today | 4 | 7ms | 9ms | 12ms | ✅ |
| GET /api/scores?period=week | 4 | 6ms | 8ms | 12ms | ✅ |
| GET /api/scores?period=month | 4 | 7ms | 11ms | 23ms | ✅ |
| GET /api/scores?period=year | 4 | 8ms | 21ms | 50ms | ✅ |
| GET /api/inspection?date=2025-06-11 | 1 | 9ms | 9ms | 9ms | ✅ |
| GET /api/inspection?date=2025-08-29 | 1 | 8ms | 8ms | 8ms | ✅ |
| GET /api/inspection?date=2025-05-13 | 1 | 8ms | 8ms | 8ms | ✅ |
| GET /api/inspection?date=2025-12-09 | 1 | 7ms | 7ms | 7ms | ✅ |
| GET /api/inspection?date=2025-05-21 | 1 | 7ms | 7ms | 7ms | ✅ |
| GET /api/classes | 1 | 7ms | 7ms | 7ms | ✅ |
| GET /api/users | 1 | 8ms | 8ms | 8ms | ✅ |
| GET /api/scoring | 1 | 10ms | 10ms | 10ms | ✅ |

- 慢查询阈值: 2000ms
- 慢查询数量: 0

## 7. 结论

| 维度 | 结果 |
|------|------|
| 数据完整性 | ✅ 通过 |
| API 响应正确性 | ✅ 全部通过 |
| 可用性与准确性场景 | ✅ 通过 |
| 性能 | ✅ 无慢查询 |
| **总体评估** | **✅ 系统稳定且可用** |

未发现问题。系统在 200 个工作日 8,328 条评分数据规模下运行稳定。
