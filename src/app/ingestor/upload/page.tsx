"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { IngestResult, IngestMode } from "@/lib/ingest/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileState {
  file: File;
  status: "idle" | "previewing" | "ready" | "committing" | "done" | "error";
  mode: IngestMode;
  preview?: IngestResult;
  result?: IngestResult;
  error?: string;
  collapsed: boolean;
}

interface SystemStatus {
  db: "configured" | "unconfigured" | "no_schema";
  embeddings: "enabled" | "disabled";
}

// ---------------------------------------------------------------------------
// Upload page
// ---------------------------------------------------------------------------

export default function UploadPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [files, setFiles] = useState<FileState[]>([]);
  const [globalMode, setGlobalMode] = useState<IngestMode>("replace");
  const [committing, setCommitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/ingestor/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ db: "unconfigured", embeddings: "disabled" }));
  }, []);

  // ---------- Drop handling ----------

  const handleFiles = useCallback(
    async (incoming: FileList | null) => {
      if (!incoming) return;
      const mdFiles = Array.from(incoming).filter((f) =>
        f.name.endsWith(".md"),
      );
      if (mdFiles.length === 0) return;

      const newStates: FileState[] = mdFiles.map((f) => ({
        file: f,
        status: "previewing",
        mode: globalMode,
        collapsed: false,
      }));

      setFiles((prev) => {
        const existingNames = new Set(prev.map((p) => p.file.name));
        return [...prev, ...newStates.filter((s) => !existingNames.has(s.file.name))];
      });

      for (const state of newStates) {
        previewFile(state.file, globalMode);
      }
    },
    [globalMode],
  );

  const previewFile = async (file: File, mode: IngestMode) => {
    const formData = new FormData();
    formData.append("files", file);
    formData.append("mode", mode);

    try {
      const res = await fetch("/api/ingestor/upload?dryRun=true", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      // Top-level error (e.g. no_schema) ? surface on every file card
      if (!res.ok && json.error) {
        setFiles((prev) =>
          prev.map((s) =>
            s.file.name === file.name
              ? { ...s, status: "error", error: json.error }
              : s,
          ),
        );
        return;
      }

      const fileResult = json.results?.[0];
      setFiles((prev) =>
        prev.map((s) =>
          s.file.name === file.name
            ? fileResult?.ok
              ? { ...s, status: "ready", preview: fileResult.result }
              : { ...s, status: "error", error: fileResult?.error ?? "Unknown error" }
            : s,
        ),
      );
    } catch (err) {
      setFiles((prev) =>
        prev.map((s) =>
          s.file.name === file.name
            ? { ...s, status: "error", error: String(err) }
            : s,
        ),
      );
    }
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  // ---------- Commit ----------

  const commitAll = async () => {
    const toCommit = files.filter((f) => f.status === "ready");
    if (toCommit.length === 0) return;
    setCommitting(true);

    for (const state of toCommit) {
      setFiles((prev) =>
        prev.map((s) =>
          s.file.name === state.file.name ? { ...s, status: "committing" } : s,
        ),
      );

      const formData = new FormData();
      formData.append("files", state.file);
      formData.append("mode", state.mode);

      try {
        const res = await fetch("/api/ingestor/upload", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        const fileResult = json.results?.[0];

        setFiles((prev) =>
          prev.map((s) =>
            s.file.name === state.file.name
              ? fileResult?.ok
                ? { ...s, status: "done", result: fileResult.result }
                : { ...s, status: "error", error: fileResult?.error ?? "Unknown error" }
              : s,
          ),
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((s) =>
            s.file.name === state.file.name
              ? { ...s, status: "error", error: String(err) }
              : s,
          ),
        );
      }
    }

    setCommitting(false);
  };

  // ---------- Render ----------

  if (!status) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-zinc-500">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const dbDisabled = status.db === "unconfigured" || status.db === "no_schema";
  const anyReady = files.some((f) => f.status === "ready");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-xl font-semibold text-zinc-100">
        Ingestor &mdash; Upload
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Drop <code className="font-mono">.md</code> plot-source files to preview
        and ingest into the database.
      </p>

      {/* DB unconfigured banner */}
      {status.db === "unconfigured" && (
        <div className="mb-6 rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          Database is not configured. Add{" "}
          <code className="font-mono text-amber-200">DATABASE_URL</code> to{" "}
          <code className="font-mono text-amber-200">.env.local</code> to enable
          this feature.
        </div>
      )}

      {/* DB schema missing banner */}
      {status.db === "no_schema" && (
        <div className="mb-6 rounded-lg border border-red-700/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <p className="font-medium">Database schema not found.</p>
          <p className="mt-1 text-red-400">
            The connection works but the tables are missing. Run the migration:
          </p>
          <pre className="mt-2 rounded bg-red-950/60 px-3 py-2 font-mono text-xs text-red-200">
            psql -d zuoran -f drizzle/migrations/0000_init.sql
          </pre>
          <p className="mt-1 text-red-400/80">
            Or: <code className="font-mono">npm run db:migrate</code> with{" "}
            <code className="font-mono">DATABASE_URL</code> exported in your
            shell environment.
          </p>
        </div>
      )}

      {/* Embedding notice */}
      {!dbDisabled && status.embeddings === "disabled" && (
        <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs text-zinc-400">
          Embeddings disabled &mdash; set{" "}
          <code className="font-mono">OPENAI_API_KEY</code> to generate them on
          ingest.
        </div>
      )}

      {/* Drop zone */}
      <div
        className={cn(
          "mb-6 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-600",
          "bg-zinc-900 p-10 text-zinc-400 transition",
          !dbDisabled &&
            "cursor-pointer hover:border-zinc-400 hover:text-zinc-300",
          dbDisabled && "opacity-40 cursor-not-allowed",
        )}
        onDrop={dbDisabled ? undefined : onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={
          dbDisabled ? undefined : () => inputRef.current?.click()
        }
      >
        <UploadCloud className="h-10 w-10" />
        <p className="text-sm font-medium">
          Drag &amp; drop <code className="font-mono">.md</code> files here, or
          click to browse
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".md"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Global mode */}
      {files.length > 0 && (
        <div className="mb-4 flex items-center gap-3 text-sm">
          <span className="text-zinc-400">Default mode:</span>
          <ModeSelector
            value={globalMode}
            onChange={(m) => {
              setGlobalMode(m);
              setFiles((prev) =>
                prev.map((f) =>
                  f.status === "ready" || f.status === "idle"
                    ? { ...f, mode: m }
                    : f,
                ),
              );
            }}
          />
        </div>
      )}

      {/* File cards */}
      <div className="space-y-3">
        {files.map((state) => (
          <FileCard
            key={state.file.name}
            state={state}
            onModeChange={(mode) => {
              setFiles((prev) =>
                prev.map((f) =>
                  f.file.name === state.file.name ? { ...f, mode } : f,
                ),
              );
            }}
            onToggleCollapse={() =>
              setFiles((prev) =>
                prev.map((f) =>
                  f.file.name === state.file.name
                    ? { ...f, collapsed: !f.collapsed }
                    : f,
                ),
              )
            }
            onRemove={() =>
              setFiles((prev) =>
                prev.filter((f) => f.file.name !== state.file.name),
              )
            }
          />
        ))}
      </div>

      {/* Commit button */}
      {files.length > 0 && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={commitAll}
            disabled={!anyReady || committing || dbDisabled}
            className={cn(
              "rounded-lg px-5 py-2 text-sm font-semibold transition",
              anyReady && !committing && !dbDisabled
                ? "bg-indigo-600 text-white hover:bg-indigo-500"
                : "cursor-not-allowed bg-zinc-800 text-zinc-500",
            )}
          >
            {committing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Committing&hellip;
              </span>
            ) : (
              "Commit ingest"
            )}
          </button>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModeSelector({
  value,
  onChange,
}: {
  value: IngestMode;
  onChange: (m: IngestMode) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as IngestMode)}
      className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none"
    >
      <option value="replace">replace (preserve manual edits)</option>
      <option value="skip">skip (don&apos;t touch existing)</option>
      <option value="replace-force">replace-force (wipe everything)</option>
    </select>
  );
}

function FileCard({
  state,
  onModeChange,
  onToggleCollapse,
  onRemove,
}: {
  state: FileState;
  onModeChange: (m: IngestMode) => void;
  onToggleCollapse: () => void;
  onRemove: () => void;
}) {
  const { file, status, mode, preview, result, error, collapsed } = state;
  const data = result ?? preview;

  const statusIcon = {
    idle: null,
    previewing: <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />,
    ready: <AlertTriangle className="h-4 w-4 text-amber-400" />,
    committing: <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />,
    done: <CheckCircle className="h-4 w-4 text-emerald-400" />,
    error: <XCircle className="h-4 w-4 text-red-400" />,
  }[status];

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900">
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          onClick={onToggleCollapse}
          className="text-zinc-500 hover:text-zinc-300"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {statusIcon}
        <span className="flex-1 truncate font-mono text-sm text-zinc-200">
          {file.name}
        </span>
        {status === "done" && data && (
          <span className="text-xs text-zinc-500">
            {data.scenesInserted}s / {data.unitsInserted}u
          </span>
        )}
        {(status === "ready" || status === "idle") && (
          <ModeSelector value={mode} onChange={onModeChange} />
        )}
        {status !== "committing" && (
          <button
            onClick={onRemove}
            className="ml-1 text-zinc-600 hover:text-zinc-400"
            aria-label="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="border-t border-zinc-800 px-4 py-3 text-xs">
          {status === "error" && (
            <p className="text-red-400">{error}</p>
          )}
          {status === "previewing" && (
            <p className="text-zinc-500">Parsing&hellip;</p>
          )}
          {data && <PreviewBody result={data} />}
        </div>
      )}
    </div>
  );
}

