"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Mirror of chatbot/backend INTERNAL_LOGIC_NODES (evidenceMiner/types.ts)
//
// Keep in sync if the backend node set changes. As of 2026-05-31 there are
// 8 nodes. This local copy avoids a cross-repo import.
// ---------------------------------------------------------------------------
const EVIDENCE_NODES = [
  "growth_environment",
  "core_belief",
  "core_motivation",
  "core_fear",
  "defense_mechanism",
  "transition_rule",
  "relationship_scope_gate",
  "expression_constraint",
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvidenceRow {
  id: string;
  status: string;
  node: string;
  claimText: string;
  evidenceText: string;
  confidenceScore: number | null;
  arcKey: string | null;
  chapterKey: string | null;
  episodeLabel: string | null;
  sceneOrder: number | null;
  unitIndex: number | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  canonChapterName: string | null;
  canonArcTitle: string | null;
}

interface TreeArc {
  id: string;
  arcKey: string;
  arcTitle: string;
  chapters: { id: string; chapterKey: string; chapterName: string }[];
}

type DbStatus = "configured" | "unconfigured" | "error";

const STATUS_OPTIONS = ["", "proposed", "active", "superseded"] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EvidencePage() {
  // DB / loading state
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [character, setCharacter] = useState("zuo_ran");
  const [statusFilter, setStatusFilter] = useState("proposed");
  const [arcFilter, setArcFilter] = useState("");
  const [chapterFilter, setChapterFilter] = useState("");
  const [nodeFilter, setNodeFilter] = useState("");

  // Tree data for arc/chapter dropdowns
  const [arcTree, setArcTree] = useState<TreeArc[]>([]);

  // Evidence data
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [count, setCount] = useState(0);

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Action feedback
  const [actionMsg, setActionMsg] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  // Mining state
  const [mineArcFilter, setMineArcFilter] = useState("");
  const [mineChapters, setMineChapters] = useState<string[]>([]);
  const [mining, setMining] = useState(false);
  const [mineResult, setMineResult] = useState<{
    success: boolean;
    newRows: number;
    message: string;
  } | null>(null);

  // Derived: chapters for selected arc (evidence filter)
  const chaptersForArc = useMemo(() => {
    if (!arcFilter) return [];
    const arc = arcTree.find((a) => a.arcKey === arcFilter);
    return arc?.chapters ?? [];
  }, [arcTree, arcFilter]);

  // Derived: chapters for mining arc
  const mineChaptersForArc = useMemo(() => {
    if (!mineArcFilter) return [];
    const arc = arcTree.find((a) => a.arcKey === mineArcFilter);
    return arc?.chapters ?? [];
  }, [arcTree, mineArcFilter]);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  async function fetchEvidenceRows() {
    const params = new URLSearchParams();
    if (character) params.set("character", character);
    if (statusFilter) params.set("status", statusFilter);
    if (arcFilter) params.set("arc", arcFilter);
    if (chapterFilter) params.set("chapter", chapterFilter);
    if (nodeFilter) params.set("node", nodeFilter);
    const res = await fetch(`/api/ingestor/evidence?${params.toString()}`);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(
        body?.error ?? `Evidence API returned ${res.status}`,
      );
    }
    const data = (await res.json()) as { rows: EvidenceRow[]; count: number };
    return { rows: data.rows ?? [], count: data.count ?? 0 };
  }

  /** Reload evidence data without touching actionMsg (used after promote/reject). */
  async function reloadData() {
    try {
      const data = await fetchEvidenceRows();
      setRows(data.rows);
      setCount(data.count);
      setSelectedIds(new Set());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to refresh";
      setActionMsg({ kind: "error", text: msg });
    }
  }

  /** Manual refresh — clears action feedback before reloading. */
  async function refresh() {
    setActionMsg(null);
    await reloadData();
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const statusRes = await fetch("/api/ingestor/status");
        const statusJson = await statusRes.json();
        if (statusJson.db !== "configured") {
          if (!cancelled) setDbStatus(statusJson.db as DbStatus);
          return;
        }
        if (cancelled) return;

        setDbStatus("configured");

        // Load tree (for arc/chapter dropdowns) + evidence in parallel
        const [treeRes, evidenceRes] = await Promise.all([
          fetch("/api/ingestor/tree"),
          fetchEvidenceRows(),
        ]);
        if (cancelled) return;

        const treeJson = await treeRes.json();
        const simplifiedArcs = (treeJson.tree ?? []).map(
          (arc: { id: string; arcKey: string; arcTitle: string; chapters: { id: string; chapterKey: string; chapterName: string }[] }) => ({
            id: arc.id,
            arcKey: arc.arcKey,
            arcTitle: arc.arcTitle,
            chapters: (arc.chapters ?? []).map(
              (ch: { id: string; chapterKey: string; chapterName: string }) => ({
                id: ch.id,
                chapterKey: ch.chapterKey,
                chapterName: ch.chapterName,
              }),
            ),
          }),
        );
        if (cancelled) return;
        setArcTree(simplifiedArcs);
        setRows(evidenceRes.rows);
        setCount(evidenceRes.count);
      } catch {
        if (!cancelled) setDbStatus("error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => { cancelled = true; };
  }, []);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const doPromote = useCallback(
    async (ids: string[]) => {
      setPromoting(true);
      setActionMsg(null);
      try {
        const res = await fetch("/api/ingestor/evidence/promote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId: character, ids }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Promote failed");
        setActionMsg({
          kind: "success",
          text: `Promoted ${json.updated} row(s).`,
        });
        await reloadData();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Promote failed";
        setActionMsg({ kind: "error", text: msg });
      } finally {
        setPromoting(false);
      }
    },
    [character],
  );

  const doReject = useCallback(
    async (ids: string[]) => {
      setRejecting(true);
      setActionMsg(null);
      try {
        const res = await fetch("/api/ingestor/evidence/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId: character, ids }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Reject failed");
        setActionMsg({
          kind: "success",
          text: `Rejected ${json.updated} row(s).`,
        });
        await reloadData();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Reject failed";
        setActionMsg({ kind: "error", text: msg });
      } finally {
        setRejecting(false);
      }
    },
    [character, refresh],
  );

  const doMine = useCallback(async () => {
    if (mineChapters.length === 0 || !mineArcFilter) return;
    setMining(true);
    setMineResult(null);
    setActionMsg(null);
    try {
      const res = await fetch("/api/ingestor/evidence/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character,
          arcKey: mineArcFilter,
          chapterKeys: mineChapters,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Mine failed");
      setMineResult({
        success: json.success,
        newRows: json.newRows ?? 0,
        message: json.success
          ? `Mining complete. ${json.newRows} new proposed row(s).`
          : `Miner finished with issues: ${json.error ?? "unknown"}`,
      });
      // Refresh the evidence list after mining
      await reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Mine failed";
      setMineResult({ success: false, newRows: 0, message: msg });
    } finally {
      setMining(false);
    }
  }, [character, mineArcFilter, mineChapters]);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelectedIds((prev) => {
      if (prev.size === rows.length) return new Set();
      return new Set(rows.map((r) => r.id));
    });

  // -----------------------------------------------------------------------
  // Render: loading / error states
  // -----------------------------------------------------------------------

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

  if (dbStatus === "error") {
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

  // -----------------------------------------------------------------------
  // Render: main page
  // -----------------------------------------------------------------------

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-200">
          Evidence Review
        </h1>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Filters row */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FilterGroup label="Character">
          <input
            value={character}
            onChange={(e) => setCharacter(e.target.value)}
            className="w-28 rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-600"
          />
        </FilterGroup>

        <FilterGroup label="Status">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-600"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "" ? "all" : s}
              </option>
            ))}
          </select>
        </FilterGroup>

        <FilterGroup label="Arc">
          <select
            value={arcFilter}
            onChange={(e) => {
              setArcFilter(e.target.value);
              setChapterFilter("");
            }}
            className="w-44 rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-600"
          >
            <option value="">all arcs</option>
            {arcTree.map((a) => (
              <option key={a.id} value={a.arcKey}>
                {a.arcTitle || a.arcKey}
              </option>
            ))}
          </select>
        </FilterGroup>

        <FilterGroup label="Chapter">
          <select
            value={chapterFilter}
            onChange={(e) => setChapterFilter(e.target.value)}
            disabled={!arcFilter}
            className="w-44 rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-600 disabled:opacity-40"
          >
            <option value="">all chapters</option>
            {chaptersForArc.map((ch) => (
              <option key={ch.id} value={ch.chapterKey}>
                {ch.chapterName}
              </option>
            ))}
          </select>
        </FilterGroup>

        <FilterGroup label="Node">
          <select
            value={nodeFilter}
            onChange={(e) => setNodeFilter(e.target.value)}
            className="w-44 rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-600"
          >
            <option value="">all nodes</option>
            {EVIDENCE_NODES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </FilterGroup>

        <button
          onClick={refresh}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Search
        </button>
      </div>

      {/* Mining panel */}
      <details className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/30">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 select-none">
          Evidence Mining
        </summary>
        <div className="border-t border-zinc-800 px-3 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <FilterGroup label="Arc">
              <select
                value={mineArcFilter}
                onChange={(e) => {
                  setMineArcFilter(e.target.value);
                  setMineChapters([]);
                }}
                className="w-44 rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-amber-600"
              >
                <option value="">select arc</option>
                {arcTree.map((a) => (
                  <option key={a.id} value={a.arcKey}>
                    {a.arcTitle || a.arcKey}
                  </option>
                ))}
              </select>
            </FilterGroup>

            <FilterGroup label="Chapters (ctrl+click to select multiple)">
              <select
                multiple
                value={mineChapters}
                onChange={(e) =>
                  setMineChapters(
                    Array.from(e.target.selectedOptions, (o) => o.value),
                  )
                }
                disabled={!mineArcFilter}
                className="h-24 w-56 rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-amber-600 disabled:opacity-40"
              >
                {mineChaptersForArc.map((ch) => (
                  <option key={ch.id} value={ch.chapterKey}>
                    {ch.chapterName}
                  </option>
                ))}
              </select>
            </FilterGroup>

            <button
              onClick={doMine}
              disabled={mining || mineChapters.length === 0}
              className="rounded-md bg-amber-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {mining ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mining…
                </span>
              ) : (
                "Run Mining"
              )}
            </button>
          </div>

          {/* Mining result feedback */}
          {mineResult && (
            <div
              className={cn(
                "mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                mineResult.success
                  ? "bg-emerald-950/40 text-emerald-300"
                  : "bg-red-950/40 text-red-300",
              )}
            >
              {mineResult.success ? (
                <Check className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
              <span>
                {mineResult.message}
                {mineResult.success &&
                  ` (model calls may have incurred API costs)`}
              </span>
              <button
                onClick={() => setMineResult(null)}
                className="ml-auto text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </details>

      {/* Action feedback */}
      {actionMsg && (
        <div
          className={cn(
            "mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm",
            actionMsg.kind === "success"
              ? "bg-emerald-950/40 text-emerald-300"
              : "bg-red-950/40 text-red-300",
          )}
        >
          {actionMsg.kind === "success" ? (
            <Check className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4" />
          )}
          {actionMsg.text}
          <button
            onClick={() => setActionMsg(null)}
            className="ml-auto text-zinc-500 hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 text-sm text-zinc-400">
          <span>
            {selectedIds.size} row(s) selected
          </span>
          <button
            onClick={() => doPromote([...selectedIds])}
            disabled={promoting}
            className="rounded bg-emerald-800/60 px-3 py-1 text-emerald-300 hover:bg-emerald-700/60 disabled:opacity-50"
          >
            {promoting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Promote selected"
            )}
          </button>
          <button
            onClick={() => doReject([...selectedIds])}
            disabled={rejecting}
            className="rounded bg-red-800/60 px-3 py-1 text-red-300 hover:bg-red-700/60 disabled:opacity-50"
          >
            {rejecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Reject selected"
            )}
          </button>
        </div>
      )}

      {/* Count */}
      <p className="mb-2 text-xs text-zinc-500">
        {count} row(s)
      </p>

      {/* Evidence table */}
      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-600">
          No evidence rows match the current filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-500">
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === rows.length && rows.length > 0}
                    onChange={toggleSelectAll}
                    className="accent-indigo-500"
                  />
                </th>
                <th className="px-2 py-2">Node</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Conf.</th>
                <th className="px-2 py-2">Claim</th>
                <th className="px-2 py-2">Evidence</th>
                <th className="px-2 py-2">Provenance</th>
                <th className="px-2 py-2">Metadata</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelected = selectedIds.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-zinc-800/50 transition-colors",
                      isSelected ? "bg-indigo-950/20" : "hover:bg-zinc-900/50",
                    )}
                  >
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(row.id)}
                        className="accent-indigo-500"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] font-mono text-zinc-300">
                        {row.node}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-2 py-2 text-zinc-400">
                      {row.confidenceScore != null
                        ? row.confidenceScore.toFixed(2)
                        : "—"}
                    </td>
                    <td className="max-w-xs px-2 py-2">
                      <Cell text={row.claimText} />
                    </td>
                    <td className="max-w-xs px-2 py-2">
                      <Cell text={row.evidenceText} />
                    </td>
                    <td className="px-2 py-2">
                      <ProvenanceCell row={row} />
                    </td>
                    <td className="px-2 py-2">
                      <MetadataCell metadata={row.metadata} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => doPromote([row.id])}
                          disabled={row.status !== "proposed" || promoting}
                          title={row.status !== "proposed" ? "Only proposed rows can be promoted" : "Promote"}
                          className="rounded bg-emerald-800/40 px-2 py-1 text-[11px] text-emerald-400 hover:bg-emerald-700/50 disabled:opacity-30"
                        >
                          Promote
                        </button>
                        <button
                          onClick={() => doReject([row.id])}
                          disabled={row.status !== "proposed" || rejecting}
                          title={row.status !== "proposed" ? "Only proposed rows can be rejected" : "Reject"}
                          className="rounded bg-red-800/40 px-2 py-1 text-[11px] text-red-400 hover:bg-red-700/50 disabled:opacity-30"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider text-zinc-600">
        {label}
      </label>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    proposed: "bg-amber-900/40 text-amber-300",
    active: "bg-emerald-900/40 text-emerald-300",
    superseded: "bg-zinc-800 text-zinc-500",
  };
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[11px] font-medium",
        colors[status] ?? "bg-zinc-800 text-zinc-400",
      )}
    >
      {status}
    </span>
  );
}

