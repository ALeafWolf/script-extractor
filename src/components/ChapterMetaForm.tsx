"use client";

import { useLayoutEffect } from "react";
import type { ChapterMeta, ContinuityFamily, ChapterType, ScopeOption } from "@/lib/types";

const MAIN_ARC_TITLES = ["未名篇", "旖慕篇", "甜蜜篇", "相守篇", "挚爱篇"] as const;
const AU_ARC_TITLES = ["异世篇"] as const;

const ARC_PRESET: Record<string, { key: string; arc_timeline_order: number | null }> = {
  未名篇: { key: "main_weiming", arc_timeline_order: 1 },
  旖慕篇: { key: "main_yimu", arc_timeline_order: 2 },
  甜蜜篇: { key: "main_tianmi", arc_timeline_order: 3 },
  相守篇: { key: "main_xiangshou", arc_timeline_order: 4 },
  挚爱篇: { key: "main_zhiai", arc_timeline_order: 5 },
  异世篇: { key: "au_yishi", arc_timeline_order: null },
};

const SCOPE_OPTIONS: ScopeOption[] = [
  "main_pre_relationship",
  "main_situationship",
  "main_relationship",
  "main_engaged",
  "main_married",
];

const CHAPTER_TYPES: ChapterType[] = ["main_story", "personal_story", "side_story"];

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

function firstTitleFor(family: ContinuityFamily): string {
  return family === "au" ? AU_ARC_TITLES[0] : MAIN_ARC_TITLES[0];
}

function isTitleValid(family: ContinuityFamily, title: string): boolean {
  if (family === "au") return (AU_ARC_TITLES as readonly string[]).includes(title);
  return (MAIN_ARC_TITLES as readonly string[]).includes(title);
}

function patchFromTitle(title: string): Pick<ChapterMeta, "relationship_arc_key" | "relationship_arc_title" | "arc_timeline_order"> {
  const p = ARC_PRESET[title];
  if (!p) {
    return { relationship_arc_title: title, relationship_arc_key: "", arc_timeline_order: null };
  }
  return {
    relationship_arc_title: title,
    relationship_arc_key: p.key,
    arc_timeline_order: p.arc_timeline_order,
  };
}

export function ChapterMetaForm({ meta, onChange }: Props) {
  const titleOptions: readonly string[] = meta.continuity_family === "au" ? AU_ARC_TITLES : MAIN_ARC_TITLES;
  const titleValue = isTitleValid(meta.continuity_family, meta.relationship_arc_title)
    ? meta.relationship_arc_title
    : firstTitleFor(meta.continuity_family);
  const scope0 = meta.scope_membership[0];
  const scopeValue: ScopeOption = scope0 && SCOPE_OPTIONS.includes(scope0) ? scope0 : SCOPE_OPTIONS[0];

  useLayoutEffect(() => {
    if (!isTitleValid(meta.continuity_family, meta.relationship_arc_title)) {
      onChange(patchFromTitle(firstTitleFor(meta.continuity_family)));
    }
  }, [meta.continuity_family, meta.relationship_arc_title, onChange]);

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <Field label="Character ID">
        <input className={inputCls} value={meta.character_id} onChange={(e) => onChange({ character_id: e.target.value })} />
      </Field>
      <Field label="Continuity family">
        <select
          className={selectCls}
          value={meta.continuity_family}
          onChange={(e) => {
            const family = e.target.value as ContinuityFamily;
            const t = isTitleValid(family, meta.relationship_arc_title)
              ? meta.relationship_arc_title
              : firstTitleFor(family);
            onChange({ continuity_family: family, ...patchFromTitle(t) });
          }}
        >
          <option value="main_world">main_world</option>
          <option value="au">au</option>
        </select>
      </Field>
      <Field label="Arc title">
        <select
          className={selectCls}
          value={titleValue}
          onChange={(e) => onChange(patchFromTitle(e.target.value))}
        >
          {titleOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      {meta.continuity_family === "main_world" && (
        <Field label="Arc timeline order">
          <input
            type="number"
            className={inputCls}
            value={meta.arc_timeline_order ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ arc_timeline_order: v === "" ? null : Number(v) });
            }}
          />
        </Field>
      )}
      {meta.continuity_family === "au" && (
        <>
          <Field label="AU world key">
            <input
              className={inputCls}
              value={meta.au_world_key}
              onChange={(e) => onChange({ au_world_key: e.target.value })}
              placeholder="e.g. yishi_world_x"
            />
          </Field>
          <Field label="AU world title">
            <input
              className={inputCls}
              value={meta.au_world_title}
              onChange={(e) => onChange({ au_world_title: e.target.value })}
              placeholder="e.g. 世界线X"
            />
          </Field>
        </>
      )}
      <Field label="Chapter key">
        <input className={inputCls} value={meta.chapter_key} onChange={(e) => onChange({ chapter_key: e.target.value })} />
      </Field>
      <Field label="Chapter name">
        <input className={inputCls} value={meta.chapter_name} onChange={(e) => onChange({ chapter_name: e.target.value })} />
      </Field>
      <Field label="Chapter timeline order">
        <input
          type="number"
          className={inputCls}
          value={meta.chapter_timeline_order}
          onChange={(e) => onChange({ chapter_timeline_order: Number(e.target.value) })}
        />
      </Field>
      <Field label="Chapter type">
        <select
          className={selectCls}
          value={meta.chapter_type}
          onChange={(e) => onChange({ chapter_type: e.target.value as ChapterType })}
        >
          {CHAPTER_TYPES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Episode label">
        <input
          className={inputCls}
          value={meta.episode_label}
          onChange={(e) => onChange({ episode_label: e.target.value })}
          placeholder="1-1"
        />
      </Field>
      <Field label="Episode order">
        <input
          type="number"
          className={inputCls}
          value={meta.episode_order}
          onChange={(e) => onChange({ episode_order: Number(e.target.value) })}
        />
      </Field>
      <Field label="Scope membership">
        <select
          className={selectCls}
          value={scopeValue}
          onChange={(e) => onChange({ scope_membership: [e.target.value as ScopeOption] })}
        >
          {SCOPE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
