# Zuo-Ran Tools

A local Next.js toolset with three features:

- **Extractor (`/`)** — extract structured dialogue and narration blocks from ordered game screenshots, review/edit, and export canon-format Markdown files.
- **Ingestor / Upload (`/ingestor/upload`)** — drag and drop `.md` plot-source files for a two-step Preview → Commit ingest into Postgres.
- **Ingestor / Database (`/ingestor/database`)** — CRUD dashboard for scenes and line units, plus metadata editing for chapters and episodes.

## Quick start (extractor only)

```bash
cd scene-ingestor/script-extractor
npm install
cp .env.example .env.local
# fill in OPENAI_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database setup (ingestor features)

### 1. Install pgvector

pgvector is required. Install it for your Postgres distribution:

- **macOS (Homebrew):** `brew install pgvector`
- **Ubuntu/Debian:** `sudo apt install postgresql-16-pgvector` (adjust version)
- **Windows (EDB installer):** use Stack Builder to install the pgvector extension
- **Docker:** use `pgvector/pgvector:pg16` image

### 2. Create the database

```bash
createdb zuoran-memory
```

### 3. Configure the env

Add to `.env.local`:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/zuoran-memory
```

### 4. Run the migration

```bash
npm run db:migrate
```

This creates all canon tables (`story_facts` included after Tier 2 migrations), enables the `vector` extension, and applies any pending migration files such as `0001_tier2_canon_summaries_facts.sql`.

The ingestor routes are now available. If `DATABASE_URL` is not set, both ingestor pages display a "Database is not configured" panel and all actions are disabled.

### Embedding generation (optional)

Embeddings are generated when `OPENAI_API_KEY` is set. If it's unset, ingest still succeeds and the `embedding` column stays `NULL`. You can populate embeddings later by re-ingesting with the key set (existing manually-edited units are protected).

```bash
# Optional — also controls which model and dimension to use
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

> **Note:** `EMBEDDING_DIMENSIONS` must match the `vector(1536)` column size. If you need a different dimension, regenerate the migration with `npm run db:generate` after updating the schema.

### Drizzle commands

```bash
npm run db:generate   # regenerate SQL migrations from schema.ts
npm run db:migrate    # apply pending migrations to DATABASE_URL
```

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
| `SUMMARY_MODEL` | `gpt-4o-mini` | Chat model for scene/episode/chapter summaries and fact extraction |
| `SUMMARY_MAX_INPUT_CHARS_SCENE` | `24000` | Max characters from scene dialogue/narration in summarizer prompts |
| `SUMMARY_TIMEOUT_MS` | `120000` | Timeout for summary/fact Chat Completions |
| `SKIP_AUTO_SUMMARY` | _(unset)_ | Set to `1` to skip post-ingest summaries and facts (writes still persist) |

### Canon summaries & facts (backfill CLI)

Runs the same enrichment as post-ingest (`postCommitEnrich`), with optional scope and concurrency:

```bash
npm run backfill:summaries -- --scope=character:zhi_ai --limit=50
npm run backfill:summaries -- --levels=facts --missing-only=false --force
```

Optional dashboard triggers:

- `POST /api/ingestor/scenes/[id]/regenerate-summary` — JSON body `{ "force"?: boolean, "skipFacts"?: boolean }`
- `POST /api/ingestor/episodes/[id]/regenerate-summary` — `{ "force"?: boolean }`
- `POST /api/ingestor/chapters/[id]/regenerate-summary` — `{ "force"?: boolean }`

## Output Format

Exported Markdown matches the canon format:

```markdown
---
character_id: zuo_ran
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
