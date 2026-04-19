"use client";

import { useState } from "react";
import { Trash2, MergeIcon, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { BlockType, ScriptBlock } from "@/lib/types";

interface BlockRowProps {
  block: ScriptBlock;
  imageId: string;
  onUpdate: (patch: Partial<ScriptBlock>) => void;
  onDelete: () => void;
  onMergeWithNext: () => void;
  onAddAfter: () => void;
  isLast: boolean;
}

function BlockRow({ block, onUpdate, onDelete, onMergeWithNext, onAddAfter, isLast }: BlockRowProps) {
  const typeColor = block.type === "dialogue" ? "bg-blue-900/40 border-blue-700" : "bg-amber-900/30 border-amber-700";

  return (
    <div className={cn("rounded-lg border p-3 flex flex-col gap-2", typeColor)}>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={block.type}
          onChange={(e) => {
            const t = e.target.value as BlockType;
            onUpdate({ type: t, speaker: t === "narration" ? null : (block.speaker ?? "") });
          }}
          className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 border border-zinc-600 focus:outline-none"
        >
          <option value="dialogue">dialogue</option>
          <option value="narration">narration</option>
        </select>

        {block.type === "dialogue" && (
          <input
            value={block.speaker ?? ""}
            onChange={(e) => onUpdate({ speaker: e.target.value })}
            placeholder="Speaker"
            className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 border border-zinc-600 focus:outline-none w-28"
          />
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            title="Add block after"
            onClick={onAddAfter}
            className="rounded p-1 text-zinc-500 hover:text-green-400 hover:bg-zinc-700 transition"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {!isLast && (
            <button
              title="Merge with next block"
              onClick={onMergeWithNext}
              className="rounded p-1 text-zinc-500 hover:text-blue-400 hover:bg-zinc-700 transition"
            >
              <MergeIcon className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            title="Delete block"
            onClick={onDelete}
            className="rounded p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <textarea
        value={block.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
        rows={2}
        className="w-full rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-200 border border-zinc-600 focus:outline-none resize-none"
      />
    </div>
  );
}

interface Props {
  imageId: string;
  imageUrl: string;
  blocks: ScriptBlock[];
  onUpdateBlock: (blockId: string, patch: Partial<ScriptBlock>) => void;
  onDeleteBlock: (blockId: string) => void;
  onMergeBlock: (blockId: string) => void;
  onAddBlock: (afterBlockId: string | null) => void;
  onAddToScene: (block: ScriptBlock, sceneId?: string) => void;
  sceneOptions: { id: string; title: string }[];
}

export function ExtractionPanel({
  imageId,
  imageUrl,
  blocks,
  onUpdateBlock,
  onDeleteBlock,
  onMergeBlock,
  onAddBlock,
  onAddToScene,
  sceneOptions,
}: Props) {
  const [imageExpanded, setImageExpanded] = useState(true);
  const [selectedScene, setSelectedScene] = useState<string>("");

  return (
    <div className="flex gap-4 h-full">
      {/* Left: original image */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-2">
        <button
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 transition"
          onClick={() => setImageExpanded((v) => !v)}
        >
          {imageExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Original image
        </button>
        {imageExpanded && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt="" className="rounded-lg border border-zinc-700 w-full object-contain" />
        )}
      </div>

      {/* Right: blocks */}
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-300">{blocks.length} block{blocks.length !== 1 ? "s" : ""}</p>
          <button
            onClick={() => onAddBlock(null)}
            className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition"
          >
            <Plus className="h-3.5 w-3.5" /> Add block
          </button>
        </div>

        {blocks.length === 0 && (
          <p className="text-sm text-zinc-500 italic">No blocks extracted. Click "Add block" to add manually.</p>
        )}

        {blocks.map((block, idx) => (
          <div key={block.id} className="flex flex-col gap-1">
            <BlockRow
              block={block}
              imageId={imageId}
              onUpdate={(patch) => onUpdateBlock(block.id, patch)}
              onDelete={() => onDeleteBlock(block.id)}
              onMergeWithNext={() => onMergeBlock(block.id)}
              onAddAfter={() => onAddBlock(block.id)}
              isLast={idx === blocks.length - 1}
            />

            {/* Send to scene */}
            {sceneOptions.length > 0 && (
              <div className="flex items-center gap-2 pl-1">
                <select
                  value={selectedScene}
                  onChange={(e) => setSelectedScene(e.target.value)}
                  className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 border border-zinc-700 focus:outline-none"
                >
                  <option value="">Select scene…</option>
                  {sceneOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
                <button
                  disabled={!selectedScene}
                  onClick={() => onAddToScene(block, selectedScene || undefined)}
                  className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  → Add to scene
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
