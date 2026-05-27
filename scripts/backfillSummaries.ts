/**
 * CLI: fill missing summary embeddings / rollups / structured facts.
 *
 * Examples (PowerShell):
 *   npm run backfill:summaries -- --scope=character:zuo_ran --limit=50
 *   npm run backfill:summaries -- --levels=facts --force
 *
 * Loads `.env.local` then `.env` from the script-extractor package root (same as Next.js).
 * Shell env wins if already set. Requires DATABASE_URL (and OPENAI_API_KEY for LLM steps).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { asc, count, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { storyChapters, storyEpisodes, storyFacts, storyScenes } from "@/db/schema";
import {
  enrichSingleSceneFromDb,
  refreshFactsForScene,
  rollupChapterFromDb,
  rollupEpisodeFromDb,
} from "@/lib/ingest/postCommitEnrich";

type Level = "scenes" | "episodes" | "chapters" | "facts";

/** Package root (`script-extractor/`), parent of `scripts/`. */
const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Apply `.env.local` / `.env` so `tsx` CLI sees DATABASE_URL etc. (Next dev loads these automatically.)
 */
function loadEnvFiles(projectRoot: string): void {
  const extraRoots = [
    projectRoot,
    path.join(projectRoot, ".."), // monorepo root, e.g. Zuo-Ran/.env
  ];
  const seen = new Set<string>();
  for (const root of extraRoots) {
    const abs = path.resolve(root);
    if (seen.has(abs)) continue;
    seen.add(abs);

    for (const name of [".env.local", ".env"]) {
      const filePath = path.join(abs, name);
      if (!fs.existsSync(filePath)) continue;
      const text = fs.readFileSync(filePath, "utf8");
      for (const line of text.split(/\r?\n/)) {
        let t = line.trim();
        if (!t || t.startsWith("#")) continue;
        if (t.startsWith("export ")) t = t.slice(7).trim();
        const eq = t.indexOf("=");
        if (eq === -1) continue;
        const key = t.slice(0, eq).trim();
        let val = t.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  }
}

function argvFlag(name: string): string | undefined {
  const p = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(p));
  return hit ? hit.slice(p.length) : undefined;
}

function argvHas(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseLevels(raw?: string): Set<Level> {
  const all: Level[] = ["scenes", "episodes", "chapters", "facts"];
  if (!raw?.trim()) return new Set(all);
  const xs = raw.split(",").map((s) => s.trim() as Level);
  return new Set(xs.filter((x) => all.includes(x)));
}

async function parallelLimit<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  async function runner(): Promise<void> {
    for (;;) {
      const i = idx++;
      if (i >= items.length) break;
      await worker(items[i]);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => runner()));
}

async function bumpHierarchy(sceneId: string, episodeIds: Set<string>, chapterIds: Set<string>) {
  const db = getDb();
  const [row] = await db
    .select({ episodeId: storyScenes.episodeId, chapterId: storyScenes.chapterId })
    .from(storyScenes)
    .where(eq(storyScenes.id, sceneId))
    .limit(1);
  if (row) {
    episodeIds.add(row.episodeId);
    chapterIds.add(row.chapterId);
  }
}

async function main() {
  loadEnvFiles(pkgRoot);

  const scopeRaw = argvFlag("scope");
  let characterIdFilter: string | undefined;
  if (scopeRaw?.startsWith("character:")) characterIdFilter = scopeRaw.slice("character:".length);

  const levels = parseLevels(argvFlag("levels"));
  const force = argvHas("--force");
  const missingOnly = !argvHas("--missing-only=false");
  const limit = Math.max(1, parseInt(argvFlag("limit") ?? "200", 10));
  const concurrency = Math.max(1, parseInt(argvFlag("concurrency") ?? "2", 10));

  console.log(
    "[backfill] levels=%s missingOnly=%s force=%s limit=%s concurrency=%s scope=%s",
    [...levels].join("|"),
    missingOnly,
    force,
    limit,
    concurrency,
    scopeRaw ?? "(all)",
  );

  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      "DATABASE_URL is not set. Add it to script-extractor/.env or .env.local (same folder as package.json), or export it in your shell.",
    );
    process.exit(1);
  }

  const db = getDb();
  const warnings: string[] = [];
  const episodeIdsSeen = new Set<string>();
  const chapterIdsSeen = new Set<string>();

  let scenesDone = 0;
  let factRowsInserted = 0;
  let episodeRollups = 0;
  let chapterRollups = 0;

  const wantsScenes = levels.has("scenes");
  const wantsFacts = levels.has("facts");

  if (wantsFacts && !wantsScenes) {
    const charCond = characterIdFilter ? eq(storyScenes.characterId, characterIdFilter) : undefined;
    const sceneCandidates = await db
      .select({ id: storyScenes.id })
      .from(storyScenes)
      .where(charCond)
      .orderBy(asc(storyScenes.id))
      .limit(limit * 8);

    const sliced: typeof sceneCandidates = [];
    for (const s of sceneCandidates) {
      const [agg] = await db
        .select({ n: count() })
        .from(storyFacts)
        .where(eq(storyFacts.sceneId, s.id));
      const factCount = Number(agg?.n ?? 0);
      if (!missingOnly || force || factCount === 0) sliced.push(s);
      if (sliced.length >= limit) break;
    }

    console.log("[backfill] facts-only pass: rows=%s", sliced.length);

    await parallelLimit(sliced, concurrency, async (row) => {
      const inserted = await refreshFactsForScene(row.id, { warnings, force });
      factRowsInserted += inserted;
      await bumpHierarchy(row.id, episodeIdsSeen, chapterIdsSeen);
    });
  }

  if (wantsScenes) {
    const charCond = characterIdFilter ? eq(storyScenes.characterId, characterIdFilter) : undefined;
    let rows = await db
      .select({ id: storyScenes.id })
      .from(storyScenes)
      .where(charCond)
      .orderBy(asc(storyScenes.id))
      .limit(limit * 16);

    if (missingOnly && !force) {
      const flagged: typeof rows = [];
      for (const r of rows) {
        const [row] = await db
          .select({
            embedding: storyScenes.sceneSummaryEmbedding,
            genAt: storyScenes.summaryGeneratedAt,
            txt: storyScenes.sceneSummary,
          })
          .from(storyScenes)
          .where(eq(storyScenes.id, r.id))
          .limit(1);
        const lacks =
          !row ||
          !(row.txt && row.txt.trim()) ||
          row.embedding === null ||
          row.genAt === null;
        if (lacks) flagged.push(r);
        if (flagged.length >= limit) break;
      }
      rows = flagged;
    } else rows = rows.slice(0, limit);

    console.log("[backfill] scenes pass rows=%s (facts=%s)", rows.length, levels.has("facts"));

    await parallelLimit(rows, concurrency, async (r) => {
      await enrichSingleSceneFromDb(r.id, {
        warnings,
        force,
        skipFacts: !levels.has("facts"),
      });
      scenesDone++;
      await bumpHierarchy(r.id, episodeIdsSeen, chapterIdsSeen);
    });
  }

  if (levels.has("episodes")) {
    const collected: string[] = [...episodeIdsSeen];
    const charCondEp = characterIdFilter
      ? eq(storyEpisodes.characterId, characterIdFilter)
      : undefined;
    const extraRows = await db
      .select({ id: storyEpisodes.id })
      .from(storyEpisodes)
      .where(charCondEp)
      .limit(limit * 8);
    for (const er of extraRows) collected.push(er.id);

    const uniqEp = [...new Set(collected)].slice(0, limit);
    for (const epid of uniqEp) {
      if (!force && missingOnly) {
        const [erow] = await db.select().from(storyEpisodes).where(eq(storyEpisodes.id, epid)).limit(1);
        const filled = Boolean(
          erow?.summary?.trim() &&
            erow.summaryEmbedding !== null &&
            erow.summaryGeneratedAt !== null,
        );
        if (filled) continue;
      }
      if (await rollupEpisodeFromDb(epid, warnings, force)) episodeRollups++;
    }
  }

  if (levels.has("chapters")) {
    const collected: string[] = [...chapterIdsSeen];
    const charCondCh = characterIdFilter
      ? eq(storyChapters.characterId, characterIdFilter)
      : undefined;
    const chRowsExtra = await db
      .select({ id: storyChapters.id })
      .from(storyChapters)
      .where(charCondCh)
      .limit(limit * 8);
    for (const c of chRowsExtra) collected.push(c.id);

    const uniqCh = [...new Set(collected)].slice(0, limit);
    for (const cid of uniqCh) {
      if (!force && missingOnly) {
        const [crow] = await db.select().from(storyChapters).where(eq(storyChapters.id, cid)).limit(1);
        const filled = Boolean(
          crow?.summary?.trim() &&
            crow.summaryEmbedding !== null &&
            crow.summaryGeneratedAt !== null,
        );
        if (filled) continue;
      }
      if (await rollupChapterFromDb(cid, warnings, force)) chapterRollups++;
    }
  }

  console.log(
    "[backfill] done scenes=%s factsInsertedTotal=%s episodeRollups=%s chapterRollups=%s warnings=%s",
    scenesDone,
    factRowsInserted,
    episodeRollups,
    chapterRollups,
    warnings.length,
  );
  if (warnings.length) console.warn(warnings.slice(0, 40).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
