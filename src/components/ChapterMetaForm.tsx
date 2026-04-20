"use client";

import { useMemo, useState } from "react";
import type { ChapterMeta } from "@/lib/types";

const RELATIONSHIP_ARCS = ["wei_ming", "yi_mu", "tian_mi", "xiang_shou", "zhi_ai", "yi_shi"] as const;

const ARC_TITLE_PRESETS = ["未名篇", "旖慕篇", "甜蜜篇", "相守篇", "挚爱篇"] as const;

const CUSTOM_SENTINEL = "__custom__";

interface Props {
  meta: ChapterMeta;
  onChange: (patch: Partial<ChapterMeta>) => void;
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 transition min-w-0";

const selectCls =
  "w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 transition min-w-0";

export function ChapterMetaForm({ meta, onChange }: Props) {
  /** When true, empty `relationship_arc_title` still shows the "custom" row (user picked custom, not cleared). */
  const [arcTitleCustomEmptyMode, setArcTitleCustomEmptyMode] = useState(false);

  const arcTitlePick = useMemo(() => {
    const t = meta.relationship_arc_title;
    if (ARC_TITLE_PRESETS.includes(t as (typeof ARC_TITLE_PRESETS)[number])) return t;
    if (t.length > 0) return CUSTOM_SENTINEL;
    return arcTitleCustomEmptyMode ? CUSTOM_SENTINEL : "";
  }, [meta.relationship_arc_title, arcTitleCustomEmptyMode]);

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <Field label="Character ID">
        <input className={inputCls} value={meta.character_id} onChange={(e) => onChange({ character_id: e.target.value })} />
      </Field>
      <Field label="Source Type">
        <input className={inputCls} value={meta.source_type} onChange={(e) => onChange({ source_type: e.target.value })} />
      </Field>
      <Field label="Relationship Arc">
        <select
          className={selectCls}
          value={RELATIONSHIP_ARCS.includes(meta.relationship_arc as (typeof RELATIONSHIP_ARCS)[number]) ? meta.relationship_arc : ""}
          onChange={(e) => onChange({ relationship_arc: e.target.value })}
        >
          <option value="">Select arc…</option>
          {RELATIONSHIP_ARCS.map((arc) => (
            <option key={arc} value={arc}>
              {arc}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Arc Title">
        <select
          className={selectCls}
          value={arcTitlePick}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              setArcTitleCustomEmptyMode(false);
              onChange({ relationship_arc_title: "" });
              return;
            }
            if (v === CUSTOM_SENTINEL) {
              setArcTitleCustomEmptyMode(true);
              const current = meta.relationship_arc_title;
              const isPreset = ARC_TITLE_PRESETS.includes(current as (typeof ARC_TITLE_PRESETS)[number]);
              onChange({ relationship_arc_title: isPreset ? "" : current });
              return;
            }
            setArcTitleCustomEmptyMode(false);
            onChange({ relationship_arc_title: v });
          }}
        >
          <option value="">Select title…</option>
          {ARC_TITLE_PRESETS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value={CUSTOM_SENTINEL}>custom</option>
        </select>
        {arcTitlePick === CUSTOM_SENTINEL && (
          <input
            className={`${inputCls} mt-2`}
            placeholder="Custom arc title"
            value={meta.relationship_arc_title}
            onChange={(e) => onChange({ relationship_arc_title: e.target.value })}
          />
        )}
      </Field>
      <Field label="Chapter Label">
        <input className={inputCls} value={meta.chapter_label} onChange={(e) => onChange({ chapter_label: e.target.value })} placeholder="1-1" />
      </Field>
      <div className="flex gap-2 min-w-0 col-span-2 md:col-span-1">
        <Field label="Major" className="flex-1 min-w-0">
          <input
            type="number"
            className={inputCls}
            value={meta.chapter_index_major}
            onChange={(e) => onChange({ chapter_index_major: Number(e.target.value) })}
          />
        </Field>
        <Field label="Minor" className="flex-1 min-w-0">
          <input
            type="number"
            className={inputCls}
            value={meta.chapter_index_minor}
            onChange={(e) => onChange({ chapter_index_minor: Number(e.target.value) })}
          />
        </Field>
      </div>
      <Field label="Continuity Family">
        <input className={inputCls} value={meta.continuity_family} onChange={(e) => onChange({ continuity_family: e.target.value })} />
      </Field>
      <Field label="Segment Type">
        <input className={inputCls} value={meta.segment_type} onChange={(e) => onChange({ segment_type: e.target.value })} />
      </Field>
      <Field label="Scope Membership (one per line)" className="col-span-2 md:col-span-3">
        <textarea
          className={`${inputCls} resize-none`}
          rows={2}
          value={meta.scope_membership.join("\n")}
          onChange={(e) => onChange({ scope_membership: e.target.value.split("\n").filter(Boolean) })}
        />
      </Field>
    </div>
  );
}
