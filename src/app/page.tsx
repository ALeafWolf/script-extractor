"use client";

import { useState, useCallback } from "react";
import { Zap, RotateCcw, ChevronDown, ChevronUp, Shuffle } from "lucide-react";
import { ImageUploader } from "@/components/ImageUploader";
import { ImageList } from "@/components/ImageList";
import { ExtractionPanel } from "@/components/ExtractionPanel";
import { ChapterMetaForm } from "@/components/ChapterMetaForm";
import { SceneComposer } from "@/components/SceneComposer";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { useExtractorStore } from "@/store/useExtractorStore";
import { buildMarkdown } from "@/lib/buildMarkdown";
import type { ImageItem, ScriptBlock } from "@/lib/types";
import { cn } from "@/lib/cn";

function Section({
  title,
  children,
  badge,
  onReset,
  resetConfirmMessage,
}: {
  title: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
  onReset?: () => void;
  resetConfirmMessage?: string;
}) {
  const [open, setOpen] = useState(true);
  const msg =
    resetConfirmMessage ??
    `Reset "${title}"? This cannot be undone.`;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="flex w-full items-center gap-2 px-5 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center justify-between text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-semibold text-zinc-200">{title}</span>
            {badge}
          </div>
          {open ? <ChevronUp className="h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />}
        </button>
        {onReset && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (typeof window !== "undefined" && window.confirm(msg)) onReset();
            }}
            className="shrink-0 rounded-lg border border-zinc-600 px-2.5 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          >
            Reset
          </button>
        )}
      </div>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{children}</span>
  );
}

async function extractImage(imageId: string, file: File): Promise<ScriptBlock[]> {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("imageId", imageId);
  const res = await fetch("/api/extract", { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.detail || err.error || "Extraction failed");
  }
  const data = await res.json();
  return data.blocks as ScriptBlock[];
}

