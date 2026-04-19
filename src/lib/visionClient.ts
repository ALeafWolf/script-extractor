import OpenAI from "openai";
import { VisionResponseSchema } from "./schemas";
import type { ScriptBlock } from "./types";

const EXTRACTION_PROMPT = `Extract all text from this game screenshot.
Identify each block as:
- dialogue (with speaker)
- narration (no speaker)

Return JSON only:
{
  "blocks": [
    {
      "type": "dialogue",
      "speaker": "...",
      "text": "..."
    }
  ]
}

Rules:
- Maintain original order
- Do not merge unrelated lines
- If speaker is 我, keep it as 我 (normalization happens later)
- Narration must have speaker = null
- Do not add explanations
- If the image contains no readable dialogue or narration, return {"blocks": []}`;

function getClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
}

function getModel(): string {
  return process.env.VISION_MODEL ?? "gpt-4o-mini";
}

async function attempt(client: OpenAI, imageBase64: string, mimeType: string): Promise<ScriptBlock[]> {
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const response = await client.chat.completions.create({
    model: getModel(),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACTION_PROMPT },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
    max_tokens: 4096,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  const validated = VisionResponseSchema.parse(parsed);
  return validated.blocks.map((b, i) => ({
    id: `block-${Date.now()}-${i}`,
    type: b.type,
    speaker: b.speaker,
    text: b.text,
  }));
}

export async function extractBlocks(buffer: Buffer, mimeType: string): Promise<ScriptBlock[]> {
  const client = getClient();
  const imageBase64 = buffer.toString("base64");

  try {
    return await attempt(client, imageBase64, mimeType);
  } catch {
    // one retry on failure
    return await attempt(client, imageBase64, mimeType);
  }
}
