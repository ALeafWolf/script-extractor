import { eq, asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  storyScenes,
  storyEpisodes,
  storyChapters,
  storyUnits,
  storyFacts,
} from "@/db/schema";
import { batchEmbed } from "./embedClient";
import { extractSceneFacts, type ExtractedFact } from "./factsClient";
import {
  summarizeScene,
  summarizeEpisode,
  summarizeChapter,
  getSummaryModel,
  type SceneUnitSnippet,
} from "./summarizeClient";
import type { PostCommitIngestPayload } from "./types";

export type EnrichmentCounters = {
  summariesGenerated: { scenes: number; episodes: number; chapters: number };
  factsGenerated: number;
};

const emptyCounters = (): EnrichmentCounters => ({
  summariesGenerated: { scenes: 0, episodes: 0, chapters: 0 },
  factsGenerated: 0,
});

function toSnippets<T extends SceneUnitSnippet>(units: T[]): SceneUnitSnippet[] {
  return units.map((u) => ({
    contentType: u.contentType,
    speaker: u.speaker ?? null,
    text: u.text,
    unitIndex: u.unitIndex,
  }));
}

export function mapUnitIndicesToStoryUnitIds(
  unitIndices: number[],
  payloadUnits: Array<{ id: string; unitIndex: number }>,
): string[] {
  const byIdx = new Map<number, string>();
  for (const u of payloadUnits) {
    byIdx.set(u.unitIndex, u.id);
  }
  const out: string[] = [];
  for (const ix of unitIndices) {
    const id = byIdx.get(ix);
    if (id) out.push(id);
  }
  return [...new Set(out)];
}

