import { NextResponse } from "next/server";
import { getDbStatus } from "@/db/status";
import { runMine } from "@/lib/ingest/evidence/mineRunner";
import { z } from "zod";

// Valid key pattern: alphanumeric, underscores, hyphens (no shell metacharacters, no commas).
// Commas are rejected because chapterKeys are serialized with join(",") for the CLI.
const KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;

const MineBody = z.object({
  characterId: z
    .string()
    .min(1, "characterId is required")
    .regex(KEY_PATTERN, "characterId contains invalid characters"),
  arcKey: z
    .string()
    .min(1, "arcKey is required")
    .regex(KEY_PATTERN, "arcKey contains invalid characters"),
  chapterKeys: z
    .array(
      z
        .string()
        .min(1, "chapterKey must not be empty")
        .regex(KEY_PATTERN, "chapterKey contains invalid characters (commas are not allowed)"),
    )
    .nonempty("At least one chapterKey is required")
    .max(20, "Cannot mine more than 20 chapters at once"),
  limit: z.number().int().min(1).max(100).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
});

/**
 * POST /api/ingestor/evidence/mine
 *
 * Trigger the backend internal-logic evidence miner for a chapter scope.
 *
 * Body: { characterId, arcKey, chapterKeys, limit?, minConfidence? }
 *
 * The miner is spawned as a child process with clamped limit and hard timeout.
 * It is NOT bound to request.signal — browser disconnect does not kill it.
 * Returns { success, newRows, stdoutExcerpt, stderr?, error? }.
 */
export async function POST(request: Request) {
  const { db } = getDbStatus();
  if (db === "unconfigured") {
    return NextResponse.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = MineBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  try {
    const result = await runMine(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[evidence] POST /mine failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
