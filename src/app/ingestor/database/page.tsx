"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types (mirrors server response shape)
// ---------------------------------------------------------------------------

interface TreeUnit {
  id: string;
  contentType: string;
  unitIndex: number;
  speaker: string | null;
  textContent: string;
  manuallyEdited: boolean;
}

interface TreeScene {
  id: string;
  sceneTitle: string | null;
  sceneOrder: number;
  timelineOrder: number | null;
  location: string | null;
  timeHint: string | null;
  manuallyEdited: boolean;
  unitCount: number;
  hasEditedUnits: boolean;
}

interface TreeEpisode {
  id: string;
  episodeLabel: string;
  episodeOrder: number;
  episodeTitle: string | null;
  manuallyEdited: boolean;
  sceneCount: number;
  hasEditedScenes: boolean;
  scenes: TreeScene[];
}

interface TreeChapter {
  id: string;
  chapterKey: string;
  chapterName: string;
  chapterTimelineOrder: number | null;
  chapterType: string;
  manuallyEdited: boolean;
  episodes: TreeEpisode[];
}

interface TreeAuWorld {
  id: string;
  auWorldKey: string;
  auWorldTitle: string | null;
  chapters: TreeChapter[];
}

interface TreeArc {
  id: string;
  arcKey: string;
  arcTitle: string;
  continuityFamily: string;
  chapters: TreeChapter[];
  auWorlds: TreeAuWorld[];
}

type SelectionKind = "arc" | "auWorld" | "chapter" | "episode" | "scene";
interface Selection {
  kind: SelectionKind;
  id: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type DbStatus = "configured" | "unconfigured" | "no_schema" | "error";

export default function DatabasePage() {
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [tree, setTree] = useState<TreeArc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const refreshTree = useCallback(
    () =>
      fetch("/api/ingestor/status")
        .then((r) => r.json())
        .then((status) => {
          if (status.db !== "configured") {
            setDbStatus(status.db as DbStatus);
            return;
          }
          setDbStatus("configured");
          return fetch("/api/ingestor/tree")
            .then((r) => r.json())
            .then((treeData) => setTree(treeData.tree ?? []));
        })
        .catch(() => setDbStatus("error"))
        .finally(() => setLoading(false)),
    [],
  );

  const loadTree = useCallback(() => {
    setLoading(true);
    return refreshTree();
  }, [refreshTree]);

  useEffect(() => {
    refreshTree();
  }, [refreshTree]);

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-zinc-500">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (dbStatus === "unconfigured") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-4 text-sm text-amber-300">
          Database is not configured. Add{" "}
          <code className="font-mono text-amber-200">DATABASE_URL</code> to{" "}
          <code className="font-mono text-amber-200">.env.local</code> to enable
          this feature.
        </div>
      </main>
    );
  }

  if (dbStatus === "no_schema") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-lg border border-red-700/50 bg-red-950/40 px-4 py-4 text-sm text-red-300">
          <p className="font-medium">Database schema not found.</p>
          <p className="mt-1 text-red-400">
            The connection works but the tables are missing. Run the migration:
          </p>
          <pre className="mt-2 rounded bg-red-950/60 px-3 py-2 font-mono text-xs text-red-200">
            psql -d zuoran-memory -f drizzle/migrations/0000_init.sql
          </pre>
          <p className="mt-1 text-red-400/80">
            Or:{" "}
            <code className="font-mono">npm run db:migrate</code> with{" "}
            <code className="font-mono">DATABASE_URL</code> exported in your
            shell.
          </p>
        </div>
      </main>
    );
  }

  if (dbStatus === "error" || (dbStatus !== null && dbStatus !== "configured")) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-lg border border-red-700/50 bg-red-950/40 px-4 py-4 text-sm text-red-300">
          Could not connect to the database. Check your{" "}
          <code className="font-mono text-red-200">DATABASE_URL</code> and
          ensure Postgres is running.
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-[calc(100vh-48px)] overflow-hidden">
      {/* Left pane — tree browser */}
      <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-950 pb-8">
        <div className="sticky top-0 z-10 bg-zinc-950 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Story Tree
        </div>
        {tree.length === 0 && (
          <p className="px-4 text-sm text-zinc-600">No data ingested yet.</p>
        )}
        {tree.map((arc) => (
          <ArcNode
            key={arc.id}
            arc={arc}
            selection={selection}
            expandedIds={expandedIds}
            onSelect={setSelection}
            onToggle={toggleExpand}
          />
        ))}
      </aside>

      {/* Right pane — detail */}
      <section className="flex-1 overflow-y-auto bg-zinc-950 p-6">
        {!selection ? (
          <div className="flex h-full items-center justify-center text-zinc-600">
            Select an item from the tree to view or edit it.
          </div>
        ) : (
          <DetailPanel
            key={`${selection.kind}:${selection.id}`}
            selection={selection}
            onSaved={() => { setLoading(true); loadTree(); }}
            onDeleted={() => {
              setSelection(null);
              setLoading(true);
              loadTree();
            }}
          />
        )}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Tree nodes
