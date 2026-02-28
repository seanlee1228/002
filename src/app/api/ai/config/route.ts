import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale, createTranslator } from "@/lib/server-i18n";

const SCOPE_IDS = ["daily-recommend", "global", "grade", "duty"] as const;

function getModuleScopes(
  tm: (key: string) => string
): Array<{ scope: string; label: string; description: string }> {
  return [
    {
      scope: "daily-recommend",
      label: tm("dailyRecommendLabel"),
      description: tm("dailyRecommendDesc"),
    },
    { scope: "global", label: tm("globalLabel"), description: tm("globalDesc") },
    { scope: "grade", label: tm("gradeLabel"), description: tm("gradeDesc") },
    { scope: "duty", label: tm("dutyLabel"), description: tm("dutyDesc") },
  ];
}

// ===== GET: 获取所有模组配置 =====
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const locale = await getLocale();
  const tm = createTranslator(locale, "api.modules");
  const t = createTranslator(locale, "api.errors");
  const ALL_MODULE_SCOPES = getModuleScopes(tm);

  try {
    // 从数据库读取已存在的配置
    const dbConfigs = await prisma.aiModuleConfig.findMany();
    const configMap = new Map(dbConfigs.map((c) => [c.scope, c]));

    // 合并默认值：如果 DB 中没有某个 scope 的记录，返回代码默认值
    const configs = ALL_MODULE_SCOPES.map((def) => {
      const db = configMap.get(def.scope);
      if (db) {
        return {
          scope: db.scope,
          label: db.label || def.label,
          description: db.description || def.description,
          systemPrompt: db.systemPrompt,
          temperature: db.temperature,
          maxTokens: db.maxTokens,
          model: db.model,
          isActive: db.isActive,
          updatedAt: db.updatedAt,
        };
      }
      return {
        scope: def.scope,
        label: def.label,
        description: def.description,
        systemPrompt: "",
        temperature: 0.3,
        maxTokens: 2000,
        model: "deepseek-chat",
        isActive: true,
        updatedAt: null,
      };
    });

    return NextResponse.json({ configs });
  } catch (error) {
    console.error("[AI Config GET]", error);
    return NextResponse.json({ error: t("configLoadFailed") }, { status: 500 });
  }
}

// ===== PUT: 更新指定 scope 的配置 =====
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const locale = await getLocale();
  const tm = createTranslator(locale, "api.modules");
  const t = createTranslator(locale, "api.errors");
  const ALL_MODULE_SCOPES = getModuleScopes(tm);

  try {
    const body = await request.json();
    const { scope, systemPrompt, temperature, maxTokens, model, isActive } = body;

    if (!scope || !SCOPE_IDS.includes(scope as (typeof SCOPE_IDS)[number])) {
      return NextResponse.json({ error: t("invalidScope") }, { status: 400 });
    }

    const def = ALL_MODULE_SCOPES.find((m) => m.scope === scope)!;

    const config = await prisma.aiModuleConfig.upsert({
      where: { scope },
      update: {
        ...(systemPrompt !== undefined && { systemPrompt }),
        ...(temperature !== undefined && { temperature: Number(temperature) }),
        ...(maxTokens !== undefined && { maxTokens: Number(maxTokens) }),
        ...(model !== undefined && { model }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
      create: {
        scope,
        label: def.label,
        description: def.description,
        systemPrompt: systemPrompt ?? "",
        temperature: temperature !== undefined ? Number(temperature) : 0.3,
        maxTokens: maxTokens !== undefined ? Number(maxTokens) : 2000,
        model: model ?? "deepseek-chat",
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    console.error("[AI Config PUT]", error);
    return NextResponse.json({ error: t("configUpdateFailed") }, { status: 500 });
  }
}