/** Post-commit enrichment after ingest: scene → episode → chapter summaries + embeddings, then facts. */
export async function postCommitEnrich(
  payload: PostCommitIngestPayload | null,
  ctx: {
    warnings: string[];
    force?: boolean;
    skipEpisodeRollup?: boolean;
    skipChapterRollup?: boolean;
    /** When true, skip structured facts extraction/write. */
    skipFacts?: boolean;
  },
): Promise<EnrichmentCounters> {
  const result = emptyCounters();
  const force = ctx.force ?? false;
  const { warnings } = ctx;

  if (!payload || payload.scenes.length === 0) return result;

  if (!process.env.OPENAI_API_KEY) {
    warnings.push("Auto summary/facts skipped: OPENAI_API_KEY is not set.");
    return result;
  }

  const db = getDb();
  const model = getSummaryModel();
  const summaryByScene = new Map<string, string>();

  type SceneTodo = {
    sceneId: string;
    summaryText: string;
    payloadUnits: PostCommitIngestPayload["scenes"][0]["units"];
  };
  const sceneTodos: SceneTodo[] = [];

  for (const s of payload.scenes) {
    const [row] = await db
      .select()
      .from(storyScenes)
      .where(eq(storyScenes.id, s.sceneId))
      .limit(1);

    if (!row) {
      warnings.push(`postCommitEnrich: scene ${s.sceneId} not found`);
      continue;
    }

    if (!force && row.manuallyEdited) {
      warnings.push(`Skipped auto summary for scene ${s.sceneId} (manually_edited=true).`);
      const existing = row.sceneSummary?.trim();
      if (existing) summaryByScene.set(s.sceneId, existing);
      continue;
    }

    if (
      !force &&
      row.sceneSummaryEmbedding !== null &&
      row.summaryGeneratedAt !== null &&
      row.sceneSummary?.trim()
    ) {
      summaryByScene.set(s.sceneId, row.sceneSummary.trim());
      continue;
    }

    try {
      const snippets = toSnippets(s.units);
      const { summary } = await summarizeScene({
        sceneTitle: s.sceneTitle,
        location: s.location,
        timeHint: s.timeHint,
        units: snippets,
      });
      sceneTodos.push({
        sceneId: s.sceneId,
        summaryText: summary.trim(),
        payloadUnits: s.units,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`Scene summary failed (${s.sceneId}): ${msg}`);
    }
  }

  const sceneEmbeddings =
    sceneTodos.length > 0 ? await batchEmbed(sceneTodos.map((t) => t.summaryText)) : [];

  const nowScene = new Date();
  for (let i = 0; i < sceneTodos.length; i++) {
    const todo = sceneTodos[i];
    const emb = sceneEmbeddings[i];
    try {
      await db
        .update(storyScenes)
        .set({
          sceneSummary: todo.summaryText,
          sceneSummaryEmbedding: emb ?? null,
          summaryModel: model,
          summaryGeneratedAt: nowScene,
        })
        .where(eq(storyScenes.id, todo.sceneId));
      summaryByScene.set(todo.sceneId, todo.summaryText);
      result.summariesGenerated.scenes++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`Failed to persist scene summary (${todo.sceneId}): ${msg}`);
    }
    if (!emb) {
      warnings.push(`Scene summary embedding missing for scene ${todo.sceneId} (embedding API).`);
    }
  }

  for (const s of payload.scenes) {
    if (summaryByScene.has(s.sceneId)) continue;
    const [row] = await db
      .select()
      .from(storyScenes)
      .where(eq(storyScenes.id, s.sceneId))
      .limit(1);
    const t = row?.sceneSummary?.trim();
    if (t) summaryByScene.set(s.sceneId, t);
  }

  // ---------- Facts (per payload scene) ----------
  if (!ctx.skipFacts) {
  type FactPending = {
    fact: ExtractedFact;
    characterId: string;
    chapterId: string;
    episodeId: string;
    sceneId: string;
    sourceUnitIds: string[];
    textForm: string;
  };
  const pendingFacts: FactPending[] = [];

  for (const s of payload.scenes) {
    const text = summaryByScene.get(s.sceneId)?.trim();
    if (!text) continue;

    const [marker] = await db
      .select({ manuallyEdited: storyScenes.manuallyEdited })
      .from(storyScenes)
      .where(eq(storyScenes.id, s.sceneId))
      .limit(1);

    if (marker?.manuallyEdited && !force) {
      warnings.push(`Skipped facts for scene ${s.sceneId} (manually_edited=true).`);
      continue;
    }

    try {
      await db.delete(storyFacts).where(eq(storyFacts.sceneId, s.sceneId));
      const facts = await extractSceneFacts({
        sceneSummary: text,
        units: toSnippets(s.units),
      });
      for (const f of facts) {
        pendingFacts.push({
          fact: f,
          characterId: payload.characterId,
          chapterId: payload.chapterId,
          episodeId: payload.episodeId,
          sceneId: s.sceneId,
          sourceUnitIds: mapUnitIndicesToStoryUnitIds(f.source_unit_indices ?? [], s.units),
          textForm: f.text_form,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`Fact extraction/storage failed (${s.sceneId}): ${msg}`);
    }
  }

  if (pendingFacts.length > 0) {
    const embeds = await batchEmbed(pendingFacts.map((p) => p.textForm));
    for (let i = 0; i < pendingFacts.length; i++) {
      const p = pendingFacts[i];
      const f = p.fact;
      const embedding = embeds[i];
      try {
        await db.insert(storyFacts).values({
          characterId: p.characterId,
          chapterId: p.chapterId,
          episodeId: p.episodeId,
          sceneId: p.sceneId,
          subject: f.subject ?? null,
          predicate: f.predicate ?? null,
          object: f.object ?? null,
          temporalIndex: f.temporal_index ?? null,
          polarity: f.polarity ?? null,
          confidence: f.confidence ?? null,
          textForm: p.textForm,
          embedding: embedding ?? null,
          sourceUnitIds: p.sourceUnitIds,
          manuallyEdited: false,
          manuallyEditedAt: null,
        });
        result.factsGenerated++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`Failed inserting fact for scene ${p.sceneId}: ${msg}`);
      }
    }
    if (embeds.some((e) => e === null)) {
      warnings.push("Some fact rows were stored without embeddings (embedding API).");
    }
  }
  }

  // ---------- Episode rollup ----------
  if (!ctx.skipEpisodeRollup) {
    try {
      const [episodeRow] = await db
        .select()
        .from(storyEpisodes)
        .where(eq(storyEpisodes.id, payload.episodeId))
        .limit(1);

      if (!episodeRow) {
        warnings.push(`postCommitEnrich: episode ${payload.episodeId} not found`);
      } else if (!force && episodeRow.manuallyEdited) {
        warnings.push(`Skipped episode summary rollup (manually_edited=true): ${payload.episodeId}`);
      } else {
        const sceneRows = await db
          .select({
            sceneTitle: storyScenes.sceneTitle,
            sceneSummary: storyScenes.sceneSummary,
            sceneOrder: storyScenes.sceneOrder,
          })
          .from(storyScenes)
          .where(eq(storyScenes.episodeId, payload.episodeId))
          .orderBy(asc(storyScenes.sceneOrder));

        const summaries = sceneRows
          .map((r) => ({
            sceneTitle: r.sceneTitle,
            summary: r.sceneSummary?.trim() ?? "",
          }))
          .filter((x) => x.summary.length > 0);

        if (summaries.length === 0) {
          warnings.push(`Episode rollup skipped: no scene summaries present (${payload.episodeId}).`);
        } else {
          const { summary: epSummary } = await summarizeEpisode({
            episodeTitle: episodeRow.episodeTitle ?? payload.episodeTitle,
            sceneSummaries: summaries,
          });
          const [emb] = await batchEmbed([epSummary.trim()]);
          const nowEp = new Date();
          await db
            .update(storyEpisodes)
            .set({
              summary: epSummary.trim(),
              summaryEmbedding: emb ?? null,
              summaryModel: model,
              summaryGeneratedAt: nowEp,
            })
            .where(eq(storyEpisodes.id, payload.episodeId));
          result.summariesGenerated.episodes++;
          if (!emb) warnings.push(`Episode summary embedding missing (${payload.episodeId}).`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`Episode summary rollup failed: ${msg}`);
    }
  }

  // ---------- Chapter rollup ----------
  if (!ctx.skipChapterRollup) {
    try {
      const [chapterRow] = await db
        .select()
        .from(storyChapters)
        .where(eq(storyChapters.id, payload.chapterId))
        .limit(1);

      if (!chapterRow) {
        warnings.push(`postCommitEnrich: chapter ${payload.chapterId} not found`);
      } else if (!force && chapterRow.manuallyEdited) {
        warnings.push(`Skipped chapter summary rollup (manually_edited=true): ${payload.chapterId}`);
      } else {
        const epRows = await db
          .select({
            episodeLabel: storyEpisodes.episodeLabel,
            episodeTitle: storyEpisodes.episodeTitle,
            summary: storyEpisodes.summary,
            episodeOrder: storyEpisodes.episodeOrder,
          })
          .from(storyEpisodes)
          .where(eq(storyEpisodes.chapterId, payload.chapterId))
          .orderBy(asc(storyEpisodes.episodeOrder));

        const episodeSummaries = epRows
          .map((e) => ({
            episodeLabel: e.episodeLabel,
            episodeTitle: e.episodeTitle,
            summary: e.summary?.trim() ?? "",
          }))
          .filter((x) => x.summary.length > 0);

        if (episodeSummaries.length === 0) {
          warnings.push(`Chapter rollup skipped: no episode summaries (${payload.chapterId}).`);
        } else {
          const { summary: chSummary } = await summarizeChapter({
            chapterName: chapterRow.chapterName ?? payload.chapterName,
            episodeSummaries,
          });
          const [emb] = await batchEmbed([chSummary.trim()]);
          const nowCh = new Date();
          await db
            .update(storyChapters)
            .set({
              summary: chSummary.trim(),
              summaryEmbedding: emb ?? null,
              summaryModel: model,
              summaryGeneratedAt: nowCh,
            })
            .where(eq(storyChapters.id, payload.chapterId));
          result.summariesGenerated.chapters++;
          if (!emb) warnings.push(`Chapter summary embedding missing (${payload.chapterId}).`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`Chapter summary rollup failed: ${msg}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Backfill / regenerate helpers (load from DB by id)
// ---------------------------------------------------------------------------

export async function enrichSingleSceneFromDb(
  sceneId: string,
  ctx: { warnings: string[]; force?: boolean; skipFacts?: boolean },
): Promise<{ summaryWritten: boolean; factsWritten: number }> {
  const { warnings } = ctx;
  if (!process.env.OPENAI_API_KEY) {
    warnings.push("OPENAI_API_KEY is not set.");
    return { summaryWritten: false, factsWritten: 0 };
  }

  const db = getDb();
  const [scene] = await db.select().from(storyScenes).where(eq(storyScenes.id, sceneId)).limit(1);
  if (!scene) {
    warnings.push(`Scene not found: ${sceneId}`);
    return { summaryWritten: false, factsWritten: 0 };
  }

  const unitsRows = await db
    .select()
    .from(storyUnits)
    .where(eq(storyUnits.sceneId, sceneId))
    .orderBy(asc(storyUnits.unitIndex));

  const payloadUnits = unitsRows.map((u) => ({
    id: u.id,
    contentType: u.contentType,
    speaker: u.speaker,
    text: u.textContent,
    unitIndex: u.unitIndex,
  }));

  const [episodeRowMeta] = await db
    .select({ episodeTitle: storyEpisodes.episodeTitle })
    .from(storyEpisodes)
    .where(eq(storyEpisodes.id, scene.episodeId))
    .limit(1);
  const [chapterRowMeta] = await db
    .select({ chapterName: storyChapters.chapterName })
    .from(storyChapters)
    .where(eq(storyChapters.id, scene.chapterId))
    .limit(1);

  const payload: PostCommitIngestPayload = {
    characterId: scene.characterId,
    chapterId: scene.chapterId,
    episodeId: scene.episodeId,
    chapterName: chapterRowMeta?.chapterName ?? "",
    episodeTitle: episodeRowMeta?.episodeTitle ?? null,
    scenes: [
      {
        sceneId,
        sceneTitle: scene.sceneTitle,
        location: scene.location,
        timeHint: scene.timeHint,
        units: payloadUnits,
      },
    ],
  };

  const c = await postCommitEnrich(payload, {
    warnings,
    force: ctx.force,
    skipEpisodeRollup: true,
    skipChapterRollup: true,
    skipFacts: ctx.skipFacts === true,
  });
  return {
    summaryWritten: c.summariesGenerated.scenes > 0,
    factsWritten: c.factsGenerated,
  };
}

/** Recompute `story_facts` from existing scene summary + units (no summary LLM). */
export async function refreshFactsForScene(
  sceneId: string,
  ctx: { warnings: string[]; force?: boolean },
): Promise<number> {
  const force = ctx.force ?? false;
  const { warnings } = ctx;
  if (!process.env.OPENAI_API_KEY) {
    warnings.push("OPENAI_API_KEY is not set.");
    return 0;
  }

  const db = getDb();
  const model = getSummaryModel();
  const [scene] = await db.select().from(storyScenes).where(eq(storyScenes.id, sceneId)).limit(1);
  if (!scene) {
    warnings.push(`Scene not found (facts): ${sceneId}`);
    return 0;
  }
  const summaryText = scene.sceneSummary?.trim();
  if (!summaryText) {
    warnings.push(`Scene ${sceneId} has no scene_summary; run scene summarization first.`);
    return 0;
  }
  if (scene.manuallyEdited && !force) {
    warnings.push(`Skipped facts (manually_edited scene): ${sceneId}`);
    return 0;
  }

  const unitsRows = await db
    .select()
    .from(storyUnits)
    .where(eq(storyUnits.sceneId, sceneId))
    .orderBy(asc(storyUnits.unitIndex));

  const payloadUnits = unitsRows.map((u) => ({
    id: u.id,
    contentType: u.contentType,
    speaker: u.speaker,
    text: u.textContent,
    unitIndex: u.unitIndex,
  }));

  type FactPending = {
    fact: ExtractedFact;
    sourceUnitIds: string[];
    textForm: string;
  };
  let pendingFacts: FactPending[] = [];

  try {
    await db.delete(storyFacts).where(eq(storyFacts.sceneId, sceneId));
    const facts = await extractSceneFacts({
      sceneSummary: summaryText,
      units: toSnippets(payloadUnits),
    });
    pendingFacts = facts.map((f) => ({
      fact: f,
      sourceUnitIds: mapUnitIndicesToStoryUnitIds(f.source_unit_indices ?? [], payloadUnits),
      textForm: f.text_form,
    }));
  } catch (e) {
    warnings.push(
      `Facts refresh failed (${sceneId}): ${e instanceof Error ? e.message : String(e)}`,
    );
    return 0;
  }

  let written = 0;
  const embeds = pendingFacts.length > 0 ? await batchEmbed(pendingFacts.map((p) => p.textForm)) : [];
  for (let i = 0; i < pendingFacts.length; i++) {
    const p = pendingFacts[i];
    const f = p.fact;
    const embedding = embeds[i];
    try {
      await db.insert(storyFacts).values({
        characterId: scene.characterId,
        chapterId: scene.chapterId,
        episodeId: scene.episodeId,
        sceneId,
        subject: f.subject ?? null,
        predicate: f.predicate ?? null,
        object: f.object ?? null,
        temporalIndex: f.temporal_index ?? null,
        polarity: f.polarity ?? null,
        confidence: f.confidence ?? null,
        textForm: p.textForm,
        embedding: embedding ?? null,
        sourceUnitIds: p.sourceUnitIds,
        manuallyEdited: false,
        manuallyEditedAt: null,
      });
      written++;
    } catch (e) {
      warnings.push(
        `Failed inserting refreshed fact (${sceneId}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  if (embeds.some((e) => e === null))
    warnings.push(`Some fact embeddings missing (${sceneId}, model ${model}).`);
  return written;
}
export async function rollupEpisodeFromDb(episodeId: string, warnings: string[], force?: boolean): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY) return false;
  const db = getDb();
  const model = getSummaryModel();
  const [episodeRow] = await db
    .select()
    .from(storyEpisodes)
    .where(eq(storyEpisodes.id, episodeId))
    .limit(1);
  if (!episodeRow) {
    warnings.push(`Episode not found: ${episodeId}`);
    return false;
  }
  if (!force && episodeRow.manuallyEdited) {
    warnings.push(`Skipped episode rollup (manually_edited=true): ${episodeId}`);
    return false;
  }
  if (
    !force &&
    episodeRow.summaryEmbedding !== null &&
    episodeRow.summaryGeneratedAt !== null &&
    episodeRow.summary?.trim()
  ) {
    return false;
  }

  const sceneRows = await db
    .select({
      sceneTitle: storyScenes.sceneTitle,
      sceneSummary: storyScenes.sceneSummary,
      sceneOrder: storyScenes.sceneOrder,
    })
    .from(storyScenes)
    .where(eq(storyScenes.episodeId, episodeId))
    .orderBy(asc(storyScenes.sceneOrder));

  const summaries = sceneRows
    .map((r) => ({
      sceneTitle: r.sceneTitle,
      summary: r.sceneSummary?.trim() ?? "",
    }))
    .filter((x) => x.summary.length > 0);

  if (summaries.length === 0) return false;

  try {
    const { summary } = await summarizeEpisode({
      episodeTitle: episodeRow.episodeTitle,
      sceneSummaries: summaries,
    });
    const [emb] = await batchEmbed([summary.trim()]);
    await db
      .update(storyEpisodes)
      .set({
        summary: summary.trim(),
        summaryEmbedding: emb ?? null,
        summaryModel: model,
        summaryGeneratedAt: new Date(),
      })
      .where(eq(storyEpisodes.id, episodeId));
    return true;
  } catch (e) {
    warnings.push(`Episode rollup failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

export async function rollupChapterFromDb(
  chapterId: string,
  warnings: string[],
  force?: boolean,
): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY) return false;
  const db = getDb();
  const model = getSummaryModel();

  const [chapterRow] = await db
    .select()
    .from(storyChapters)
    .where(eq(storyChapters.id, chapterId))
    .limit(1);

  if (!chapterRow) {
    warnings.push(`Chapter not found: ${chapterId}`);
    return false;
  }
  if (!force && chapterRow.manuallyEdited) {
    warnings.push(`Skipped chapter rollup (manually_edited=true): ${chapterId}`);
    return false;
  }
  if (
    !force &&
    chapterRow.summaryEmbedding !== null &&
    chapterRow.summaryGeneratedAt !== null &&
    chapterRow.summary?.trim()
  ) {
    return false;
  }

  const epRows = await db
    .select({
      episodeLabel: storyEpisodes.episodeLabel,
      episodeTitle: storyEpisodes.episodeTitle,
      summary: storyEpisodes.summary,
      episodeOrder: storyEpisodes.episodeOrder,
    })
    .from(storyEpisodes)
    .where(eq(storyEpisodes.chapterId, chapterId))
    .orderBy(asc(storyEpisodes.episodeOrder));

  const episodeSummaries = epRows
    .map((e) => ({
      episodeLabel: e.episodeLabel,
      episodeTitle: e.episodeTitle,
      summary: e.summary?.trim() ?? "",
    }))
    .filter((x) => x.summary.length > 0);

  if (episodeSummaries.length === 0) return false;

  try {
    const { summary } = await summarizeChapter({
      chapterName: chapterRow.chapterName,
      episodeSummaries,
    });
    const [emb] = await batchEmbed([summary.trim()]);
    await db
      .update(storyChapters)
      .set({
        summary: summary.trim(),
        summaryEmbedding: emb ?? null,
        summaryModel: model,
        summaryGeneratedAt: new Date(),
      })
      .where(eq(storyChapters.id, chapterId));
    return true;
  } catch (e) {
    warnings.push(`Chapter rollup failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
