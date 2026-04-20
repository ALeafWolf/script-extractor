import { create } from "zustand";
import type { ChapterMeta, DedupeRecord, ImageItem, Scene, ScriptBlock } from "@/lib/types";
import { removeOverlap } from "@/lib/dedupe";

interface ImageBlocksMap {
  [imageId: string]: ScriptBlock[];
}

interface DedupeState {
  applied: boolean;
  records: DedupeRecord[];
  snapshot: ImageBlocksMap | null; // for undo
}

interface ExtractorState {
  // Chapter metadata
  chapter: ChapterMeta;
  setChapter: (meta: Partial<ChapterMeta>) => void;
  resetChapter: () => void;
  resetImages: () => void;
  resetScenes: () => void;
  resetAll: () => void;

  // Images
  images: ImageItem[];
  addImages: (items: ImageItem[]) => void;
  removeImage: (id: string) => void;
  reorderImages: (orderedIds: string[]) => void;
  setImageStatus: (id: string, status: ImageItem["status"], error?: string) => void;

  // Blocks per image
  imageBlocks: ImageBlocksMap;
  setImageBlocks: (imageId: string, blocks: ScriptBlock[]) => void;
  updateBlock: (imageId: string, blockId: string, patch: Partial<ScriptBlock>) => void;
  deleteBlock: (imageId: string, blockId: string) => void;
  mergeBlocks: (imageId: string, blockId: string) => void; // merge with next block
  addBlock: (imageId: string, afterBlockId: string | null, block: ScriptBlock) => void;

  // Dedupe
  dedupeState: DedupeState;
  runDedupe: () => void;
  undoDedupe: () => void;

  // Scenes
  scenes: Scene[];
  addScene: () => void;
  removeScene: (sceneId: string) => void;
  updateScene: (sceneId: string, patch: Partial<Omit<Scene, "blocks">>) => void;
  addBlockToScene: (sceneId: string, block: ScriptBlock) => void;
  removeBlockFromScene: (sceneId: string, blockId: string) => void;
  reorderSceneBlocks: (sceneId: string, blockIds: string[]) => void;
  reorderScenes: (sceneIds: string[]) => void;
}

const DEFAULT_CHAPTER: ChapterMeta = {
  character_id: "zou_ran",
  source_type: "personal_route",
  relationship_arc: "",
  relationship_arc_title: "",
  chapter_label: "",
  chapter_index_major: 1,
  chapter_index_minor: 1,
  continuity_family: "main_world",
  segment_type: "main_chapter",
  scope_membership: ["main_pre_relationship"],
};

function makeScene(order: number): Scene {
  return {
    id: `scene-${Date.now()}-${order}`,
    sceneTitle: `Scene ${order}`,
    sceneOrder: order,
    timelineOrder: order * 1000,
    location: "",
    timeHint: "",
    blocks: [],
  };
}

