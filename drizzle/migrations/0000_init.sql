-- Enable pgvector extension (required)
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- relationship_arcs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "relationship_arcs" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "character_id"          TEXT NOT NULL,
  "arc_key"               TEXT NOT NULL,
  "arc_title"             TEXT NOT NULL,
  "continuity_family"     TEXT NOT NULL,
  "arc_timeline_order"    INTEGER,
  "scope_membership"      JSONB,
  "metadata"              JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS "relationship_arcs_char_arc_key"
  ON "relationship_arcs" ("character_id", "arc_key");

-- ---------------------------------------------------------------------------
-- au_worlds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "au_worlds" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "character_id"          TEXT NOT NULL,
  "relationship_arc_id"   UUID NOT NULL REFERENCES "relationship_arcs"("id") ON DELETE CASCADE,
  "au_world_key"          TEXT NOT NULL,
  "au_world_title"        TEXT,
  "world_order"           INTEGER,
  "persona_overlay_id"    TEXT,
  "scope_membership"      JSONB,
  "metadata"              JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS "au_worlds_char_arc_world_key"
  ON "au_worlds" ("character_id", "relationship_arc_id", "au_world_key");

-- ---------------------------------------------------------------------------
-- story_chapters
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "story_chapters" (
  "id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "character_id"             TEXT NOT NULL,
  "relationship_arc_id"      UUID NOT NULL REFERENCES "relationship_arcs"("id") ON DELETE CASCADE,
  "au_world_id"              UUID REFERENCES "au_worlds"("id") ON DELETE CASCADE,
  "chapter_key"              TEXT NOT NULL,
  "chapter_name"             TEXT NOT NULL,
  "chapter_label"            TEXT,
  "chapter_timeline_order"   INTEGER,
  "chapter_type"             TEXT NOT NULL,
  "inheritance_order"        INTEGER,
  "scope_membership"         JSONB,
  "summary"                  TEXT,
  "metadata"                 JSONB,
  "manually_edited"          BOOLEAN NOT NULL DEFAULT FALSE,
  "manually_edited_at"       TIMESTAMPTZ
);

-- Partial unique index: main-world chapters
CREATE UNIQUE INDEX IF NOT EXISTS "story_chapters_main_world_key"
  ON "story_chapters" ("character_id", "relationship_arc_id", "chapter_key")
  WHERE "au_world_id" IS NULL;

-- Partial unique index: AU chapters
CREATE UNIQUE INDEX IF NOT EXISTS "story_chapters_au_key"
  ON "story_chapters" ("character_id", "relationship_arc_id", "au_world_id", "chapter_key")
  WHERE "au_world_id" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- story_episodes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "story_episodes" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "character_id"     TEXT NOT NULL,
  "chapter_id"       UUID NOT NULL REFERENCES "story_chapters"("id") ON DELETE CASCADE,
  "episode_label"    TEXT NOT NULL,
  "episode_order"    INTEGER NOT NULL,
  "episode_title"    TEXT,
  "summary"          TEXT,
  "metadata"         JSONB,
  "manually_edited"  BOOLEAN NOT NULL DEFAULT FALSE,
  "manually_edited_at" TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS "story_episodes_chapter_label"
  ON "story_episodes" ("chapter_id", "episode_label");

CREATE INDEX IF NOT EXISTS "story_episodes_chapter_id_idx"
  ON "story_episodes" ("chapter_id");

-- ---------------------------------------------------------------------------
-- story_scenes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "story_scenes" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "character_id"     TEXT NOT NULL,
  "chapter_id"       UUID NOT NULL REFERENCES "story_chapters"("id") ON DELETE CASCADE,
  "episode_id"       UUID NOT NULL REFERENCES "story_episodes"("id") ON DELETE CASCADE,
  "scene_title"      TEXT,
  "scene_order"      INTEGER NOT NULL,
  "timeline_order"   INTEGER,
  "location"         TEXT,
  "time_hint"        TEXT,
  "scene_summary"    TEXT,
  "emotion_tags"     JSONB,
  "metadata"         JSONB,
  "manually_edited"  BOOLEAN NOT NULL DEFAULT FALSE,
  "manually_edited_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "story_scenes_episode_id_idx"
  ON "story_scenes" ("episode_id");

CREATE INDEX IF NOT EXISTS "story_scenes_chapter_id_idx"
  ON "story_scenes" ("chapter_id");

-- ---------------------------------------------------------------------------
-- story_units
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "story_units" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "character_id"     TEXT NOT NULL,
  "chapter_id"       UUID NOT NULL REFERENCES "story_chapters"("id") ON DELETE CASCADE,
  "episode_id"       UUID NOT NULL REFERENCES "story_episodes"("id") ON DELETE CASCADE,
  "scene_id"         UUID NOT NULL REFERENCES "story_scenes"("id") ON DELETE CASCADE,
  "content_type"     TEXT NOT NULL,
  "unit_index"       INTEGER NOT NULL,
  "speaker"          TEXT,
  "canon_priority"   REAL,
  "emotion_tags"     JSONB,
  "raw_text"         TEXT,
  "text_content"     TEXT NOT NULL,
  "embedding"        vector(1536),
  "metadata"         JSONB,
  "manually_edited"  BOOLEAN NOT NULL DEFAULT FALSE,
  "manually_edited_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "story_units_scene_id_idx"
  ON "story_units" ("scene_id");

CREATE INDEX IF NOT EXISTS "story_units_episode_id_idx"
  ON "story_units" ("episode_id");

CREATE INDEX IF NOT EXISTS "story_units_chapter_id_idx"
  ON "story_units" ("chapter_id");
