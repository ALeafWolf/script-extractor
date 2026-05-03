import { eq, and, isNull, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDb } from "@/db/client";
import type * as schema from "@/db/schema";
import {
  relationshipArcs,
  auWorlds,
  storyChapters,
  storyEpisodes,
  storyScenes,
  storyUnits,
} from "@/db/schema";
import { batchEmbed } from "./embedClient";
import type {
  ParsedCanonFile,
  ParsedScene,
  IngestResult,
  IngestOptions,
  IngestConflict,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildConflict(override?: Partial<IngestConflict>): IngestConflict {
  return {
    existingEpisodeId: undefined,
    existingSceneCount: 0,
    manuallyEditedUnitCount: 0,
    preservedSceneIds: [],
    ...override,
  };
}

// ---------------------------------------------------------------------------
// Core logic shared between preview and commit
// ---------------------------------------------------------------------------

type AnyDb = NodePgDatabase<typeof schema>;

async function analyzeConflicts(
  db: AnyDb,
  episodeId: string,
): Promise<IngestConflict> {
  const scenes = await db
    .select({ id: storyScenes.id })
    .from(storyScenes)
    .where(eq(storyScenes.episodeId, episodeId));

  if (scenes.length === 0) return buildConflict({ existingEpisodeId: episodeId });

  const sceneIds = scenes.map((s) => s.id);

  const editedUnits = await db
    .select({ sceneId: storyUnits.sceneId })
    .from(storyUnits)
    .where(
      and(
        inArray(storyUnits.sceneId, sceneIds),
        eq(storyUnits.manuallyEdited, true),
      ),
    );

  const editedSceneSet = new Set(editedUnits.map((u) => u.sceneId));

  return buildConflict({
    existingEpisodeId: episodeId,
    existingSceneCount: scenes.length,
    manuallyEditedUnitCount: editedUnits.length,
    preservedSceneIds: [...editedSceneSet],
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function ingestCanon(
  parsed: ParsedCanonFile,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const { mode = "replace", dryRun = false } = options;
  const db = getDb();
  const warnings = [...parsed.warnings];

  const {
    character_id,
    relationship_arc_key,
    relationship_arc_title,
    continuity_family,
    arc_timeline_order,
    au_world_key,
    au_world_title,
    chapter_key,
    chapter_name,
    chapter_label,
    chapter_timeline_order,
    chapter_type,
    inheritance_order,
    scope_membership,
    episode_label,
    episode_order,
  } = parsed.chapter;

  const episodeLabelFinal = episode_label ?? "_default";

  // -------------------------------------------------------------------------
  // DRY RUN: analyze without writes
  // -------------------------------------------------------------------------
  if (dryRun) {
    // Resolve IDs without inserting to check for existing data
    const existingArc = await db
      .select({ id: relationshipArcs.id })
      .from(relationshipArcs)
      .where(
        and(
          eq(relationshipArcs.characterId, character_id),
          eq(relationshipArcs.arcKey, relationship_arc_key),
        ),
      )
      .limit(1);

    let existingChapter = null;
    if (existingArc.length > 0) {
      const arcId = existingArc[0].id;

      let chapterQuery;
      if (continuity_family === "au" && au_world_key) {
        const existingAuWorld = await db
          .select({ id: auWorlds.id })
          .from(auWorlds)
          .where(
            and(
              eq(auWorlds.relationshipArcId, arcId),
              eq(auWorlds.auWorldKey, au_world_key),
            ),
          )
          .limit(1);

        if (existingAuWorld.length > 0) {
          chapterQuery = await db
            .select({ id: storyChapters.id })
            .from(storyChapters)
            .where(
              and(
                eq(storyChapters.characterId, character_id),
                eq(storyChapters.relationshipArcId, arcId),
                eq(storyChapters.auWorldId, existingAuWorld[0].id),
                eq(storyChapters.chapterKey, chapter_key),
              ),
            )
            .limit(1);
        }
      } else {
        chapterQuery = await db
          .select({ id: storyChapters.id })
          .from(storyChapters)
          .where(
            and(
              eq(storyChapters.characterId, character_id),
              eq(storyChapters.relationshipArcId, arcId),
              isNull(storyChapters.auWorldId),
              eq(storyChapters.chapterKey, chapter_key),
            ),
          )
          .limit(1);
      }

      existingChapter = chapterQuery?.[0] ?? null;
    }

    let conflict = buildConflict();
    if (existingChapter) {
      const existingEpisode = await db
        .select({ id: storyEpisodes.id })
        .from(storyEpisodes)
        .where(
          and(
            eq(storyEpisodes.chapterId, existingChapter.id),
            eq(storyEpisodes.episodeLabel, episodeLabelFinal),
          ),
        )
        .limit(1);

      if (existingEpisode.length > 0) {
        conflict = await analyzeConflicts(db, existingEpisode[0].id);
      }
    }

    return {
      file: parsed.filename,
      chapter: {
        arc_key: relationship_arc_key,
        chapter_key,
        episode_label: episodeLabelFinal,
      },
      scenesInserted: parsed.scenes.length,
      unitsInserted: parsed.scenes.reduce((s, sc) => s + sc.units.length, 0),
      embeddingsGenerated: 0,
      conflicts: conflict,
      warnings,
      dryRun: true,
    };
  }

  // -------------------------------------------------------------------------
  // COMMIT: full transaction
  // -------------------------------------------------------------------------
  let scenesInserted = 0;
  let unitsInserted = 0;
  let embeddingsGenerated = 0;
  let conflict = buildConflict();

  await db.transaction(async (tx) => {
    // 1. Upsert relationship_arc
    const existingArc = await tx
      .select()
      .from(relationshipArcs)
      .where(
        and(
          eq(relationshipArcs.characterId, character_id),
          eq(relationshipArcs.arcKey, relationship_arc_key),
        ),
      )
      .limit(1);

    let arcId: string;
    if (existingArc.length > 0) {
      arcId = existingArc[0].id;
      await tx
        .update(relationshipArcs)
        .set({
          arcTitle: relationship_arc_title,
          continuityFamily: continuity_family,
          arcTimelineOrder: arc_timeline_order ?? null,
        })
        .where(eq(relationshipArcs.id, arcId));
    } else {
      const [inserted] = await tx
        .insert(relationshipArcs)
        .values({
          characterId: character_id,
          arcKey: relationship_arc_key,
          arcTitle: relationship_arc_title,
          continuityFamily: continuity_family,
          arcTimelineOrder: arc_timeline_order ?? null,
        })
        .returning();
      arcId = inserted.id;
    }

    // 2. Upsert au_world (AU only)
    let auWorldId: string | null = null;
    if (continuity_family === "au" && au_world_key) {
      const existingAuWorld = await tx
        .select()
        .from(auWorlds)
        .where(
          and(
            eq(auWorlds.relationshipArcId, arcId),
            eq(auWorlds.auWorldKey, au_world_key),
          ),
        )
        .limit(1);

      if (existingAuWorld.length > 0) {
        auWorldId = existingAuWorld[0].id;
        await tx
          .update(auWorlds)
          .set({ auWorldTitle: au_world_title ?? null })
          .where(eq(auWorlds.id, auWorldId));
      } else {
        const [inserted] = await tx
          .insert(auWorlds)
          .values({
            characterId: character_id,
            relationshipArcId: arcId,
            auWorldKey: au_world_key,
            auWorldTitle: au_world_title ?? null,
          })
          .returning();
        auWorldId = inserted.id;
      }
    }

    // 3. Upsert story_chapter
    const chapterWhereClause = auWorldId
      ? and(
          eq(storyChapters.characterId, character_id),
          eq(storyChapters.relationshipArcId, arcId),
          eq(storyChapters.auWorldId, auWorldId),
          eq(storyChapters.chapterKey, chapter_key),
        )
      : and(
          eq(storyChapters.characterId, character_id),
          eq(storyChapters.relationshipArcId, arcId),
          isNull(storyChapters.auWorldId),
          eq(storyChapters.chapterKey, chapter_key),
        );

    const existingChapter = await tx
      .select()
      .from(storyChapters)
      .where(chapterWhereClause)
      .limit(1);

    // Safe numeric conversion for chapter_timeline_order
    const timelineOrderNum =
      chapter_timeline_order !== undefined && !isNaN(Number(chapter_timeline_order))
        ? Number(chapter_timeline_order)
        : null;

    let chapterId: string;
    if (existingChapter.length > 0) {
      chapterId = existingChapter[0].id;
      await tx
        .update(storyChapters)
        .set({
          chapterName: chapter_name,
          chapterLabel: chapter_label ?? null,
          chapterTimelineOrder: timelineOrderNum,
          chapterType: chapter_type,
          inheritanceOrder: (inheritance_order as number) ?? null,
          scopeMembership: scope_membership ?? null,
        })
        .where(eq(storyChapters.id, chapterId));
    } else {
      const [inserted] = await tx
        .insert(storyChapters)
        .values({
          characterId: character_id,
          relationshipArcId: arcId,
          auWorldId: auWorldId,
          chapterKey: chapter_key,
          chapterName: chapter_name,
          chapterLabel: chapter_label ?? null,
          chapterTimelineOrder: timelineOrderNum,
          chapterType: chapter_type,
          inheritanceOrder: (inheritance_order as number) ?? null,
          scopeMembership: scope_membership ?? null,
        })
        .returning();
      chapterId = inserted.id;
    }

    // 4. Upsert story_episode
    const existingEpisode = await tx
      .select()
      .from(storyEpisodes)
      .where(
        and(
          eq(storyEpisodes.chapterId, chapterId),
          eq(storyEpisodes.episodeLabel, episodeLabelFinal),
        ),
      )
      .limit(1);

    let episodeId: string;
    if (existingEpisode.length > 0) {
      episodeId = existingEpisode[0].id;
    } else {
      const [inserted] = await tx
        .insert(storyEpisodes)
        .values({
          characterId: character_id,
          chapterId,
          episodeLabel: episodeLabelFinal,
          episodeOrder: episode_order ?? 0,
        })
        .returning();
      episodeId = inserted.id;
    }

    // 5. Conflict analysis
    conflict = await analyzeConflicts(tx as unknown as AnyDb, episodeId);

    if (mode === "skip" && conflict.existingSceneCount > 0) {
      warnings.push(
        `Skipped episode "${episodeLabelFinal}": ${conflict.existingSceneCount} scene(s) already exist (mode=skip).`,
      );
      return; // exit transaction with no scene/unit writes
    }

    // Determine which existing scenes to delete
    const scenesToDelete =
      mode === "replace-force"
        ? (
            await tx
              .select({ id: storyScenes.id })
              .from(storyScenes)
              .where(eq(storyScenes.episodeId, episodeId))
          ).map((s) => s.id)
        : (
            await tx
              .select({ id: storyScenes.id })
              .from(storyScenes)
              .where(
                and(
                  eq(storyScenes.episodeId, episodeId),
                  eq(storyScenes.manuallyEdited, false),
                ),
              )
          ).map((s) => s.id);

    // Also exclude scenes whose units are manually edited (replace mode guard)
    const preservedSceneIds = new Set(conflict.preservedSceneIds);

    const idsToActuallyDelete =
      mode === "replace-force"
        ? scenesToDelete
        : scenesToDelete.filter((id) => !preservedSceneIds.has(id));

    if (idsToActuallyDelete.length > 0) {
      await tx
        .delete(storyScenes)
        .where(inArray(storyScenes.id, idsToActuallyDelete));
    }

    if (conflict.preservedSceneIds.length > 0 && mode !== "replace-force") {
      warnings.push(
        `Preserved ${conflict.preservedSceneIds.length} manually-edited scene(s) from re-ingest.`,
      );
    }

    // 6. Insert scenes and units
    const unitIdsForEmbedding: string[] = [];
    const unitTextsForEmbedding: string[] = [];

    for (const scene of parsed.scenes) {
      const fm = scene.frontmatter;
      const [insertedScene] = await tx
        .insert(storyScenes)
        .values({
          characterId: character_id,
          chapterId,
          episodeId,
          sceneTitle: (fm.scene_title as string) ?? null,
          sceneOrder: (fm.scene_order as number) ?? 0,
          timelineOrder: (fm.timeline_order as number) ?? null,
          location: (fm.location as string) ?? null,
          timeHint: (fm.time_hint as string) ?? null,
          metadata: buildSceneMetadata(fm),
        })
        .returning();

      scenesInserted++;
      const sceneId = insertedScene.id;

      for (const unit of scene.units) {
        const [insertedUnit] = await tx
          .insert(storyUnits)
          .values({
            characterId: character_id,
            chapterId,
            episodeId,
            sceneId,
            contentType: unit.contentType,
            unitIndex: scene.units.indexOf(unit),
            speaker: unit.speaker ?? null,
            textContent: unit.text,
            metadata:
              unit.groupIndex > 0 ? { group_index: unit.groupIndex } : null,
          })
          .returning();

        unitsInserted++;
        unitIdsForEmbedding.push(insertedUnit.id);
        unitTextsForEmbedding.push(unit.text);
      }
    }

    // 7. Embeddings (optional, non-blocking)
    if (process.env.OPENAI_API_KEY && unitTextsForEmbedding.length > 0) {
      try {
        const embeddings = await batchEmbed(unitTextsForEmbedding);
        for (let i = 0; i < embeddings.length; i++) {
          const emb = embeddings[i];
          if (emb) {
            await tx
              .update(storyUnits)
              .set({ embedding: emb })
              .where(eq(storyUnits.id, unitIdsForEmbedding[i]));
            embeddingsGenerated++;
          }
        }
      } catch (err) {
        console.error("[ingestCanon] Embedding generation failed:", err);
        warnings.push("Embedding generation failed (see server logs); ingest still succeeded.");
      }
    } else if (!process.env.OPENAI_API_KEY) {
      warnings.push("Embeddings skipped: OPENAI_API_KEY is not set.");
    }
  });

  return {
    file: parsed.filename,
    chapter: {
      arc_key: relationship_arc_key,
      chapter_key,
      episode_label: episodeLabelFinal,
    },
    scenesInserted,
    unitsInserted,
    embeddingsGenerated,
    conflicts: conflict,
    warnings,
  };
}

function buildSceneMetadata(
  fm: ParsedScene["frontmatter"],
): Record<string, unknown> | null {
  const known = new Set([
    "scene_title",
    "scene_order",
    "timeline_order",
    "location",
    "time_hint",
  ]);
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    if (!known.has(k)) extra[k] = v;
  }
  return Object.keys(extra).length > 0 ? extra : null;
}

