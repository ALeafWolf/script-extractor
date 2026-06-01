import { NextResponse } from "next/server";
import { getDbStatus } from "@/db/status";
import { listEvidence } from "@/lib/ingest/evidence/evidenceSql";

/**
 * GET /api/ingestor/evidence
 *
 * List internal-logic evidence rows with optional filters.
 *
 * Query params:
 *   character  - required, character ID (default: zuo_ran)
 *   status     - optional, filter by status (proposed/active/superseded)
 *   arc        - optional, filter by arc key
 *   chapter    - optional, filter by chapter key
 *   node       - optional, filter by evidence node
 *   limit      - optional, max rows (default 100, max 200; must be 1-200)
 */
export async function GET(request: Request) {
  const { db } = getDbStatus();
  if (db === "unconfigured") {
    return NextResponse.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const characterId = url.searchParams.get("character") ?? "zuo_ran";
  const status = url.searchParams.get("status") ?? undefined;
  const arc = url.searchParams.get("arc") ?? undefined;
  const chapter = url.searchParams.get("chapter") ?? undefined;
  const node = url.searchParams.get("node") ?? undefined;
  const rawLimit = url.searchParams.get("limit");

  // Validate character — must be non-empty
  if (!characterId || characterId.trim().length === 0) {
    return NextResponse.json(
      { error: "character query parameter must be a non-empty string." },
      { status: 400 },
    );
  }

  // Validate limit — must be a positive integer within range if provided
  let limit: number | undefined;
  if (rawLimit !== null) {
    const parsed = Number(rawLimit);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200) {
      return NextResponse.json(
        { error: "limit must be an integer between 1 and 200." },
        { status: 400 },
      );
    }
    limit = parsed;
  }

  try {
    const rows = await listEvidence({
      characterId,
      status,
      arc,
      chapter,
      node,
      limit,
    });
    return NextResponse.json({ rows, count: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[evidence] GET failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
