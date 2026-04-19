import type { ChapterMeta, Scene, ScriptBlock } from "./types";

function renderBlock(block: ScriptBlock): string {
  if (block.type === "narration") {
    return `[narration] ${block.text}`;
  }
  return `[dialogue] ${block.speaker}: ${block.text}`;
}

function renderSceneFrontMatter(scene: Scene): string {
  const lines: string[] = [
    "---",
    `scene_title: ${scene.sceneTitle}`,
    `scene_order: ${scene.sceneOrder}`,
    `timeline_order: ${scene.timelineOrder}`,
  ];
  if (scene.location) lines.push(`location: ${scene.location}`);
  if (scene.timeHint) lines.push(`time_hint: ${scene.timeHint}`);
  lines.push("---");
  return lines.join("\n");
}

function renderChapterFrontMatter(meta: ChapterMeta): string {
  const lines: string[] = [
    "---",
    `character_id: ${meta.character_id}`,
    `source_type: ${meta.source_type}`,
    `relationship_arc: ${meta.relationship_arc}`,
    `relationship_arc_title: ${meta.relationship_arc_title}`,
    `chapter_label: ${meta.chapter_label}`,
    `chapter_index_major: ${meta.chapter_index_major}`,
    `chapter_index_minor: ${meta.chapter_index_minor}`,
    `continuity_family: ${meta.continuity_family}`,
    `segment_type: ${meta.segment_type}`,
    `scope_membership:`,
    ...meta.scope_membership.map((s) => `  - ${s}`),
    "---",
  ];
  return lines.join("\n");
}

export function buildMarkdown(chapter: ChapterMeta, scenes: Scene[]): string {
  const parts: string[] = [renderChapterFrontMatter(chapter)];

  for (const scene of scenes) {
    parts.push(`\n## Scene\n${renderSceneFrontMatter(scene)}`);
    const blockLines = scene.blocks.map(renderBlock).join("\n");
    if (blockLines) parts.push(blockLines);
  }

  return parts.join("\n") + "\n";
}
