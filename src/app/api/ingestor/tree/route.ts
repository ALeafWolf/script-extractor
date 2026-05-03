import { NextResponse } from "next/server";
import { getDbStatusLive } from "@/db/status";
import { getDb } from "@/db/client";
import {
  relationshipArcs,
  auWorlds,
  storyChapters,
  storyEpisodes,
  storyScenes,
  storyUnits,
} from "@/db/schema";
import { eq, sql, count } from "drizzle-orm";

export async function GET() {
  const { db } = await getDbStatusLive();
  if (db === "unconfigured") {
    return NextResponse.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }
  if (db === "no_schema") {
    return NextResponse.json(
      { error: "Database schema is missing. Run npm run db:migrate first." },
      { status: 503 },
    );
  }

  const database = getDb();

  const arcs = await database
    .select()
    .from(relationshipArcs)
    .orderBy(relationshipArcs.arcTimelineOrder, relationshipArcs.arcKey);

  const worlds = await database.select().from(auWorlds);

  const chapters = await database
    .select()
    .from(storyChapters)
    .orderBy(storyChapters.chapterTimelineOrder, storyChapters.chapterKey);

  const episodes = await database
    .select()
    .from(storyEpisodes)
    .orderBy(storyEpisodes.episodeOrder);

  // Scene counts per episode with manual-edit indicator
  const sceneCounts = await database
    .select({
      episodeId: storyScenes.episodeId,
      count: count(storyScenes.id),
      hasEdited: sql<boolean>`bool_or(${storyScenes.manuallyEdited})`,
    })
    .from(storyScenes)
    .groupBy(storyScenes.episodeId);

  const sceneCountMap = new Map(
    sceneCounts.map((r) => [
      r.episodeId,
      { count: Number(r.count), hasEdited: Boolean(r.hasEdited) },
    ]),
  );

  // Unit counts per scene with manual-edit indicator
  const unitCounts = await database
    .select({
      sceneId: storyUnits.sceneId,
      count: count(storyUnits.id),
      hasEdited: sql<boolean>`bool_or(${storyUnits.manuallyEdited})`,
    })
    .from(storyUnits)
    .groupBy(storyUnits.sceneId);

  const unitCountMap = new Map(
    unitCounts.map((r) => [
      r.sceneId,
      { count: Number(r.count), hasEdited: Boolean(r.hasEdited) },
    ]),
  );

  const scenes = await database
    .select()
    .from(storyScenes)
    .orderBy(storyScenes.sceneOrder);

  // Build nested tree
  const tree = arcs.map((arc) => {
    const arcWorlds = worlds.filter((w) => w.relationshipArcId === arc.id);
    const arcChapters = chapters.filter(
      (c) => c.relationshipArcId === arc.id && c.auWorldId === null,
    );

    return {
      ...arc,
      chapters: buildChapters(arcChapters, episodes, scenes, sceneCountMap, unitCountMap),
      auWorlds: arcWorlds.map((w) => {
        const worldChapters = chapters.filter((c) => c.auWorldId === w.id);
        return {
          ...w,
          chapters: buildChapters(worldChapters, episodes, scenes, sceneCountMap, unitCountMap),
        };
      }),
    };
  });

  return NextResponse.json({ tree });
}

function buildChapters(
  chapters: { id: string; chapterName: string; chapterKey: string; chapterTimelineOrder: number | null; chapterType: string; manuallyEdited: boolean }[],
  episodes: { id: string; chapterId: string; episodeLabel: string; episodeOrder: number; episodeTitle: string | null; manuallyEdited: boolean }[],
  scenes: { id: string; episodeId: string; sceneTitle: string | null; sceneOrder: number; manuallyEdited: boolean }[],
  sceneCountMap: Map<string, { count: number; hasEdited: boolean }>,
  unitCountMap: Map<string, { count: number; hasEdited: boolean }>,
) {
  return chapters.map((ch) => {
    const chEpisodes = episodes.filter((e) => e.chapterId === ch.id);
    return {
      ...ch,
      episodes: chEpisodes.map((ep) => {
        const epScenes = scenes.filter((s) => s.episodeId === ep.id);
        const sc = sceneCountMap.get(ep.id) ?? { count: 0, hasEdited: false };
        return {
          ...ep,
          sceneCount: sc.count,
          hasEditedScenes: sc.hasEdited,
          scenes: epScenes.map((s) => {
            const uc = unitCountMap.get(s.id) ?? { count: 0, hasEdited: false };
            return {
              ...s,
              unitCount: uc.count,
              hasEditedUnits: uc.hasEdited,
            };
          }),
        };
      }),
    };
  });
}
