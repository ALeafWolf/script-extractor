import { NextResponse } from "next/server";
import { getDbStatus } from "@/db/status";
import { getDb } from "@/db/client";
import { storyScenes, storyUnits } from "@/db/schema";
import { eq, count } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { db } = getDbStatus();
  if (db === "unconfigured") {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const database = getDb();
  const [scene] = await database
    .select()
    .from(storyScenes)
    .where(eq(storyScenes.id, id));

  if (!scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const units = await database
    .select()
    .from(storyUnits)
    .where(eq(storyUnits.sceneId, id))
    .orderBy(storyUnits.unitIndex);

  return NextResponse.json({ scene, units });
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
    .select({ id: storyScenes.id })
    .from(storyScenes)
    .where(eq(storyScenes.id, id));

  if (!existing) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const [updated] = await database
    .update(storyScenes)
    .set({
      sceneTitle: body.sceneTitle ?? undefined,
      sceneOrder: body.sceneOrder ?? undefined,
      timelineOrder: body.timelineOrder ?? undefined,
      location: body.location ?? undefined,
      timeHint: body.timeHint ?? undefined,
      manuallyEdited: true,
      manuallyEditedAt: new Date(),
    })
    .where(eq(storyScenes.id, id))
    .returning();

  return NextResponse.json({ scene: updated });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { db } = getDbStatus();
  if (db === "unconfigured") {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const database = getDb();

  // Fetch unit count for the confirm dialog (caller may have already fetched it)
  const [existing] = await database
    .select()
    .from(storyScenes)
    .where(eq(storyScenes.id, id));

  if (!existing) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const [unitCount] = await database
    .select({ count: count(storyUnits.id) })
    .from(storyUnits)
    .where(eq(storyUnits.sceneId, id));

  await database.delete(storyScenes).where(eq(storyScenes.id, id));

  return NextResponse.json({
    deleted: true,
    unitsCascaded: Number(unitCount.count),
  });
}
