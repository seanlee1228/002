import OpenAI from "openai";

// DeepSeek 客户端（兼容 OpenAI 协议）
export const ai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: "https://api.deepseek.com",
});

/**
 * 结构化 JSON 分析（用于定时分析任务）
 * 支持通过 options 覆盖默认参数（来自 AiModuleConfig）
 */
export async function analyzeJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number; model?: string },
): Promise<{ result: T; tokens: number }> {
  const res = await ai.chat.completions.create({
    model: options?.model ?? "deepseek-chat",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 2000,
  });
  const text = res.choices[0]?.message?.content ?? "{}";
  const tokens = res.usage?.total_tokens ?? 0;
  try {
    return { result: JSON.parse(text) as T, tokens };
  } catch {
    throw new Error(
      `AI 返回了无效的 JSON 内容，无法解析。原始内容: ${text.slice(0, 200)}`
    );
  }
}

/**
 * 通用对话接口（未来 Q&A 系统用）
 */
export async function chat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<{ content: string; tokens: number }> {
  const res = await ai.chat.completions.create({
    model: "deepseek-chat",
    messages,
    temperature: 0.7,
    max_tokens: 2000,
  });
  return {
    content: res.choices[0]?.message?.content ?? "",
    tokens: res.usage?.total_tokens ?? 0,
  };
}