// ---------------------------------------------------------------------------

function ArcNode({
  arc,
  selection,
  expandedIds,
  onSelect,
  onToggle,
}: {
  arc: TreeArc;
  selection: Selection | null;
  expandedIds: Set<string>;
  onSelect: (s: Selection) => void;
  onToggle: (id: string) => void;
}) {
  const expanded = expandedIds.has(arc.id);
  return (
    <div>
      <TreeRow
        label={arc.arcTitle || arc.arcKey}
        badge={arc.continuityFamily === "au" ? "AU" : undefined}
        depth={0}
        expanded={expanded}
        selected={selection?.id === arc.id}
        hasChildren={arc.chapters.length > 0 || arc.auWorlds.length > 0}
        onToggle={() => onToggle(arc.id)}
        onSelect={() => onSelect({ kind: "arc", id: arc.id })}
      />
      {expanded && (
        <>
          {arc.auWorlds.map((w) => (
            <AuWorldNode
              key={w.id}
              world={w}
              selection={selection}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
          {arc.chapters.map((ch) => (
            <ChapterNode
              key={ch.id}
              chapter={ch}
              selection={selection}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              depth={1}
            />
          ))}
        </>
      )}
    </div>
  );
}

function AuWorldNode({
  world,
  selection,
  expandedIds,
  onSelect,
  onToggle,
}: {
  world: TreeAuWorld;
  selection: Selection | null;
  expandedIds: Set<string>;
  onSelect: (s: Selection) => void;
  onToggle: (id: string) => void;
}) {
  const expanded = expandedIds.has(world.id);
  return (
    <div>
      <TreeRow
        label={world.auWorldTitle || world.auWorldKey}
        depth={1}
        expanded={expanded}
        selected={selection?.id === world.id}
        hasChildren={world.chapters.length > 0}
        onToggle={() => onToggle(world.id)}
        onSelect={() => onSelect({ kind: "auWorld", id: world.id })}
      />
      {expanded &&
        world.chapters.map((ch) => (
          <ChapterNode
            key={ch.id}
            chapter={ch}
            selection={selection}
            expandedIds={expandedIds}
            onSelect={onSelect}
            onToggle={onToggle}
            depth={2}
          />
        ))}
    </div>
  );
}

function ChapterNode({
  chapter,
  depth,
  selection,
  expandedIds,
  onSelect,
  onToggle,
}: {
  chapter: TreeChapter;
  depth: number;
  selection: Selection | null;
  expandedIds: Set<string>;
  onSelect: (s: Selection) => void;
  onToggle: (id: string) => void;
}) {
  const expanded = expandedIds.has(chapter.id);
  return (
    <div>
      <TreeRow
        label={chapter.chapterName}
        depth={depth}
        expanded={expanded}
        selected={selection?.id === chapter.id}
        hasChildren={chapter.episodes.length > 0}
        edited={chapter.manuallyEdited}
        onToggle={() => onToggle(chapter.id)}
        onSelect={() => onSelect({ kind: "chapter", id: chapter.id })}
      />
      {expanded &&
        chapter.episodes.map((ep) => (
          <EpisodeNode
            key={ep.id}
            episode={ep}
            depth={depth + 1}
            selection={selection}
            expandedIds={expandedIds}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
    </div>
  );
}

function EpisodeNode({
  episode,
  depth,
  selection,
  expandedIds,
  onSelect,
  onToggle,
}: {
  episode: TreeEpisode;
  depth: number;
  selection: Selection | null;
  expandedIds: Set<string>;
  onSelect: (s: Selection) => void;
  onToggle: (id: string) => void;
}) {
  const expanded = expandedIds.has(episode.id);
  return (
    <div>
      <TreeRow
        label={`${episode.episodeLabel}${episode.episodeTitle ? ` · ${episode.episodeTitle}` : ""}`}
        meta={`${episode.sceneCount}s`}
        depth={depth}
        expanded={expanded}
        selected={selection?.id === episode.id}
        hasChildren={episode.scenes.length > 0}
        edited={episode.manuallyEdited || episode.hasEditedScenes}
        onToggle={() => onToggle(episode.id)}
        onSelect={() => onSelect({ kind: "episode", id: episode.id })}
      />
      {expanded &&
        episode.scenes.map((sc) => (
          <TreeRow
            key={sc.id}
            label={sc.sceneTitle || `Scene ${sc.sceneOrder}`}
            meta={`${sc.unitCount}u`}
            depth={depth + 1}
            selected={selection?.id === sc.id}
            edited={sc.manuallyEdited || sc.hasEditedUnits}
            hasChildren={false}
            onSelect={() => onSelect({ kind: "scene", id: sc.id })}
          />
        ))}
    </div>
  );
}

function TreeRow({
  label,
  badge,
  meta,
  depth,
  expanded,
  selected,
  hasChildren,
  edited,
  onToggle,
  onSelect,
}: {
  label: string;
  badge?: string;
  meta?: string;
  depth: number;
  expanded?: boolean;
  selected: boolean;
  hasChildren: boolean;
  edited?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "flex cursor-pointer items-center gap-1 py-1 pr-3 text-sm transition-colors",
        selected ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
      )}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      onClick={() => {
        onToggle?.();
        onSelect();
      }}
    >
      {hasChildren ? (
        <span className="shrink-0 text-zinc-600">
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </span>
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="shrink-0 rounded bg-purple-900/60 px-1 text-[10px] text-purple-300">
          {badge}
        </span>
      )}
      {meta && (
        <span className="shrink-0 text-[10px] text-zinc-600">{meta}</span>
      )}
      {edited && (
        <Circle className="h-1.5 w-1.5 shrink-0 fill-indigo-400 text-indigo-400" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function DetailPanel({
  selection,
  onSaved,
  onDeleted,
}: {
  selection: Selection;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const endpoint =
    selection.kind === "scene"
      ? `/api/ingestor/scenes/${selection.id}`
      : selection.kind === "chapter"
        ? `/api/ingestor/chapters/${selection.id}`
        : selection.kind === "episode"
          ? `/api/ingestor/episodes/${selection.id}`
          : null;

  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [units, setUnits] = useState<TreeUnit[]>([]);
  const [loading, setLoading] = useState(endpoint !== null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInfo, setDeleteInfo] = useState<string>("");

  useEffect(() => {
    if (!endpoint) return;
    fetch(endpoint)
      .then((r) => r.json())
      .then((json) => {
        const record =
          json.scene ?? json.chapter ?? json.episode ?? json.unit ?? null;
        setData(record);
        setForm(record ?? {});
        if (json.units) setUnits(json.units);
      })
      .finally(() => setLoading(false));
  }, [endpoint]);

  const save = async () => {
    if (!endpoint) return;
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      const updated = json.scene ?? json.chapter ?? json.episode ?? json.unit;
      if (updated) {
        setData(updated);
        setForm(updated);
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center text-zinc-600">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  // Arc and AU world: read-only
  if (selection.kind === "arc" || selection.kind === "auWorld") {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-zinc-200">
          {selection.kind === "arc" ? "Relationship Arc" : "AU World"}
        </h2>
        <p className="text-sm text-zinc-500">
          Arc and AU world metadata is read-only. Use the ingestor to update it from source.
        </p>
      </div>
    );
  }

  const isEditable = selection.kind === "chapter" || selection.kind === "episode" || selection.kind === "scene";

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold capitalize text-zinc-200">
          {selection.kind}
        </h2>
        {Boolean(data?.manuallyEdited) && (
          <span className="flex items-center gap-1 text-xs text-indigo-400">
            <Circle className="h-1.5 w-1.5 fill-indigo-400" /> manually edited
          </span>
        )}
      </div>

      {/* Chapter form */}
      {selection.kind === "chapter" && (
        <div className="space-y-3">
          <Field
            label="Chapter name"
            value={String(form.chapterName ?? "")}
            onChange={(v) => setForm((f) => ({ ...f, chapterName: v }))}
          />
          <Field
            label="Chapter type"
            value={String(form.chapterType ?? "")}
            onChange={(v) => setForm((f) => ({ ...f, chapterType: v }))}
          />
          <Field
            label="Timeline order"
            value={String(form.chapterTimelineOrder ?? "")}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                chapterTimelineOrder: v === "" ? null : Number(v),
              }))
            }
          />
          <JsonField
            label="Metadata"
            value={form.metadata as Record<string, unknown> | null}
            onChange={(v) => setForm((f) => ({ ...f, metadata: v }))}
          />
          <AutoSummaryBlock
            title="Chapter summary (auto)"
            body={data?.summary as string | null | undefined}
            model={data?.summaryModel as string | null | undefined}
            generatedAt={data?.summaryGeneratedAt as string | null | undefined}
            hasEmbedding={Boolean(
              data?.summaryEmbedding != null &&
                (Array.isArray(data.summaryEmbedding)
                  ? data.summaryEmbedding.length > 0
                  : true),
            )}
          />
        </div>
      )}

      {/* Episode form */}
      {selection.kind === "episode" && (
        <div className="space-y-3">
          <Field
            label="Episode label"
            value={String(form.episodeLabel ?? "")}
            onChange={(v) => setForm((f) => ({ ...f, episodeLabel: v }))}
          />
          <Field
            label="Episode title"
            value={String(form.episodeTitle ?? "")}
            onChange={(v) => setForm((f) => ({ ...f, episodeTitle: v }))}
          />
          <Field
            label="Episode order"
            value={String(form.episodeOrder ?? "")}
            onChange={(v) =>
              setForm((f) => ({ ...f, episodeOrder: Number(v) }))
            }
          />
          <JsonField
            label="Metadata"
            value={form.metadata as Record<string, unknown> | null}
            onChange={(v) => setForm((f) => ({ ...f, metadata: v }))}
          />
          <AutoSummaryBlock
            title="Episode summary (auto)"
            body={data?.summary as string | null | undefined}
            model={data?.summaryModel as string | null | undefined}
            generatedAt={data?.summaryGeneratedAt as string | null | undefined}
            hasEmbedding={Boolean(
              data?.summaryEmbedding != null &&
                (Array.isArray(data.summaryEmbedding)
                  ? data.summaryEmbedding.length > 0
                  : true),
            )}
          />
        </div>
      )}

      {/* Scene form */}
      {selection.kind === "scene" && (
        <div className="space-y-3">
          <Field
            label="Scene title"
            value={String(form.sceneTitle ?? "")}
            onChange={(v) => setForm((f) => ({ ...f, sceneTitle: v }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Scene order"
              value={String(form.sceneOrder ?? "")}
              onChange={(v) =>
                setForm((f) => ({ ...f, sceneOrder: Number(v) }))
              }
            />
            <Field
              label="Timeline order"
              value={String(form.timelineOrder ?? "")}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  timelineOrder: v === "" ? null : Number(v),
                }))
              }
            />
            <Field
              label="Location"
              value={String(form.location ?? "")}
              onChange={(v) => setForm((f) => ({ ...f, location: v }))}
            />
            <Field
              label="Time hint"
              value={String(form.timeHint ?? "")}
              onChange={(v) => setForm((f) => ({ ...f, timeHint: v }))}
            />
          </div>
          <AutoSummaryBlock
            title="Scene summary (auto)"
            body={data?.sceneSummary as string | null | undefined}
            model={data?.summaryModel as string | null | undefined}
            generatedAt={data?.summaryGeneratedAt as string | null | undefined}
            hasEmbedding={Boolean(
              data?.sceneSummaryEmbedding != null &&
                (Array.isArray(data.sceneSummaryEmbedding)
                  ? data.sceneSummaryEmbedding.length > 0
                  : true),
            )}
          />
        </div>
      )}

      {/* Save / Delete buttons */}
      {isEditable && (
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Save"
            )}
          </button>

          {selection.kind === "scene" && (
            <>
              {confirmDelete ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-400">
                    {deleteInfo}
                  </span>
                  <button
                    onClick={async () => {
                      await fetch(`/api/ingestor/scenes/${selection.id}`, {
                        method: "DELETE",
                      });
                      onDeleted();
                    }}
                    className="rounded bg-red-700 px-2 py-1 text-white hover:bg-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    const res = await fetch(
                      `/api/ingestor/scenes/${selection.id}`,
                    );
                    const json = await res.json();
                    setDeleteInfo(
                      `Delete "${form.sceneTitle || `scene ${form.sceneOrder}`}"? This removes ${json.units?.length ?? "?"} unit(s). Cannot be undone.`,
                    );
                    setConfirmDelete(true);
                  }}
                  className="flex items-center gap-1 rounded-lg border border-red-800/50 px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/30"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Unit list for scenes */}
      {selection.kind === "scene" && units.length > 0 && (
        <UnitList
          units={units}
          onChanged={() => {
            fetch(endpoint!)
              .then((r) => r.json())
              .then((json) => {
                if (json.units) setUnits(json.units);
              });
            onSaved();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unit list
// ---------------------------------------------------------------------------

function UnitList({
  units,
  onChanged,
}: {
  units: TreeUnit[];
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<TreeUnit>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const saveUnit = async (id: string) => {
    await fetch(`/api/ingestor/units/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditingId(null);
    onChanged();
  };

  const deleteUnit = async (id: string) => {
    await fetch(`/api/ingestor/units/${id}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    onChanged();
  };

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Units ({units.length})
      </h3>
      <div className="space-y-1.5">
        {units.map((unit) => {
          const isEditing = editingId === unit.id;
          const isConfirming = confirmDeleteId === unit.id;

          return (
            <div
              key={unit.id}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                unit.manuallyEdited
                  ? "border-indigo-800/50 bg-indigo-950/20"
                  : "border-zinc-800 bg-zinc-900",
              )}
            >
              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={editForm.contentType ?? unit.contentType}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          contentType: e.target.value,
                        }))
                      }
                      className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
                    >
                      <option value="narration">narration</option>
                      <option value="dialogue">dialogue</option>
                      <option value="inner_thought">inner_thought</option>
                    </select>
                    {(editForm.contentType ?? unit.contentType) ===
                      "dialogue" && (
                      <input
                        value={editForm.speaker ?? unit.speaker ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            speaker: e.target.value,
                          }))
                        }
                        placeholder="Speaker"
                        className="flex-1 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none"
                      />
                    )}
                  </div>
                  <textarea
                    value={editForm.textContent ?? unit.textContent}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        textContent: e.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveUnit(unit.id)}
                      className="flex items-center gap-1 rounded bg-indigo-700 px-2 py-1 text-xs text-white hover:bg-indigo-600"
                    >
                      <Check className="h-3 w-3" /> Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 rounded bg-zinc-800 px-1 text-[10px] text-zinc-500">
                    {unit.contentType}
                  </span>
                  <span className="flex-1 text-zinc-300">
                    {unit.speaker && (
                      <span className="mr-1 font-medium text-zinc-400">
                        {unit.speaker}:
                      </span>
                    )}
                    {unit.textContent}
                  </span>
                  {unit.manuallyEdited && (
                    <Circle className="mt-1 h-1.5 w-1.5 shrink-0 fill-indigo-400 text-indigo-400" />
                  )}
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => {
                        setEditingId(unit.id);
                        setEditForm({});
                      }}
                      className="text-zinc-600 hover:text-zinc-300"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {isConfirming ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-zinc-500">
                          Delete {unit.contentType} line?
                        </span>
                        <button
                          onClick={() => deleteUnit(unit.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-zinc-500 hover:text-zinc-300"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(unit.id)}
                        className="text-zinc-600 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small form helpers
// ---------------------------------------------------------------------------

function AutoSummaryBlock({
  title,
  body,
  model,
  generatedAt,
  hasEmbedding,
}: {
  title: string;
  body: string | null | undefined;
  model?: string | null | undefined;
  generatedAt?: string | null | undefined;
  hasEmbedding?: boolean;
}) {
  const text = (body ?? "").trim();
  const when =
    generatedAt &&
    (() => {
      try {
        return new Date(generatedAt).toLocaleString();
      } catch {
        return String(generatedAt);
      }
    })();

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/50">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium text-zinc-400">{title}</span>
        <span className="text-[10px] text-zinc-600">
          {model ? `model: ${model}` : "model: —"}
          {when ? ` · ${when}` : ""}
          {hasEmbedding ? " · embedding" : ""}
        </span>
      </div>
      {text ? (
        <p className="max-h-48 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed text-zinc-300">
          {text}
        </p>
      ) : (
        <p className="px-3 py-2 text-sm italic text-zinc-600">
          No summary yet. Populated after ingest with{" "}
          <code className="text-zinc-500">OPENAI_API_KEY</code> (unless{" "}
          <code className="text-zinc-500">SKIP_AUTO_SUMMARY=1</code>), or run{" "}
          <code className="text-zinc-500">npm run backfill:summaries</code>.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-600"
      />
    </div>
  );
}

function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Record<string, unknown> | null;
  onChange: (v: unknown) => void;
}) {
  const [raw, setRaw] = useState(
    value ? JSON.stringify(value, null, 2) : "",
  );
  const [error, setError] = useState(false);

  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500">{label}</label>
      <textarea
        value={raw}
        rows={4}
        onChange={(e) => {
          setRaw(e.target.value);
          try {
            onChange(e.target.value ? JSON.parse(e.target.value) : null);
            setError(false);
          } catch {
            setError(true);
          }
        }}
        className={cn(
          "w-full rounded-md bg-zinc-800 px-3 py-1.5 font-mono text-xs text-zinc-200 outline-none focus:ring-1",
          error ? "ring-1 ring-red-600" : "focus:ring-indigo-600",
        )}
      />
      {error && <p className="mt-1 text-[10px] text-red-400">Invalid JSON</p>}
    </div>
  );
}
