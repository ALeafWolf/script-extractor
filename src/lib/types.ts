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

export type ContinuityFamily = "main_world" | "au";
export type ChapterType = "main_story" | "personal_story" | "side_story";
export type ScopeOption =
  | "main_pre_relationship"
  | "main_situationship"
  | "main_relationship"
  | "main_engaged"
  | "main_married";

export type ChapterMeta = {
  character_id: string;
  continuity_family: ContinuityFamily;
  relationship_arc_key: string;
  relationship_arc_title: string;
  /** Main-world macro order; null for AU. */
  arc_timeline_order: number | null;
  chapter_key: string;
  chapter_name: string;
  chapter_timeline_order: number;
  chapter_type: ChapterType;
  episode_label: string;
  episode_order: number;
  scope_membership: [ScopeOption];
  /** Filled for AU YAML export. */
  au_world_key: string;
  au_world_title: string;
};

export type DedupeRecord = {
  imageIndex: number;
  removedBlockIds: string[];
};
