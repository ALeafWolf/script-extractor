import sharp from "sharp";

const DEFAULT_MAX_WIDTH = 1600;

export async function preprocessImage(buffer: Buffer): Promise<{ buffer: Buffer; mimeType: string }> {
  const maxWidth = parseInt(process.env.VISION_MAX_IMAGE_WIDTH ?? String(DEFAULT_MAX_WIDTH), 10);

  const processed = await sharp(buffer)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  return { buffer: processed, mimeType: "image/jpeg" };
}
