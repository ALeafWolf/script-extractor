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
    `continuity_family: ${meta.continuity_family}`,
    `relationship_arc_key: ${meta.relationship_arc_key}`,
    `relationship_arc_title: ${meta.relationship_arc_title}`,
  ];

  if (meta.continuity_family === "main_world" && meta.arc_timeline_order !== null) {
    lines.push(`arc_timeline_order: ${meta.arc_timeline_order}`);
  }

  lines.push(
    `chapter_key: ${meta.chapter_key}`,
    `chapter_name: ${meta.chapter_name}`,
    `chapter_timeline_order: ${meta.chapter_timeline_order}`,
    `chapter_type: ${meta.chapter_type}`,
    `episode_label: ${meta.episode_label}`,
    `episode_order: ${meta.episode_order}`,
  );

  if (meta.continuity_family === "au") {
    lines.push(`au_world_key: ${meta.au_world_key}`, `au_world_title: ${meta.au_world_title}`);
  }

  lines.push("scope_membership:", ...meta.scope_membership.map((s) => `  - ${s}`), "---");
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
