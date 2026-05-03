import OpenAI from "openai";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }
  return client;
}

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = parseInt(
  process.env.EMBEDDING_DIMENSIONS ?? "1536",
  10,
);

/**
 * Batch-embed texts. Returns null arrays for failed batches.
 * Errors are logged but do not propagate — caller treats failures as skipped.
 */
export async function batchEmbed(
  texts: string[],
): Promise<(number[] | null)[]> {
  if (!process.env.OPENAI_API_KEY || texts.length === 0) {
    return texts.map(() => null);
  }

  // OpenAI supports up to 2048 inputs per request; chunk to be safe
  const BATCH_SIZE = 100;
  const results: (number[] | null)[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE);
    try {
      const response = await getClient().embeddings.create({
        model: EMBEDDING_MODEL,
        input: chunk,
        dimensions: EMBEDDING_DIMENSIONS,
      });
      for (const item of response.data) {
        results.push(item.embedding);
      }
    } catch (err) {
      console.error(`[embedClient] Batch embedding failed:`, err);
      for (let j = 0; j < chunk.length; j++) results.push(null);
    }
  }

  return results;
}
