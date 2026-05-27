import OpenAI from "openai";
import { z } from "zod";
import type { SceneUnitSnippet } from "./summarizeClient";
import { getSummaryModel, maxSceneInputChars } from "./summarizeClient";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const timeoutMs = parseInt(process.env.SUMMARY_TIMEOUT_MS ?? "120000", 10);
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      timeout: timeoutMs,
    });
  }
  return client;
}

export const FactItemSchema = z.object({
  subject: z.union([z.string(), z.null()]).optional(),
  predicate: z.union([z.string(), z.null()]).optional(),
  object: z.union([z.string(), z.null()]).optional(),
  temporal_index: z.number().int().optional().nullable(),
  polarity: z.enum(["affirm", "negate"]).optional(),
  confidence: z.number().nullish(),
  text_form: z.string().min(1),
  source_unit_indices: z.array(z.number().int().nonnegative()).default([]),
});

export const FactsResponseSchema = z.object({
  facts: z.array(FactItemSchema),
});

export type ExtractedFact = z.infer<typeof FactItemSchema>;

function truncateSceneInput(sceneSummary: string, units: SceneUnitSnippet[]): string {
  const maxChars = maxSceneInputChars();
  const ordered = [...units].sort((a, b) => a.unitIndex - b.unitIndex);
  const unitBlock = ordered
    .map((u) => {
      const speaker = u.speaker ? `${u.speaker}` : "(无对白者)";
      return `[idx=${u.unitIndex}:${u.contentType}] ${speaker}: ${u.text}`;
    })
    .join("\n");

  let head = sceneSummary.trim();
  if (head.length + unitBlock.length + 20 > maxChars) {
    head = `${head.slice(0, Math.max(0, maxChars - unitBlock.length - 120))}\n...(场景摘要过长已截断)`;
  }

  let block = `${head}\n\n---对白/旁白---\n${unitBlock}`;
  if (block.length > maxChars) {
    block = block.slice(0, maxChars);
    const nl = block.lastIndexOf("\n");
    if (nl > maxChars - 400) block = block.slice(0, nl);
  }
  return block;
}

export async function extractSceneFacts(opts: {
  sceneSummary: string;
  units: SceneUnitSnippet[];
}): Promise<ExtractedFact[]> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  const model = getSummaryModel();
  const body = truncateSceneInput(opts.sceneSummary, opts.units);

  const prompt = `你是结构化事实抽取器。给定场景摘要与同场景对白/旁白，抽取“主体做了什么/决定什么（施事性陈述）”。输出 JSON：
{"facts":[{
  "subject":"主体专有名词，必须与原文一致或可空",
  "predicate":"谓词或动作表述",
  "object":"客体专有名词必须与原文一致，可短句，可空",
  "temporal_index":仅在文本明确分出“第一次/第二次…”或清晰顺序时出现整数，否则 null,
  "polarity":"affirm"或"negate"（否定事实时使用 negate）,
  "confidence":0到1可选,
  "text_form":"适合向量检索的中文单句陈述，必须以句号结尾",
  "source_unit_indices":支持该事实的 unit 行索引（使用输入中的 idx= 数值，可多选）
}]}

规则：
- 每个事实对应一条不可分割的施事/决策陈述；不要把多个独立事件揉成一条。
- subject/object 必须使用输入中出现过的称谓或实体写法，禁止擅自改名或凭空实体。
- 若无法从文本支持某一事实则不要输出该事实。
- 若无符合条件的事实，输出 {"facts":[]}。

时序事实规则（极其重要）：
- 当原文包含"再次""又""第N次""上回""回到""第二次""前几天""之后""后来"等时序/重复线索时，必须输出对应的事实并在 temporal_index 中标明顺序（例如第二次出现填 2）。
- 示例：原文说"我们又去了枫河" → 应输出事实"左然和<用户>再次去了枫河"，temporal_index 根据上下文填整数。
- 但不要凭空编造第二次访问：只有当原文明确支持重复/顺序时，才输出这类事实。

文本：
---
${body}
---`;

  const completion = await getClient().chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
    temperature: 0.15,
    max_completion_tokens: 4096,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Facts model returned non-JSON.");
  }
  const validated = FactsResponseSchema.parse(parsed);
  return validated.facts;
}
