import { NextResponse } from "next/server";
import { getDbStatus } from "@/db/status";
import { getDb } from "@/db/client";
import { storyScenes, storyUnits } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const { db } = getDbStatus();
  if (db === "unconfigured") {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const episodeId = url.searchParams.get("episodeId");

  const database = getDb();

  const rows = episodeId
    ? await database
        .select()
        .from(storyScenes)
        .where(eq(storyScenes.episodeId, episodeId))
        .orderBy(storyScenes.sceneOrder)
    : await database
        .select()
        .from(storyScenes)
        .orderBy(storyScenes.sceneOrder);

  return NextResponse.json({ scenes: rows });
}
