export type BlockType = "dialogue" | "narration";

export type ScriptBlock = {
  id: string;
  type: BlockType;
  speaker: string | null;
  text: string;
};

export type ExtractionStatus = "pending" | "extracting" | "done" | "error";

export type ImageItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: ExtractionStatus;
  errorMessage?: string;
};

export type ImageExtractionResult = {
  imageId: string;
  blocks: ScriptBlock[];
};

export type Scene = {
  id: string;
  sceneTitle: string;
  sceneOrder: number;
  timelineOrder: number;
  location?: string;
  timeHint?: string;
  blocks: ScriptBlock[];
};

export type ChapterMeta = {
  character_id: string;
  source_type: string;
  relationship_arc: string;
  relationship_arc_title: string;
  chapter_label: string;
  chapter_index_major: number;
  chapter_index_minor: number;
  continuity_family: string;
  segment_type: string;
  scope_membership: string[];
};

export type DedupeRecord = {
  imageIndex: number;
  removedBlockIds: string[];
};
