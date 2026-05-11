-- Tier 2: summary embeddings, audit timestamps, structured facts (+ ivfflat for retrieval)

ALTER TABLE "story_scenes"
  ADD COLUMN IF NOT EXISTS "scene_summary_embedding" vector(1536);
ALTER TABLE "story_scenes"
  ADD COLUMN IF NOT EXISTS "summary_model" text;
ALTER TABLE "story_scenes"
  ADD COLUMN IF NOT EXISTS "summary_generated_at" timestamp with time zone;

ALTER TABLE "story_episodes"
  ADD COLUMN IF NOT EXISTS "summary_embedding" vector(1536);
ALTER TABLE "story_episodes"
  ADD COLUMN IF NOT EXISTS "summary_model" text;
ALTER TABLE "story_episodes"
  ADD COLUMN IF NOT EXISTS "summary_generated_at" timestamp with time zone;

ALTER TABLE "story_chapters"
  ADD COLUMN IF NOT EXISTS "summary_embedding" vector(1536);
ALTER TABLE "story_chapters"
  ADD COLUMN IF NOT EXISTS "summary_model" text;
ALTER TABLE "story_chapters"
  ADD COLUMN IF NOT EXISTS "summary_generated_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "story_facts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" text NOT NULL,
  "chapter_id" uuid NOT NULL REFERENCES "story_chapters" ("id") ON DELETE CASCADE,
  "episode_id" uuid NOT NULL REFERENCES "story_episodes" ("id") ON DELETE CASCADE,
  "scene_id" uuid NOT NULL REFERENCES "story_scenes" ("id") ON DELETE CASCADE,
  "subject" text,
  "predicate" text,
  "object" text,
  "temporal_index" integer,
  "polarity" text,
  "confidence" real,
  "text_form" text NOT NULL,
  "embedding" vector(1536),
  "source_unit_ids" jsonb,
  "metadata" jsonb,
  "manually_edited" boolean DEFAULT false NOT NULL,
  "manually_edited_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "story_facts_scene_id_idx"
  ON "story_facts" USING btree ("scene_id");
CREATE INDEX IF NOT EXISTS "story_facts_chapter_id_idx"
  ON "story_facts" USING btree ("chapter_id");
CREATE INDEX IF NOT EXISTS "story_facts_char_subject_idx"
  ON "story_facts" USING btree ("character_id", "subject");
CREATE INDEX IF NOT EXISTS "story_facts_char_object_idx"
  ON "story_facts" USING btree ("character_id", "object");

CREATE INDEX IF NOT EXISTS "story_scenes_scene_summary_embedding_ivfflat"
  ON "story_scenes" USING ivfflat ("scene_summary_embedding" vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX IF NOT EXISTS "story_episodes_summary_embedding_ivfflat"
  ON "story_episodes" USING ivfflat ("summary_embedding" vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX IF NOT EXISTS "story_chapters_summary_embedding_ivfflat"
  ON "story_chapters" USING ivfflat ("summary_embedding" vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX IF NOT EXISTS "story_facts_embedding_ivfflat"
  ON "story_facts" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);
