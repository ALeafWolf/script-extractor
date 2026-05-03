import { NextResponse } from "next/server";
import { getDbStatus } from "@/db/status";
import { getDb } from "@/db/client";
import { storyUnits } from "@/db/schema";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { db } = getDbStatus();
  if (db === "unconfigured") {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const database = getDb();
  const [unit] = await database
    .select()
    .from(storyUnits)
    .where(eq(storyUnits.id, id));

  if (!unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  return NextResponse.json({ unit });
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
    .select({ id: storyUnits.id })
    .from(storyUnits)
    .where(eq(storyUnits.id, id));

  if (!existing) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const [updated] = await database
    .update(storyUnits)
    .set({
      contentType: body.contentType ?? undefined,
      speaker: body.speaker ?? undefined,
      textContent: body.textContent ?? undefined,
      unitIndex: body.unitIndex ?? undefined,
      manuallyEdited: true,
      manuallyEditedAt: new Date(),
    })
    .where(eq(storyUnits.id, id))
    .returning();

  return NextResponse.json({ unit: updated });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { db } = getDbStatus();
  if (db === "unconfigured") {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const database = getDb();
  const [existing] = await database
    .select()
    .from(storyUnits)
    .where(eq(storyUnits.id, id));

  if (!existing) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  await database.delete(storyUnits).where(eq(storyUnits.id, id));

  return NextResponse.json({ deleted: true });
}
