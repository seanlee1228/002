/**
 * 检查项升级脚本 — 安全地将 D-1~D-8 升级为 D-1~D-9 新定义
 *
 * 功能：
 * - 更新 D-1~D-8 的 title、description、planCategory
 * - 新增 D-9（放学及路队秩序）
 * - 更新 W-1~W-5 的 title、description
 * - 不删除任何现有数据和记录
 *
 * 用法：npx tsx scripts/upgrade-check-items.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DAILY_ITEMS = [
  { code: "D-1", title: "教室卫生与整理", description: "地面无可见垃圾/污渍，黑板擦净；桌椅偏离不超过1/3，清洁工具和体育器材定点归位", sortOrder: 1, planCategory: "resident" },
  { code: "D-2", title: "包干区卫生", description: "教室外包干区域（走廊、楼梯等）地面无垃圾，墙面无明显人为污损", sortOrder: 2, planCategory: "resident" },
  { code: "D-3", title: "课前准备", description: "铃响后1分钟内全班就座安静，走动或聊天人数不超过2人", sortOrder: 3, planCategory: "rotating" },
  { code: "D-4", title: "课堂纪律", description: "趴桌、转身聊天、随意插话等违纪行为人数不超过2人", sortOrder: 4, planCategory: "rotating" },
  { code: "D-5", title: "课间安全", description: "走廊、楼梯、教室内无奔跑追逐、推搡、攀爬栏杆等危险行为（操场正常活动不计）", sortOrder: 5, planCategory: "rotating" },
  { code: "D-6", title: "眼保健操", description: "音乐响后全班安静，睁眼或讲话人数不超过2人", sortOrder: 6, planCategory: "rotating" },
  { code: "D-7", title: "课间操", description: "铃响后3分钟内集合完毕，队列安静整齐，动作明显不到位人数不超过全班1/5", sortOrder: 7, planCategory: "rotating" },
  { code: "D-8", title: "文明礼仪", description: "着装整洁，按要求穿校服（校服日）；见师长能主动问好；同学间无骂人、起外号等不文明言行", sortOrder: 8, planCategory: "rotating" },
  { code: "D-9", title: "放学及路队秩序", description: "路队整齐安静，无学生无故逗留；教室已断电、关窗、关门", sortOrder: 9, planCategory: "rotating" },
];

const WEEKLY_ITEMS = [
  { code: "W-1", title: "室外课出勤", description: "统计室外课未提前请假且无事后补假的缺勤人次：0人次 / 1人次 / ≥2人次", sortOrder: 1 },
  { code: "W-2", title: "当周安全事故记录", description: "记录需送医务室及以上处理的安全事故起数及处理情况", sortOrder: 2 },
  { code: "W-3", title: "当周学生冲突记录", description: "记录需教师介入处理或已上报的学生冲突事件", sortOrder: 3 },
  { code: "W-4", title: "当周家长有效反馈/投诉", description: "记录家长通过正式渠道提出的需学校回应或处理的诉求", sortOrder: 4 },
  { code: "W-5", title: "本周班级整体运行等级", description: "A(卓越)：达标率≥90%且无严重/一般不达标，W-1~W-4均为0；B(良好)：达标率70%~89%，单项≤1起；C(预警)：达标率<70%或有严重不达标或任一≥2起", sortOrder: 5 },
];

async function main() {
  console.log("🔄 开始升级检查项定义...\n");

  // 升级日评项
  for (const item of DAILY_ITEMS) {
    const existing = await prisma.checkItem.findFirst({
      where: { code: item.code },
    });

    if (existing) {
      await prisma.checkItem.update({
        where: { id: existing.id },
        data: {
          title: item.title,
          description: item.description,
          sortOrder: item.sortOrder,
          planCategory: item.planCategory,
        },
      });
      console.log(`  ✅ ${item.code} ${item.title} — 已更新`);
    } else {
      await prisma.checkItem.create({
        data: {
          code: item.code,
          module: "DAILY",
          title: item.title,
          description: item.description,
          sortOrder: item.sortOrder,
          isDynamic: false,
          planCategory: item.planCategory,
        },
      });
      console.log(`  ✨ ${item.code} ${item.title} — 新增`);
    }
  }

  console.log("");

  // 升级周评项
  for (const item of WEEKLY_ITEMS) {
    const existing = await prisma.checkItem.findFirst({
      where: { code: item.code },
    });

    if (existing) {
      await prisma.checkItem.update({
        where: { id: existing.id },
        data: {
          title: item.title,
          description: item.description,
          sortOrder: item.sortOrder,
        },
      });
      console.log(`  ✅ ${item.code} ${item.title} — 已更新`);
    } else {
      await prisma.checkItem.create({
        data: {
          code: item.code,
          module: "WEEKLY",
          title: item.title,
          description: item.description,
          sortOrder: item.sortOrder,
          isDynamic: false,
        },
      });
      console.log(`  ✨ ${item.code} ${item.title} — 新增`);
    }
  }

  console.log("\n🎉 检查项升级完成！");
  console.log("   - 日评项：D-1 ~ D-9（9 项固定 + 动态临增项）");
  console.log("   - 周评项：W-1 ~ W-5");
  console.log("   - 现有检查记录未受影响");
}

main()
  .catch((e) => {
    console.error("❌ 升级失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
