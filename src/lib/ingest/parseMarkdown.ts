import matter from "gray-matter";
import { z } from "zod";
import type {
  ParsedCanonFile,
  ParsedChapterFrontmatter,
  ParsedScene,
  ParsedUnit,
} from "./types";

// ---------------------------------------------------------------------------
// Validation schema for chapter frontmatter
// ---------------------------------------------------------------------------

const chapterFrontmatterSchema = z.object({
  character_id: z.string(),
  continuity_family: z.string(),
  relationship_arc_key: z.string(),
  relationship_arc_title: z.string(),
  chapter_key: z.union([z.string(), z.number()]).transform(String),
  chapter_name: z.string(),
  chapter_type: z.string(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSceneFrontmatter(block: string): {
  frontmatter: ParsedScene["frontmatter"];
  body: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const fmMatch = block.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    return { frontmatter: {}, body: block, warnings };
  }

  const body = block.slice(fmMatch[0].length).replace(/^\r?\n/, "");

  // Use gray-matter on an isolated frontmatter block for robust YAML parsing
  const parsed = matter(`---\n${fmMatch[1]}\n---\n`);
  const fm: ParsedScene["frontmatter"] = {};

  for (const [k, v] of Object.entries(parsed.data)) {
    fm[k] = v;
  }

  // Coerce scene_order and timeline_order to numbers when possible
  for (const key of ["scene_order", "timeline_order"] as const) {
    if (fm[key] !== undefined) {
      const n = Number(fm[key]);
      if (!isNaN(n)) fm[key] = n;
    }
  }

  return { frontmatter: fm, body, warnings };
}

function parseUnits(body: string): { units: ParsedUnit[]; warnings: string[] } {
  const units: ParsedUnit[] = [];
  const warnings: string[] = [];
  const lines = body.split(/\r?\n/);

  let groupIndex = 0;
  let prevWasBlank = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      if (!prevWasBlank && units.length > 0) groupIndex++;
      prevWasBlank = true;
      continue;
    }
    prevWasBlank = false;

    // [narration] text
    const narrationMatch = trimmed.match(/^\[narration\]\s+(.+)$/);
    if (narrationMatch) {
      units.push({
        contentType: "narration",
        speaker: null,
        text: narrationMatch[1].trim(),
        groupIndex,
      });
      continue;
    }

    // [dialogue] speaker: text
    const dialogueMatch = trimmed.match(/^\[dialogue\]\s+([^:]+):\s*(.*)$/);
    if (dialogueMatch) {
      units.push({
        contentType: "dialogue",
        speaker: dialogueMatch[1].trim(),
        text: dialogueMatch[2].trim(),
        groupIndex,
      });
      continue;
    }

    // [inner_thought] text
    const innerMatch = trimmed.match(/^\[inner_thought\]\s+(.+)$/);
    if (innerMatch) {
      units.push({
        contentType: "inner_thought",
        speaker: null,
        text: innerMatch[1].trim(),
        groupIndex,
      });
      continue;
    }

    // Unrecognized line — warn but continue
    if (trimmed.length > 0) {
      warnings.push(
        `Line ${i + 1}: unrecognized format — "${trimmed.slice(0, 60)}${trimmed.length > 60 ? "…" : ""}"`,
      );
    }
  }

  return { units, warnings };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseMarkdown(content: string, filename = ""): ParsedCanonFile {
  const warnings: string[] = [];

  // Step 1: peel the chapter-level frontmatter
  const { data: rawData, content: body } = matter(content);

  // Validate required fields
  const validationResult = chapterFrontmatterSchema.safeParse(rawData);
  if (!validationResult.success) {
    const missing = validationResult.error.issues
      .map((i) => i.path.join("."))
      .join(", ");
    throw new Error(
      `Chapter frontmatter missing required fields: ${missing}`,
    );
  }

  const chapter = rawData as ParsedChapterFrontmatter;

  // Normalize chapter_key to string
  chapter.chapter_key = String(chapter.chapter_key);

  // chapter_timeline_order: store "N/A" and similar as null in the int column,
  // preserve original in metadata
  if (
    chapter.chapter_timeline_order !== undefined &&
    isNaN(Number(chapter.chapter_timeline_order))
  ) {
    warnings.push(
      `chapter_timeline_order "${chapter.chapter_timeline_order}" is not numeric; will store NULL and preserve value in metadata.`,
    );
    chapter.metadata = {
      ...(chapter.metadata as Record<string, unknown>),
      chapter_timeline_order_raw: chapter.chapter_timeline_order,
    };
    chapter.chapter_timeline_order = undefined;
  }

  // Synthetic episode: if episode_label is missing, create a _default episode
  if (!chapter.episode_label) {
    chapter.episode_label = "_default";
    chapter.episode_order = 0;
    warnings.push(
      "No episode_label found in frontmatter; synthesized episode '_default' with episode_order=0.",
    );
  }

  // Step 2: split body on `## Scene` headings
  // The `## Scene` marker may appear with or without trailing whitespace
  const sceneBlocks = body.split(/^## Scene\s*$/m).filter((b) => b.trim().length > 0);

  if (sceneBlocks.length === 0) {
    warnings.push("No '## Scene' blocks found in the file.");
  }

  const scenes: ParsedScene[] = [];

  for (let i = 0; i < sceneBlocks.length; i++) {
    const block = sceneBlocks[i].replace(/^\r?\n/, "");

    const { frontmatter, body: sceneBody, warnings: fmWarns } = parseSceneFrontmatter(block);
    warnings.push(...fmWarns.map((w) => `Scene ${i + 1}: ${w}`));

    // scene_order falls back to positional index if missing
    if (frontmatter.scene_order === undefined) {
      frontmatter.scene_order = i + 1;
    }

    const { units, warnings: unitWarns } = parseUnits(sceneBody);
    warnings.push(...unitWarns.map((w) => `Scene ${i + 1}: ${w}`));

    scenes.push({ frontmatter, units });
  }

  return {
    filename,
    chapter,
    scenes,
    rawMetadata: rawData,
    warnings,
  };
}
