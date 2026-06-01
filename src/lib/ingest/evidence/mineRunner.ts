/**
 * Mine runner — spawns the chatbot/backend internal-logic evidence miner.
 *
 * The miner is invoked via child_process.spawn using `process.execPath`
 * (the Node.js runtime itself) to run `tsx` directly, avoiding both shell
 * parsing and platform-specific npm.cmd behavior. Limit is clamped, a hard
 * timeout is applied, and the child process is NOT bound to the HTTP
 * request's abort signal — browser disconnect does not kill a started run.
 *
 * Result is reported as a before/after COUNT(*) delta plus stdout/stderr
 * excerpts, not by parsing the miner's inline "Inserted: N" line.
 *
 * The child is spawned with backend/.env merged over the inherited env (backend
 * values win), so dev-server vars like EMBEDDING_MODEL can't shadow the backend's
 * required `provider:model` form and crash the miner at startup.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default limit for interactive-triggered mining. */
const DEFAULT_LIMIT = 30;

/** Hard maximum — larger runs must use the CLI directly. */
const HARD_MAX_LIMIT = 100;

/** Child process timeout in milliseconds (5 minutes). */
const MINE_TIMEOUT_MS = 300_000;

/** Relative path from the backend CWD to the tsx CLI module. */
const TSX_CLI = "node_modules/tsx/dist/cli.mjs";

/** Relative path from the backend CWD to the mining script. */
const MINER_SCRIPT = "scripts/mineInternalLogicEvidence.ts";

/** Resolve the CWD for the backend miner. */
function backendCwd(): string {
  return path.resolve(process.cwd(), "../chatbot/backend");
}

/**
 * Minimal `.env` parser (script-extractor has no `dotenv` dependency).
 * Parses `KEY=VALUE` lines, skipping blanks/comments and stripping a single
 * layer of surrounding quotes. Returns `{}` if the file is unreadable.
 */
function loadEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const text = fs.readFileSync(filePath, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key) out[key] = val;
    }
  } catch {
    // No backend .env reachable — fall back to the inherited env.
  }
  return out;
}

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface MineInput {
  characterId: string;
  arcKey: string;
  chapterKeys: string[];
  limit?: number;
  minConfidence?: number;
}

export interface MineResult {
  success: boolean;
  /** Number of new proposed rows created (before/after delta). */
  newRows: number;
  /** Full stdout from the miner process. */
  stdout: string;
  /** Full stderr from the miner process. */
  stderr: string;
  /** Truncated excerpt of stdout for display (last 500 chars). */
  stdoutExcerpt: string;
  /** If an error occurred, a descriptive message. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Before/after count helper
// ---------------------------------------------------------------------------

async function countProposed(characterId: string): Promise<number> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM internal_logic_evidence
    WHERE character_id = ${characterId}
      AND status = 'proposed'
  `);
  const rows = result.rows ?? [];
  return (rows[0] as { count: number } | undefined)?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

/**
 * Run the backend miner for a given character/arc/chapter scope.
 *
 * - Clamps `limit` to [1, HARD_MAX_LIMIT] (default DEFAULT_LIMIT).
 * - Applies `minConfidence` if provided.
 * - Resolves the miner CWD monorepo-relative.
 * - Spawns `process.execPath` (Node) running tsx directly — no shell, cross-platform.
 * - Has a hard timeout (kills the process after MINE_TIMEOUT_MS).
 * - Does NOT bind to any abort signal (browser close is safe).
 * - Reports the before/after proposed-row delta, not the miner's internal count.
 */
export async function runMine(input: MineInput): Promise<MineResult> {
  const {
    characterId,
    arcKey,
    chapterKeys,
    limit: rawLimit,
    minConfidence,
  } = input;

  // Clamp limit
  const limit = rawLimit != null
    ? Math.max(1, Math.min(rawLimit, HARD_MAX_LIMIT))
    : DEFAULT_LIMIT;

  // Build argv for the backend miner script.
  // Use process.execPath to invoke tsx directly — no shell parsing,
  // works cross-platform without npm.cmd issues on Windows.
  const cwd = backendCwd();
  const scriptArgs = [
    "--character", characterId,
    "--arc", arcKey,
    "--chapter", chapterKeys.join(","),
    "--limit", String(limit),
    "--apply",
  ];

  if (minConfidence != null) {
    scriptArgs.push("--min-confidence", String(minConfidence));
  }

  const argv = [
    TSX_CLI,
    MINER_SCRIPT,
    ...scriptArgs,
  ];

  // Snapshot before count
  const beforeCount = await countProposed(characterId);

  // The miner runs in chatbot/backend and owns env vars like EMBEDDING_MODEL and
  // OPENAI_API_KEY. Spawned from the Next dev server, the child inherits THIS app's
  // env, and backend's `dotenv.config()` does NOT override already-set vars — so a
  // value such as `EMBEDDING_MODEL=text-embedding-3-small` (this app) would shadow
  // backend's required `openai:text-embedding-3-small` and crash the miner at import.
  // Load backend/.env and let it take precedence so the child matches a direct CLI run.
  const childEnv = { ...process.env, ...loadEnvFile(path.join(cwd, ".env")) };

  // The backend's OpenAI client (`new OpenAI({ apiKey })`) reads OPENAI_BASE_URL
  // from the env. This app sets it empty (""), which backend's .env does not
  // override — and an empty base URL can defeat the SDK's default endpoint. Drop
  // it when empty so the SDK falls back to api.openai.com.
  if (childEnv.OPENAI_BASE_URL != null && childEnv.OPENAI_BASE_URL.trim() === "") {
    delete childEnv.OPENAI_BASE_URL;
  }

  return new Promise<MineResult>((resolve) => {
    const child = spawn(process.execPath, argv, {
      cwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Hard timeout
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, MINE_TIMEOUT_MS);

    child.on("close", async (exitCode) => {
      clearTimeout(timer);

      // Snapshot after count
      let afterCount = 0;
      try {
        afterCount = await countProposed(characterId);
      } catch {
        // If count fails, proceed with 0
      }

      const newRows = afterCount - beforeCount;
      const stdoutExcerpt = stdout.length > 500
        ? `…${stdout.slice(-500)}`
        : stdout;

      if (exitCode !== 0) {
        // Surface the captured output so the failure is debuggable. The child's
        // stdio is piped (not inherited), so without this nothing reaches the
        // dev-server console.
        const detail = (stderr.trim() || stdout.trim()).slice(-500);
        console.error(
          `[mine] miner exited ${exitCode} (signal: ${child.signalCode ?? "none"}) ` +
            `for character=${characterId} arc=${arcKey} chapters=${chapterKeys.join(",")}\n` +
            (stderr || stdout || "(no output captured)"),
        );
        resolve({
          success: false,
          newRows: Math.max(0, newRows),
          stdout,
          stderr,
          stdoutExcerpt,
          error:
            `Miner exited with code ${exitCode} (signal: ${child.signalCode ?? "none"})` +
            (detail ? ` — ${detail}` : ""),
        });
      } else {
        resolve({
          success: true,
          newRows: Math.max(0, newRows),
          stdout,
          stderr,
          stdoutExcerpt,
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        newRows: 0,
        stdout,
        stderr,
        stdoutExcerpt: stdout.slice(-500),
        error: `Failed to start miner: ${err.message}`,
      });
    });
  });
}
