"use client";

import { useRef, useCallback } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ImageItem } from "@/lib/types";

interface Props {
  onAddImages: (items: ImageItem[]) => void;
}

function fileToImageItem(file: File): ImageItem {
  return {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    previewUrl: URL.createObjectURL(file),
    status: "pending",
  };
}

export function ImageUploader({ onAddImages }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const items = Array.from(files)
        .filter((f) => f.type.startsWith("image/"))
        .map(fileToImageItem);
      if (items.length) onAddImages(items);
    },
    [onAddImages]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-600",
        "bg-zinc-900 p-10 text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-300 cursor-pointer"
      )}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
    >
      <UploadCloud className="h-10 w-10" />
      <p className="text-sm font-medium">Drag & drop screenshots here, or click to browse</p>
      <p className="text-xs text-zinc-500">PNG, JPG, WEBP supported</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
