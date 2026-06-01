/**
 * Evidence data layer — raw SQL helpers for `internal_logic_evidence`.
 *
 * This table is owned by `chatbot/backend` and deliberately absent from
 * script-extractor's typed Drizzle schema. All queries use raw SQL via
 * `getDb().execute(sql\`…\`)` to avoid schema / migration coupling.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A row returned by the evidence list query. */
export interface EvidenceRow {
  id: string;
  status: string;
  node: string;
  claimText: string;
  evidenceText: string;
  confidenceScore: number | null;
  arcKey: string | null;
  chapterKey: string | null;
  episodeLabel: string | null;
  sceneOrder: number | null;
  unitIndex: number | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  /** Matched canon chapter name (left-joined from story_chapters). Null when no matching chapter. */
  canonChapterName: string | null;
  /** Matched canon arc title (left-joined from relationship_arcs). Null when no matching arc. */
  canonArcTitle: string | null;
}

/** Filters for listing evidence rows. */
export interface EvidenceListFilter {
  characterId: string;
  status?: string;
  arc?: string;
  chapter?: string;
  node?: string;
  limit?: number;
}

/** Result of a promote or reject operation. */
export interface ReviewWriteResult {
  updated: number;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const LIST_SELECT_COLUMNS = sql`
  e.id,
  e.status,
  e.node,
  e.claim_text AS "claimText",
  e.evidence_text AS "evidenceText",
  e.confidence_score AS "confidenceScore",
  e.arc_key AS "arcKey",
  e.chapter_key AS "chapterKey",
  e.episode_label AS "episodeLabel",
  e.scene_order AS "sceneOrder",
  e.unit_index AS "unitIndex",
  e.created_at AS "createdAt",
  e.updated_at AS "updatedAt",
  e.metadata,
  sc.chapter_name AS "canonChapterName",
  ra.arc_title AS "canonArcTitle"
`;

/**
 * List evidence rows with optional filters.
 *
 * Joins `relationship_arcs` and `story_chapters` to surface canon provenance
 * labels. The join chain is:
 *   internal_logic_evidence e
 *     → relationship_arcs ra  (arc_key + character_id)
 *     → story_chapters sc     (ra.id via relationship_arc_id + chapter_key + character_id)
 *
 * `story_chapters` does NOT have its own `arc_key` column; it references
 * `relationship_arcs` via `relationship_arc_id`. Both joins are LEFT so
 * evidence rows without matching canon entries still appear.
 */
export async function listEvidence(
  filter: EvidenceListFilter,
): Promise<EvidenceRow[]> {
  const db = getDb();

  const conditions: ReturnType<typeof sql>[] = [
    sql`e.character_id = ${filter.characterId}`,
  ];

  if (filter.status) {
    conditions.push(sql`e.status = ${filter.status}`);
  }
  if (filter.arc) {
    conditions.push(sql`e.arc_key = ${filter.arc}`);
  }
  if (filter.chapter) {
    conditions.push(sql`e.chapter_key = ${filter.chapter}`);
  }
  if (filter.node) {
    conditions.push(sql`e.node = ${filter.node}`);
  }

  const where = conditions.length > 1
    ? sql.join(conditions, sql` AND `)
    : conditions[0]!;

  const limit = filter.limit ? Math.min(filter.limit, 200) : 100;

  const result = await db.execute(sql`
    SELECT ${LIST_SELECT_COLUMNS}
    FROM internal_logic_evidence e
    LEFT JOIN relationship_arcs ra
      ON ra.arc_key = e.arc_key AND ra.character_id = e.character_id
    LEFT JOIN story_chapters sc
      ON sc.relationship_arc_id = ra.id
      AND sc.chapter_key = e.chapter_key
      AND sc.character_id = e.character_id
    WHERE ${where}
    ORDER BY e.created_at DESC
    LIMIT ${limit}
  `);

  return (result.rows ?? []) as unknown as EvidenceRow[];
}

// ---------------------------------------------------------------------------
// Promote
// ---------------------------------------------------------------------------

/**
 * Promote proposed evidence rows to active.
 *
 * Only updates rows where:
 * - `character_id` matches
 * - `status` = 'proposed'
 * - `id` is in the supplied list
 *
 * Returns the actual number of rows affected (not ids.length).
 */
export async function promoteEvidence(
  characterId: string,
  ids: string[],
): Promise<ReviewWriteResult> {
  const db = getDb();

  // Build a parameterized uuid array — drizzle's sql tag sends each
  // element as a separate bind parameter, so Postgres receives
  // ARRAY[$1,$2,…]::uuid[] rather than a malformed string.
  const idsSql = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );

  const result = await db.execute(sql`
    UPDATE internal_logic_evidence
    SET status = 'active',
        updated_at = NOW()
    WHERE character_id = ${characterId}
      AND status = 'proposed'
      AND id = ANY(ARRAY[${idsSql}]::uuid[])
  `);

  return { updated: result.rowCount ?? 0 };
}

// ---------------------------------------------------------------------------
// Reject
// ---------------------------------------------------------------------------

/**
 * Reject proposed evidence rows (set status='superseded').
 *
 * Same guards as promote, plus atomically merges `metadata.reviewOutcome`
 * using jsonb concat to preserve existing keys without a read-modify-write.
 */
export async function rejectEvidence(
  characterId: string,
  ids: string[],
): Promise<ReviewWriteResult> {
  const db = getDb();

  const idsSql = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );

  const result = await db.execute(sql`
    UPDATE internal_logic_evidence
    SET status = 'superseded',
        metadata = metadata || '{"reviewOutcome":"rejected"}'::jsonb,
        updated_at = NOW()
    WHERE character_id = ${characterId}
      AND status = 'proposed'
      AND id = ANY(ARRAY[${idsSql}]::uuid[])
  `);

  return { updated: result.rowCount ?? 0 };
}
