// ---------------------------------------------------------------------------
// Parsed shapes from the markdown parser
// ---------------------------------------------------------------------------

export interface ParsedUnit {
  contentType: "narration" | "dialogue" | "inner_thought";
  speaker: string | null;
  text: string;
  /** Blank-line group index within the scene; 0-based. */
  groupIndex: number;
}

export interface ParsedScene {
  frontmatter: {
    scene_title?: string;
    scene_order?: number;
    timeline_order?: number;
    location?: string;
    time_hint?: string;
    [key: string]: unknown;
  };
  units: ParsedUnit[];
}

export interface ParsedChapterFrontmatter {
  character_id: string;
  continuity_family: "main_world" | "au" | string;
  relationship_arc_key: string;
  relationship_arc_title: string;
  arc_timeline_order?: number;
  au_world_key?: string;
  au_world_title?: string;
  chapter_key: string;
  chapter_name: string;
  chapter_label?: string;
  chapter_timeline_order?: number | string;
  chapter_type: string;
  inheritance_order?: number;
  scope_membership?: string[];
  episode_label?: string;
  episode_order?: number;
  episode_title?: string;
  [key: string]: unknown;
}

export interface ParsedCanonFile {
  filename: string;
  chapter: ParsedChapterFrontmatter;
  scenes: ParsedScene[];
  rawMetadata: Record<string, unknown>;
  /** Non-fatal warnings from the parser. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Ingest service types
// ---------------------------------------------------------------------------

export type IngestMode = "replace" | "skip" | "replace-force";

/** Passed to post-commit enrichment after a successful ingest transaction. */
export interface PostCommitIngestPayload {
  characterId: string;
  chapterId: string;
  episodeId: string;
  chapterName: string;
  episodeTitle: string | null;
  scenes: Array<{
    sceneId: string;
    sceneTitle: string | null;
    location: string | null;
    timeHint: string | null;
    units: Array<{
      id: string;
      contentType: string;
      speaker: string | null;
      text: string;
      unitIndex: number;
    }>;
  }>;
}

export interface IngestConflict {
  existingEpisodeId?: string;
  existingSceneCount: number;
  manuallyEditedUnitCount: number;
  preservedSceneIds: string[];
}

export interface IngestResult {
  file: string;
  chapter: {
    arc_key: string;
    chapter_key: string;
    episode_label: string;
  };
  scenesInserted: number;
  unitsInserted: number;
  embeddingsGenerated: number;
  conflicts: IngestConflict;
  warnings: string[];
  summariesGenerated?: { scenes: number; episodes: number; chapters: number };
  factsGenerated?: number;
  /** True when dryRun=true; no DB writes were performed. */
  dryRun?: boolean;
}

export interface IngestOptions {
  mode?: IngestMode;
  dryRun?: boolean;
}
