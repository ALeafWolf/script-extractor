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

1. **Chapter Metadata** — Fill in `character_id`, `chapter_label`, relationship arc, etc. This becomes the YAML front matter in the exported file.
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
source_type: personal_route
relationship_arc: yi_mu
...
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
