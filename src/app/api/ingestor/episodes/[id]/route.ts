import { NextResponse } from "next/server";
import { getDbStatus } from "@/db/status";
import { getDb } from "@/db/client";
import { storyEpisodes } from "@/db/schema";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { db } = getDbStatus();
  if (db === "unconfigured") {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const database = getDb();
  const [episode] = await database
    .select()
    .from(storyEpisodes)
    .where(eq(storyEpisodes.id, id));

  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  return NextResponse.json({ episode });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { db } = getDbStatus();
  if (db === "unconfigured") {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const body = await request.json();
  const database = getDb();

  const [existing] = await database
    .select({ id: storyEpisodes.id })
    .from(storyEpisodes)
    .where(eq(storyEpisodes.id, id));

  if (!existing) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const [updated] = await database
    .update(storyEpisodes)
    .set({
      episodeLabel: body.episodeLabel ?? undefined,
      episodeOrder: body.episodeOrder ?? undefined,
      episodeTitle: body.episodeTitle ?? undefined,
      metadata: body.metadata ?? undefined,
      manuallyEdited: true,
      manuallyEditedAt: new Date(),
    })
    .where(eq(storyEpisodes.id, id))
    .returning();

  return NextResponse.json({ episode: updated });
}
