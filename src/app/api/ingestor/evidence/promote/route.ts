import { NextResponse } from "next/server";
import { getDbStatus } from "@/db/status";
import { promoteEvidence } from "@/lib/ingest/evidence/evidenceSql";
import { z } from "zod";

const PromoteBody = z.object({
  characterId: z.string().min(1, "characterId is required"),
  ids: z
    .array(z.string().uuid())
    .nonempty("At least one id is required")
    .max(200, "Cannot promote more than 200 rows at once"),
});

/**
 * POST /api/ingestor/evidence/promote
 *
 * Promote proposed evidence rows to active.
 *
 * Body: { characterId: string, ids: string[] }
 * Only affects rows where status='proposed' AND character_id matches.
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

  const parsed = PromoteBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  try {
    const result = await promoteEvidence(parsed.data.characterId, parsed.data.ids);
    return NextResponse.json({ updated: result.updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[evidence] POST /promote failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
