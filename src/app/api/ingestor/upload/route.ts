import { NextResponse } from "next/server";
import { getDbStatusLive } from "@/db/status";
import { parseMarkdown } from "@/lib/ingest/parseMarkdown";
import { ingestCanon } from "@/lib/ingest/ingestCanon";
import type { IngestMode } from "@/lib/ingest/types";

export async function POST(request: Request) {
  const { db } = await getDbStatusLive();
  if (db === "unconfigured") {
    return NextResponse.json(
      { error: "Database is not configured. Set DATABASE_URL to enable this feature." },
      { status: 503 },
    );
  }
  if (db === "no_schema") {
    return NextResponse.json(
      { error: "Database schema is missing. Run `npm run db:migrate` (or apply drizzle/migrations/0000_init.sql) to create the tables." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const files = formData.getAll("files") as File[];
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const mode = (formData.get("mode") as IngestMode | null) ?? "replace";

  const results = [];

  for (const file of files) {
    const filename = file.name;
    try {
      const text = await file.text();
      const parsed = parseMarkdown(text, filename);
      const result = await ingestCanon(parsed, { mode, dryRun });
      results.push({ ok: true, filename, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ ok: false, filename, error: message });
    }
  }

  return NextResponse.json({ results });
}
