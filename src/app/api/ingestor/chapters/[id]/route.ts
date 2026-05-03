import { NextResponse } from "next/server";
import { getDbStatus } from "@/db/status";
import { getDb } from "@/db/client";
import { storyChapters } from "@/db/schema";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { db } = getDbStatus();
  if (db === "unconfigured") {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const database = getDb();
  const [chapter] = await database
    .select()
    .from(storyChapters)
    .where(eq(storyChapters.id, id));

  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  return NextResponse.json({ chapter });
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
    .select({ id: storyChapters.id })
    .from(storyChapters)
    .where(eq(storyChapters.id, id));

  if (!existing) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  const [updated] = await database
    .update(storyChapters)
    .set({
      chapterName: body.chapterName ?? undefined,
      chapterTimelineOrder: body.chapterTimelineOrder ?? undefined,
      chapterType: body.chapterType ?? undefined,
      scopeMembership: body.scopeMembership ?? undefined,
      metadata: body.metadata ?? undefined,
      manuallyEdited: true,
      manuallyEditedAt: new Date(),
    })
    .where(eq(storyChapters.id, id))
    .returning();

  return NextResponse.json({ chapter: updated });
}
