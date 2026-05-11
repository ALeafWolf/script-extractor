import { NextResponse } from "next/server";
import { getDbStatus } from "@/db/status";
import { enrichSingleSceneFromDb } from "@/lib/ingest/postCommitEnrich";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { db } = getDbStatus();
  if (db === "unconfigured") {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  let body: { force?: boolean; skipFacts?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const warnings: string[] = [];
  try {
    const out = await enrichSingleSceneFromDb(id, {
      warnings,
      force: Boolean(body.force),
      skipFacts: Boolean(body.skipFacts),
    });
    return NextResponse.json({ ok: true, ...out, warnings });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e), warnings },
      { status: 500 },
    );
  }
}