export const useExtractorStore = create<ExtractorState>((set, get) => ({
  chapter: DEFAULT_CHAPTER,
  setChapter: (meta) =>
    set((s) => ({ chapter: { ...s.chapter, ...meta } })),

  resetChapter: () => set({ chapter: { ...DEFAULT_CHAPTER } }),

  resetImages: () =>
    set({
      images: [],
      imageBlocks: {},
      dedupeState: { applied: false, records: [], snapshot: null },
    }),

  resetScenes: () => set({ scenes: [] }),

  resetAll: () =>
    set({
      chapter: { ...DEFAULT_CHAPTER },
      images: [],
      imageBlocks: {},
      dedupeState: { applied: false, records: [], snapshot: null },
      scenes: [],
    }),

  images: [],
  addImages: (items) =>
    set((s) => ({ images: [...s.images, ...items] })),
  removeImage: (id) =>
    set((s) => ({
      images: s.images.filter((img) => img.id !== id),
      imageBlocks: Object.fromEntries(
        Object.entries(s.imageBlocks).filter(([k]) => k !== id)
      ),
    })),
  reorderImages: (orderedIds) =>
    set((s) => ({
      images: orderedIds
        .map((id) => s.images.find((img) => img.id === id))
        .filter(Boolean) as ImageItem[],
    })),
  setImageStatus: (id, status, error) =>
    set((s) => ({
      images: s.images.map((img) =>
        img.id === id ? { ...img, status, errorMessage: error } : img
      ),
    })),

  imageBlocks: {},
  setImageBlocks: (imageId, blocks) =>
    set((s) => ({ imageBlocks: { ...s.imageBlocks, [imageId]: blocks } })),
  updateBlock: (imageId, blockId, patch) =>
    set((s) => ({
      imageBlocks: {
        ...s.imageBlocks,
        [imageId]: (s.imageBlocks[imageId] ?? []).map((b) =>
          b.id === blockId ? { ...b, ...patch } : b
        ),
      },
    })),
  deleteBlock: (imageId, blockId) =>
    set((s) => ({
      imageBlocks: {
        ...s.imageBlocks,
        [imageId]: (s.imageBlocks[imageId] ?? []).filter((b) => b.id !== blockId),
      },
    })),
  mergeBlocks: (imageId, blockId) =>
    set((s) => {
      const blocks = s.imageBlocks[imageId] ?? [];
      const idx = blocks.findIndex((b) => b.id === blockId);
      if (idx === -1 || idx === blocks.length - 1) return {};
      const merged: ScriptBlock = {
        ...blocks[idx],
        text: `${blocks[idx].text} ${blocks[idx + 1].text}`,
      };
      const next = [...blocks.slice(0, idx), merged, ...blocks.slice(idx + 2)];
      return { imageBlocks: { ...s.imageBlocks, [imageId]: next } };
    }),
  addBlock: (imageId, afterBlockId, block) =>
    set((s) => {
      const blocks = s.imageBlocks[imageId] ?? [];
      if (afterBlockId === null) {
        return { imageBlocks: { ...s.imageBlocks, [imageId]: [...blocks, block] } };
      }
      const idx = blocks.findIndex((b) => b.id === afterBlockId);
      const next = [...blocks.slice(0, idx + 1), block, ...blocks.slice(idx + 1)];
      return { imageBlocks: { ...s.imageBlocks, [imageId]: next } };
    }),

  dedupeState: { applied: false, records: [], snapshot: null },
  runDedupe: () => {
    const { images, imageBlocks } = get();
    const snapshot = { ...imageBlocks };
    const newBlocks = { ...imageBlocks };
    const records: DedupeRecord[] = [];

    for (let i = 0; i < images.length - 1; i++) {
      const prevId = images[i].id;
      const nextId = images[i + 1].id;
      const prev = newBlocks[prevId] ?? [];
      const next = newBlocks[nextId] ?? [];
      const { dedupedBlocks, removedCount } = removeOverlap(prev, next);
      if (removedCount > 0) {
        const removedIds = next.slice(0, removedCount).map((b) => b.id);
        newBlocks[nextId] = dedupedBlocks;
        records.push({ imageIndex: i + 1, removedBlockIds: removedIds });
      }
    }

    set({
      imageBlocks: newBlocks,
      dedupeState: { applied: true, records, snapshot },
    });
  },
  undoDedupe: () => {
    const { dedupeState } = get();
    if (!dedupeState.snapshot) return;
    set({
      imageBlocks: dedupeState.snapshot,
      dedupeState: { applied: false, records: [], snapshot: null },
    });
  },

  scenes: [],
  addScene: () =>
    set((s) => ({
      scenes: [...s.scenes, makeScene(s.scenes.length + 1)],
    })),
  removeScene: (sceneId) =>
    set((s) => ({ scenes: s.scenes.filter((sc) => sc.id !== sceneId) })),
  updateScene: (sceneId, patch) =>
    set((s) => ({
      scenes: s.scenes.map((sc) =>
        sc.id === sceneId ? { ...sc, ...patch } : sc
      ),
    })),
  addBlockToScene: (sceneId, block) =>
    set((s) => ({
      scenes: s.scenes.map((sc) =>
        sc.id === sceneId ? { ...sc, blocks: [...sc.blocks, block] } : sc
      ),
    })),
  removeBlockFromScene: (sceneId, blockId) =>
    set((s) => ({
      scenes: s.scenes.map((sc) =>
        sc.id === sceneId
          ? { ...sc, blocks: sc.blocks.filter((b) => b.id !== blockId) }
          : sc
      ),
    })),
  reorderSceneBlocks: (sceneId, blockIds) =>
    set((s) => ({
      scenes: s.scenes.map((sc) => {
        if (sc.id !== sceneId) return sc;
        const ordered = blockIds
          .map((id) => sc.blocks.find((b) => b.id === id))
          .filter(Boolean) as ScriptBlock[];
        return { ...sc, blocks: ordered };
      }),
    })),
  reorderScenes: (sceneIds) =>
    set((s) => ({
      scenes: sceneIds
        .map((id) => s.scenes.find((sc) => sc.id === id))
        .filter(Boolean) as Scene[],
    })),
}));
