import { sql } from "drizzle-orm";
import { getDb } from "./client";

export type DbStatus = "configured" | "unconfigured" | "no_schema";
export type EmbedStatus = "enabled" | "disabled";

export interface SystemStatus {
  db: DbStatus;
  embeddings: EmbedStatus;
}

export function getDbStatus(): SystemStatus {
  return {
    db: process.env.DATABASE_URL ? "configured" : "unconfigured",
    embeddings: process.env.OPENAI_API_KEY ? "enabled" : "disabled",
  };
}

/**
 * Like getDbStatus() but also probes the DB to confirm the schema exists.
 * Returns db: "no_schema" when the connection works but tables are missing.
 * Only call from API routes (performs I/O).
 */
export async function getDbStatusLive(): Promise<SystemStatus> {
  const base = getDbStatus();
  if (base.db !== "configured") return base;

  try {
    const db = getDb();
    await db.execute(sql`SELECT 1 FROM relationship_arcs LIMIT 0`);
    return base;
  } catch {
    return { ...base, db: "no_schema" };
  }
}
