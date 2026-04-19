"use client";

import type { ChapterMeta } from "@/lib/types";

interface Props {
  meta: ChapterMeta;
  onChange: (patch: Partial<ChapterMeta>) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 transition";

export function ChapterMetaForm({ meta, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <Field label="Character ID">
        <input className={inputCls} value={meta.character_id} onChange={(e) => onChange({ character_id: e.target.value })} />
      </Field>
      <Field label="Source Type">
        <input className={inputCls} value={meta.source_type} onChange={(e) => onChange({ source_type: e.target.value })} />
      </Field>
      <Field label="Relationship Arc">
        <input className={inputCls} value={meta.relationship_arc} onChange={(e) => onChange({ relationship_arc: e.target.value })} />
      </Field>
      <Field label="Arc Title">
        <input className={inputCls} value={meta.relationship_arc_title} onChange={(e) => onChange({ relationship_arc_title: e.target.value })} />
      </Field>
      <Field label="Chapter Label">
        <input className={inputCls} value={meta.chapter_label} onChange={(e) => onChange({ chapter_label: e.target.value })} placeholder="1-1" />
      </Field>
      <div className="flex gap-2">
        <Field label="Major">
          <input
            type="number"
            className={inputCls}
            value={meta.chapter_index_major}
            onChange={(e) => onChange({ chapter_index_major: Number(e.target.value) })}
          />
        </Field>
        <Field label="Minor">
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
      <Field label="Scope Membership (one per line)">
        <textarea
          className={`${inputCls} resize-none`}
          rows={2}
          value={meta.scope_membership.join("\n")}
          onChange={(e) =>
            onChange({ scope_membership: e.target.value.split("\n").filter(Boolean) })
          }
        />
      </Field>
    </div>
  );
}
