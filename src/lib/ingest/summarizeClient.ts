import OpenAI from "openai";
import { z } from "zod";

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

export function getSummaryModel(): string {
  return process.env.SUMMARY_MODEL ?? "gpt-4o-mini";
}

export function maxSceneInputChars(): number {
  return parseInt(process.env.SUMMARY_MAX_INPUT_CHARS_SCENE ?? "24000", 10);
}

const SceneSummarySchema = z.object({
  summary: z.string().min(1),
});

const EpisodeSummarySchema = z.object({
  summary: z.string().min(1),
});

const ChapterSummarySchema = z.object({
  summary: z.string().min(1),
});

export type SceneUnitSnippet = {
  contentType: string;
  speaker: string | null;
  text: string;
  unitIndex: number;
};

function truncateUnitsBlock(units: SceneUnitSnippet[], maxChars: number): string {
  const lines = units.map((u) => {
    const speaker = u.speaker ? `${u.speaker}` : "(无对白者)";
    return `[${u.unitIndex}:${u.contentType}] ${speaker}: ${u.text}`;
  });
  let block = lines.join("\n");
  if (block.length <= maxChars) return block;
  block = block.slice(0, maxChars);
  const nl = block.lastIndexOf("\n");
  return nl > maxChars - 1200 ? block.slice(0, nl) : block;
}

async function summarizeJson(prompt: string, model: string): Promise<string> {
  const completion = await getClient().chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_completion_tokens: 2048,
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Summary model returned non-JSON.");
  }
  return JSON.stringify(parsed);
}

export async function summarizeScene(opts: {
  sceneTitle?: string | null;
  location?: string | null;
  timeHint?: string | null;
  units: SceneUnitSnippet[];
}): Promise<{ summary: string }> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  const maxChars = maxSceneInputChars();
  const ordered = [...opts.units].sort((a, b) => a.unitIndex - b.unitIndex);
  const body = truncateUnitsBlock(ordered, maxChars);
  const model = getSummaryModel();
  const meta = [
    opts.sceneTitle ? `场景标题: ${opts.sceneTitle}` : "",
    opts.location ? `地点: ${opts.location}` : "",
    opts.timeHint ? `时间: ${opts.timeHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `你是叙事摘要助手。根据下方对白/旁白摘录，写成一段简练的中文概要（一段话即可）。必须回答：在场人物有谁、各人做了什么关键决定或行动、涉及地点与时间线索（如有）、情感高点、专有名词必须与原文完全一致。

硬性规则：
- 只根据输入行文，不得捏造输入中不存在的事实或细节。
- 若信息不足以断言某事实，跳过该点，不写猜测。
- 输出严格 JSON（不要 markdown）：{"summary":"..."}

摘录元数据：
${meta || "(无)"}

摘录正文：
---
${body}
---`;

  const json = await summarizeJson(prompt, model);
  const out = SceneSummarySchema.parse(JSON.parse(json));
  return out;
}

export async function summarizeEpisode(opts: {
  episodeTitle?: string | null;
  sceneSummaries: Array<{ sceneTitle?: string | null; summary: string }>;
}): Promise<{ summary: string }> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  const model = getSummaryModel();
  const lines = opts.sceneSummaries.map((s, i) =>
    `[${i + 1}] ${s.sceneTitle ?? "Scene"}:\n${s.summary}`.trim(),
  );
  const block = lines.join("\n\n");
  const titleLine = opts.episodeTitle ? `篇章标题（如有）: ${opts.episodeTitle}\n` : "";
  const prompt = `下面是同一篇章内若干场景的概要，已由更细粒度摘录生成。请将它们汇总为一段简洁的中文概要，连贯叙述情节推进与人物意图，专有名词必须与输入一致。
硬性规则：
- 只根据输入行文，禁止臆造不存在的事实。
- JSON 仅此形状：{"summary":"..."}

${titleLine}
各场景概要：
---
${block}
---`;

  const json = await summarizeJson(prompt, model);
  return EpisodeSummarySchema.parse(JSON.parse(json));
}

export async function summarizeChapter(opts: {
  chapterName: string;
  episodeSummaries: Array<{
    episodeLabel?: string | null;
    episodeTitle?: string | null;
    summary: string;
  }>;
}): Promise<{ summary: string }> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  const model = getSummaryModel();
  const lines = opts.episodeSummaries.map((e, i) => {
    const label = [e.episodeLabel, e.episodeTitle].filter(Boolean).join(" / ");
    return `[${i + 1}] ${label || "Episode"}:\n${e.summary}`.trim();
  });
  const block = lines.join("\n\n");

  const prompt = `下面是同一章节的不同篇章概要。请写成一段简练的中文章节级摘要，串联主线与转折，专有名词必须与输入一致。
硬性规则：
- 只依据输入，不得编造不存在的事件。
- JSON：{"summary":"..."}

章节名: ${opts.chapterName}

各篇章概要：
---
${block}
---`;

  const json = await summarizeJson(prompt, model);
  return ChapterSummarySchema.parse(JSON.parse(json));
}

