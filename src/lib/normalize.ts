import type { ScriptBlock } from "./types";

function normalizeEllipsis(text: string): string {
  // Collapse various ellipsis forms into unified ......
  return text
    .replace(/…{1,}/g, "……")
    .replace(/\.{3,}/g, "……");
}

function normalizeSpeaker(speaker: string | null): string | null {
  if (speaker === null) return null;
  const trimmed = speaker.trim();
  if (trimmed === "我") return "<user>";
  return trimmed;
}

function normalizeText(text: string): string {
  return normalizeEllipsis(text.trim());
}

export function normalizeBlock(block: ScriptBlock): ScriptBlock {
  return {
    ...block,
    speaker: normalizeSpeaker(block.speaker),
    text: normalizeText(block.text),
  };
}

export function normalizeBlocks(blocks: ScriptBlock[]): ScriptBlock[] {
  return blocks.map(normalizeBlock);
}

/** Strips whitespace and punctuation for fuzzy comparison. */
export function textForCompare(text: string): string {
  return text
    .replace(/\s+/g, "")
    .replace(/[，。！？、""''【】《》「」…\.\,\!\?'"]/g, "")
    .toLowerCase();
}