function PreviewBody({ result }: { result: IngestResult }) {
  const {
    chapter,
    scenesInserted,
    unitsInserted,
    embeddingsGenerated,
    conflicts,
    warnings,
  } = result;

  return (
    <div className="space-y-3">
      {/* Chapter meta */}
      <div className="grid grid-cols-3 gap-1 text-zinc-400">
        <span>
          Arc: <span className="text-zinc-200">{chapter.arc_key}</span>
        </span>
        <span>
          Chapter: <span className="text-zinc-200">{chapter.chapter_key}</span>
        </span>
        <span>
          Episode:{" "}
          <span className="text-zinc-200">{chapter.episode_label}</span>
        </span>
      </div>

      {/* Counts */}
      <div className="flex gap-4 text-zinc-400">
        <span>
          Scenes: <span className="text-zinc-200">{scenesInserted}</span>
        </span>
        <span>
          Units: <span className="text-zinc-200">{unitsInserted}</span>
        </span>
        {embeddingsGenerated > 0 && (
          <span>
            Embeddings:{" "}
            <span className="text-zinc-200">{embeddingsGenerated}</span>
          </span>
        )}
      </div>

      {/* Conflicts */}
      {conflicts.existingSceneCount > 0 && (
        <div className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-amber-300">
          Episode already has {conflicts.existingSceneCount} scene(s) /{" "}
          {conflicts.manuallyEditedUnitCount > 0
            ? `${conflicts.manuallyEditedUnitCount} manually-edited unit(s)`
            : "no manually-edited units"}
          .
          {conflicts.preservedSceneIds.length > 0 && (
            <span className="mt-1 block text-amber-400/80">
              {conflicts.preservedSceneIds.length} scene(s) will be preserved.
            </span>
          )}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <ul className="space-y-0.5 text-zinc-500">
          {warnings.map((w, i) => (
            <li key={i} className="flex gap-1">
              <span className="mt-px shrink-0 text-amber-600">&#9888;</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