function Cell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > 120;
  return (
    <div>
      <span className="text-zinc-300">
        {expanded || !truncated ? text : `${text.slice(0, 120)}…`}
      </span>
      {truncated && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-1 text-[10px] text-indigo-500 hover:text-indigo-400"
        >
          {expanded ? "less" : "more"}
        </button>
      )}
    </div>
  );
}

function ProvenanceCell({ row }: { row: EvidenceRow }) {
  const parts: string[] = [];
  if (row.canonArcTitle) parts.push(row.canonArcTitle);
  if (row.canonChapterName) parts.push(row.canonChapterName);
  if (row.episodeLabel) parts.push(row.episodeLabel);
  if (row.sceneOrder != null) parts.push(`sc ${row.sceneOrder}`);
  if (row.unitIndex != null) parts.push(`u${row.unitIndex}`);

  if (parts.length === 0) {
    if (row.arcKey) parts.push(row.arcKey);
    if (row.chapterKey) parts.push(row.chapterKey);
  }

  const label = parts.join(" / ");
  const href =
    row.arcKey && row.chapterKey
      ? `/ingestor/evidence?character=zuo_ran&arc=${encodeURIComponent(row.arcKey)}&chapter=${encodeURIComponent(row.chapterKey)}`
      : null;

  return (
    <span className="text-xs text-zinc-500" title={label}>
      {href ? (
        <a
          href={href}
          className="text-indigo-500 hover:text-indigo-400 underline underline-offset-2"
        >
          {label}
        </a>
      ) : (
        label
      )}
    </span>
  );
}

function MetadataCell({ metadata }: { metadata: Record<string, unknown> }) {
  const parts: string[] = [];
  if (metadata.source) parts.push(String(metadata.source));
  if (metadata.model) parts.push(String(metadata.model));
  if (metadata.minedBatchId) parts.push(`batch:${String(metadata.minedBatchId).slice(0, 8)}`);
  if (metadata.promptVersion) parts.push(`v${metadata.promptVersion}`);

  if (parts.length === 0) return <span className="text-[11px] text-zinc-700">—</span>;

  return (
    <div className="flex flex-col gap-0.5">
      {parts.map((p, i) => (
        <span key={i} className="text-[11px] text-zinc-500">
          {p}
        </span>
      ))}
    </div>
  );
}
