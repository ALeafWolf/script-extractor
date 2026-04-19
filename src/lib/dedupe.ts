import type { ScriptBlock } from "./types";
import { textForCompare } from "./normalize";

/** Jaccard similarity on character bigrams. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  function bigrams(s: string): Set<string> {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  }

  const sa = bigrams(a);
  const sb = bigrams(b);
  let intersection = 0;
  sa.forEach((g) => { if (sb.has(g)) intersection++; });
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function blocksMatch(a: ScriptBlock, b: ScriptBlock, threshold: number): boolean {
  if (a.type !== b.type) return false;
  const ca = textForCompare(a.text);
  const cb = textForCompare(b.text);
  return similarity(ca, cb) >= threshold;
}

/**
 * Given the blocks from a previous image and the blocks from the next image,
 * find the longest suffix of prevBlocks that matches a prefix of nextBlocks
 * above the similarity threshold, and return nextBlocks with that prefix removed.
 *
 * Returns { dedupedBlocks, removedCount }.
 */
export function removeOverlap(
  prevBlocks: ScriptBlock[],
  nextBlocks: ScriptBlock[],
  windowSize = 5,
  threshold = 0.85
): { dedupedBlocks: ScriptBlock[]; removedCount: number } {
  const prevWindow = prevBlocks.slice(-windowSize);
  const nextWindow = nextBlocks.slice(0, windowSize);

  let matchLen = 0;

  // Find the longest suffix of prevWindow that matches a prefix of nextWindow
  for (let len = Math.min(prevWindow.length, nextWindow.length); len >= 1; len--) {
    const prevSuffix = prevWindow.slice(prevWindow.length - len);
    const nextPrefix = nextWindow.slice(0, len);
    const allMatch = prevSuffix.every((b, i) => blocksMatch(b, nextPrefix[i], threshold));
    if (allMatch) {
      matchLen = len;
      break;
    }
  }

  if (matchLen === 0) {
    return { dedupedBlocks: nextBlocks, removedCount: 0 };
  }

  return {
    dedupedBlocks: nextBlocks.slice(matchLen),
    removedCount: matchLen,
  };
}