export default function Home() {
  const {
    chapter, setChapter,
    resetChapter, resetImages, resetScenes, resetAll,
    images, addImages, removeImage, reorderImages, setImageStatus,
    imageBlocks, setImageBlocks, updateBlock, deleteBlock, mergeBlocks, addBlock,
    dedupeState, runDedupe, undoDedupe,
    scenes, addScene, removeScene, updateScene,
    addBlockToScene, removeBlockFromScene, reorderSceneBlocks, reorderScenes,
  } = useExtractorStore();

  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [chapterFormKey, setChapterFormKey] = useState(0);

  const handleAddImages = useCallback(
    (items: ImageItem[]) => {
      addImages(items);
      if (!selectedImageId && items.length > 0) setSelectedImageId(items[0].id);
    },
    [addImages, selectedImageId]
  );

  async function extractOne(imageId: string, file: File) {
    setImageStatus(imageId, "extracting");
    try {
      const blocks = await extractImage(imageId, file);
      setImageBlocks(imageId, blocks);
      setImageStatus(imageId, "done");
    } catch (e) {
      setImageStatus(imageId, "error", e instanceof Error ? e.message : String(e));
    }
  }

  async function extractAll() {
    for (const img of images) {
      if (img.status === "pending" || img.status === "error") {
        await extractOne(img.id, img.file);
      }
    }
  }

  const selectedImage = images.find((img) => img.id === selectedImageId) ?? null;
  const selectedBlocks = selectedImageId ? (imageBlocks[selectedImageId] ?? []) : [];

  function handleAddBlock(afterBlockId: string | null) {
    if (!selectedImageId) return;
    const newBlock: ScriptBlock = {
      id: `block-${Date.now()}-manual`,
      type: "dialogue",
      speaker: "",
      text: "",
    };
    addBlock(selectedImageId, afterBlockId, newBlock);
  }

  function handleAddToScene(block: ScriptBlock, sceneId?: string) {
    if (!sceneId) return;
    addBlockToScene(sceneId, { ...block, id: `${block.id}-scene-${Date.now()}` });
  }

  const markdown = buildMarkdown(chapter, scenes);
  const fileStem = chapter.episode_label || chapter.chapter_key || "untitled";
  const filename = `${chapter.character_id || "script"}-${fileStem}.md`;

  const pendingCount = images.filter((i) => i.status === "pending" || i.status === "error").length;
  const doneCount = images.filter((i) => i.status === "done").length;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Script Extractor</h1>
            <p className="text-sm text-zinc-400 mt-1">Extract dialogue & narration from game screenshots → canon Markdown</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.confirm("Reset all content? This cannot be undone.")) {
                  resetAll();
                  setSelectedImageId(null);
                  setChapterFormKey((k) => k + 1);
                }
              }}
              className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-950/70"
            >
              Reset all
            </button>
            <div className="text-xs text-zinc-500">
              Model: <span className="font-mono text-zinc-300">{process.env.NEXT_PUBLIC_VISION_MODEL ?? "gpt-4o-mini"}</span>
            </div>
          </div>
        </div>

        {/* 1. Chapter Metadata */}
        <Section
          title="Chapter Metadata"
          onReset={() => {
            resetChapter();
            setChapterFormKey((k) => k + 1);
          }}
          resetConfirmMessage='Reset "Chapter Metadata"? This cannot be undone.'
        >
          <ChapterMetaForm key={chapterFormKey} meta={chapter} onChange={setChapter} />
        </Section>

        {/* 2. Images & Extraction */}
        <Section
          title="Images & Extraction"
          badge={images.length > 0 && <Badge>{doneCount}/{images.length} extracted</Badge>}
          onReset={() => {
            resetImages();
            setSelectedImageId(null);
          }}
          resetConfirmMessage='Reset "Images & Extraction"? This cannot be undone.'
        >
          <div className="flex flex-col gap-4">
            <ImageUploader onAddImages={handleAddImages} />

            {images.length > 0 && (
              <>
                <ImageList
                  images={images}
                  selectedId={selectedImageId}
                  onSelect={setSelectedImageId}
                  onRemove={removeImage}
                  onReorder={reorderImages}
                  onReExtract={(id) => {
                    const img = images.find((i) => i.id === id);
                    if (img) extractOne(id, img.file);
                  }}
                />

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={extractAll}
                    disabled={pendingCount === 0}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
                      pendingCount > 0
                        ? "bg-blue-700 text-white hover:bg-blue-600"
                        : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    )}
                  >
                    <Zap className="h-4 w-4" />
                    Extract all ({pendingCount} pending)
                  </button>

                  {dedupeState.applied ? (
                    <button
                      onClick={undoDedupe}
                      className="flex items-center gap-2 rounded-lg bg-amber-900/50 border border-amber-700 px-4 py-2 text-sm text-amber-300 hover:bg-amber-900/80 transition"
                    >
                      <RotateCcw className="h-4 w-4" /> Undo dedupe
                    </button>
                  ) : (
                    <button
                      onClick={runDedupe}
                      disabled={doneCount < 2}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition",
                        doneCount >= 2
                          ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-600"
                          : "bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-800"
                      )}
                    >
                      <Shuffle className="h-4 w-4" /> Run dedupe
                    </button>
                  )}

                  {dedupeState.applied && (
                    <span className="text-xs text-amber-400">
                      Removed {dedupeState.records.reduce((sum, r) => sum + r.removedBlockIds.length, 0)} duplicate block(s)
                    </span>
                  )}
                </div>

                {selectedImage && (
                  <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 mt-2">
                    <p className="text-xs text-zinc-500 mb-3 font-medium uppercase tracking-wide">
                      Reviewing: {selectedImage.file.name}
                    </p>
                    <ExtractionPanel
                      imageUrl={selectedImage.previewUrl}
                      blocks={selectedBlocks}
                      onUpdateBlock={(blockId, patch) => updateBlock(selectedImage.id, blockId, patch)}
                      onDeleteBlock={(blockId) => deleteBlock(selectedImage.id, blockId)}
                      onMergeBlock={(blockId) => mergeBlocks(selectedImage.id, blockId)}
                      onAddBlock={handleAddBlock}
                      onAddToScene={handleAddToScene}
                      sceneOptions={scenes.map((s) => ({ id: s.id, title: s.sceneTitle }))}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </Section>

        {/* 3. Scene Composer */}
        <Section
          title="Scene Composer"
          badge={scenes.length > 0 && <Badge>{scenes.length} scene{scenes.length !== 1 ? "s" : ""}</Badge>}
          onReset={resetScenes}
          resetConfirmMessage='Reset "Scene Composer"? This cannot be undone.'
        >
          <SceneComposer
            scenes={scenes}
            onAddScene={addScene}
            onRemoveScene={removeScene}
            onUpdateScene={updateScene}
            onRemoveBlockFromScene={removeBlockFromScene}
            onReorderSceneBlocks={reorderSceneBlocks}
            onReorderScenes={reorderScenes}
          />
        </Section>

        {/* 4. Markdown Export */}
        <Section title="Markdown Export">
          <MarkdownPreview markdown={markdown} filename={filename} />
        </Section>
      </div>
    </main>
  );
}
