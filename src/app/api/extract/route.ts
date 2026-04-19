export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { preprocessImage } from "@/lib/imagePreprocess";
import { extractBlocks } from "@/lib/visionClient";
import { normalizeBlocks } from "@/lib/normalize";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get("image");
    const imageId = formData.get("imageId");

    if (!imageFile || typeof imageFile === "string") {
      return NextResponse.json({ error: "Missing image field" }, { status: 400 });
    }

    if (!imageId || typeof imageId !== "string") {
      return NextResponse.json({ error: "Missing imageId field" }, { status: 400 });
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    const { buffer: processedBuffer, mimeType } = await preprocessImage(rawBuffer);
    const rawBlocks = await extractBlocks(processedBuffer, mimeType);
    const blocks = normalizeBlocks(rawBlocks);

    return NextResponse.json({ imageId, blocks });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[extract] error:", message);
    return NextResponse.json({ error: "Extraction failed", detail: message }, { status: 500 });
  }
}
