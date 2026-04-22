# Script Extractor

A local Next.js tool that extracts structured dialogue and narration blocks from ordered game screenshots, lets you review and edit the results, and exports canon-format Markdown files.

## Setup

```bash
cd scene-ingestor/script-extractor
npm install
cp .env.example .env.local
```

Edit `.env.local` and fill in your OpenAI API key:

```bash
OPENAI_API_KEY=sk-...
VISION_MODEL=gpt-4o-mini
```

Then start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. **Chapter Metadata** — Set `character_id`, continuity, arc (title drives `relationship_arc_key`), chapter and episode fields, `chapter_type`, and scope. This becomes the YAML front matter in the exported file.
2. **Images & Extraction** — Drag and drop screenshots in order. Reorder thumbnails by dragging. Click "Extract all" to send each image to the vision model. After extraction, click a thumbnail to review and edit its blocks (type, speaker, text). Use "Run dedupe" to remove overlapping lines between adjacent screenshots (with undo support).
3. **Scene Composer** — Add scenes and use "Add to scene" from each block to assign it. Drag scenes or blocks to reorder. Fill in `scene_title`, `location`, `time_hint`, etc.
4. **Markdown Export** — Copy or download the assembled `.md` file, which matches the canon format used in `plot-sources/`.

## Switching the Vision Model

Change `VISION_MODEL` in `.env.local` to any OpenAI-compatible vision model:

```bash
# Use GPT-4o instead
VISION_MODEL=gpt-4o

# Use a custom OpenAI-compatible API
OPENAI_BASE_URL=https://your-proxy.example.com/v1
VISION_MODEL=your-model-name
```

Restart `npm run dev` after changing env variables.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | (required) | Your OpenAI API key |
| `VISION_MODEL` | `gpt-4o-mini` | Vision-capable model name |
| `OPENAI_BASE_URL` | (OpenAI default) | Optional API base URL for proxies |
| `VISION_MAX_IMAGE_WIDTH` | `1600` | Max pixel width before resizing |

## Output Format

Exported Markdown matches the canon format:

```markdown
---
character_id: zou_ran
continuity_family: main_world
relationship_arc_key: main_yimu
relationship_arc_title: 旖慕篇
arc_timeline_order: 2
chapter_key: yimu_ch01
chapter_name: 旖慕篇章1
chapter_timeline_order: 1
chapter_type: personal_story
episode_label: 1-1
episode_order: 1
scope_membership:
  - main_situationship
---

## Scene
---
scene_title: ...
scene_order: 1
timeline_order: 1010
location: 商场
time_hint: 上午
---

[narration] ...
[dialogue] 左然: ...
[dialogue] <user>: ...
```
