import { NextResponse } from "next/server";
import { getDbStatus } from "@/db/status";
import { rejectEvidence } from "@/lib/ingest/evidence/evidenceSql";
import { z } from "zod";

const RejectBody = z.object({
  characterId: z.string().min(1, "characterId is required"),
  ids: z
    .array(z.string().uuid())
    .nonempty("At least one id is required")
    .max(200, "Cannot reject more than 200 rows at once"),
});

/**
 * POST /api/ingestor/evidence/reject
 *
 * Reject proposed evidence rows (set status='superseded' and record
 * reviewOutcome='rejected' in metadata).
 *
 * Body: { characterId: string, ids: string[] }
 * Only affects rows where status='proposed' AND character_id matches.
 * Merges metadata atomically with jsonb concat.
 * Returns { updated: number } with the actual affected row count.
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

  const parsed = RejectBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  try {
    const result = await rejectEvidence(parsed.data.characterId, parsed.data.ids);
    return NextResponse.json({ updated: result.updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[evidence] POST /reject failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
