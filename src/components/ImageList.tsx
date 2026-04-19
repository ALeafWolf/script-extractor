"use client";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, RefreshCw, CheckCircle2, AlertCircle, Loader2, GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ImageItem } from "@/lib/types";

interface ItemProps {
  item: ImageItem;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onReExtract: () => void;
}

function SortableItem({ item, selected, onSelect, onRemove, onReExtract }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const statusIcon = {
    pending: null,
    extracting: <Loader2 className="h-4 w-4 animate-spin text-blue-400" />,
    done: <CheckCircle2 className="h-4 w-4 text-green-400" />,
    error: <AlertCircle className="h-4 w-4 text-red-400" />,
  }[item.status];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex-shrink-0 w-32 rounded-lg border-2 overflow-hidden cursor-pointer transition",
        selected ? "border-blue-500" : "border-zinc-700 hover:border-zinc-500"
      )}
      onClick={onSelect}
    >
      {/* drag handle */}
      <div
        className="absolute top-1 left-1 z-10 text-zinc-400 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* remove button */}
      <button
        className="absolute top-1 right-1 z-10 rounded bg-zinc-800/80 p-0.5 text-zinc-400 hover:text-red-400 transition"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* thumbnail */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.previewUrl} alt="" className="h-24 w-full object-cover" />

      {/* status bar */}
      <div className="flex items-center justify-between gap-1 bg-zinc-900 px-1.5 py-1">
        <span className="truncate text-xs text-zinc-400 max-w-[70px]">{item.file.name}</span>
        <div className="flex items-center gap-1">
          {statusIcon}
          {(item.status === "done" || item.status === "error") && (
            <button
              className="text-zinc-500 hover:text-zinc-200 transition"
              title="Re-extract"
              onClick={(e) => { e.stopPropagation(); onReExtract(); }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {item.status === "error" && item.errorMessage && (
        <div className="absolute inset-0 bg-red-950/70 flex items-center justify-center p-2">
          <p className="text-xs text-red-300 text-center">{item.errorMessage}</p>
        </div>
      )}
    </div>
  );
}

interface Props {
  images: ImageItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onReExtract: (id: string) => void;
}

export function ImageList({ images, selectedId, onSelect, onRemove, onReorder, onReExtract }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = images.findIndex((i) => i.id === active.id);
      const newIndex = images.findIndex((i) => i.id === over.id);
      onReorder(arrayMove(images, oldIndex, newIndex).map((i) => i.id));
    }
  }

  if (images.length === 0) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={images.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {images.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onSelect={() => onSelect(item.id)}
              onRemove={() => onRemove(item.id)}
              onReExtract={() => onReExtract(item.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
