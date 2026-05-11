import { NextResponse } from "next/server";
import { getDbStatus } from "@/db/status";
import { rollupChapterFromDb } from "@/lib/ingest/postCommitEnrich";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { db } = getDbStatus();
  if (db === "unconfigured") {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  let body: { force?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const warnings: string[] = [];
  try {
    const updated = await rollupChapterFromDb(id, warnings, Boolean(body.force));
    return NextResponse.json({ ok: true, updated, warnings });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e), warnings },
      { status: 500 },
    );
  }
}
