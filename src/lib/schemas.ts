import { z } from "zod";

export const ScriptBlockSchema = z
  .object({
    type: z.enum(["dialogue", "narration"]),
    speaker: z.string().nullable(),
    text: z.string().min(1, "text must not be empty"),
  })
  .refine(
    (b) => {
      if (b.type === "narration") return b.speaker === null;
      return true;
    },
    { message: "narration blocks must have speaker = null" }
  )
  .refine(
    (b) => {
      if (b.type === "dialogue") return b.speaker !== null && b.speaker.trim().length > 0;
      return true;
    },
    { message: "dialogue blocks must have a non-empty speaker" }
  );

export const VisionResponseSchema = z.object({
  blocks: z.array(ScriptBlockSchema),
});

export type VisionResponse = z.infer<typeof VisionResponseSchema>;
