"use client";

import { Plus, Trash2, GripVertical, X } from "lucide-react";
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
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Scene, ScriptBlock } from "@/lib/types";
import { cn } from "@/lib/cn";

const inputCls =
  "rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 transition";

interface BlockBadgeProps {
  block: ScriptBlock;
  onRemove: () => void;
}

function BlockBadge({ block, onRemove }: BlockBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border p-2 text-xs",
        block.type === "dialogue"
          ? "border-blue-700 bg-blue-900/30"
          : "border-amber-700 bg-amber-900/20"
      )}
    >
      <div className="flex-1 min-w-0">
        {block.type === "dialogue" && (
          <span className="font-semibold text-blue-300">{block.speaker}: </span>
        )}
        <span className="text-zinc-300 line-clamp-2">{block.text}</span>
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 text-zinc-500 hover:text-red-400 transition"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface SortableSceneProps {
  scene: Scene;
  onUpdate: (patch: Partial<Omit<Scene, "blocks">>) => void;
  onRemove: () => void;
  onRemoveBlock: (blockId: string) => void;
  onReorderBlocks: (blockIds: string[]) => void;
}

function SortableScene({ scene, onUpdate, onRemove, onRemoveBlock, onReorderBlocks }: SortableSceneProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const blockSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleBlockDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = scene.blocks.findIndex((b) => b.id === active.id);
      const newIdx = scene.blocks.findIndex((b) => b.id === over.id);
      onReorderBlocks(arrayMove(scene.blocks, oldIdx, newIdx).map((b) => b.id));
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 flex flex-col gap-4">
      {/* Scene header */}
      <div className="flex items-start gap-2">
        <button
          className="mt-1 cursor-grab text-zinc-500 hover:text-zinc-300 transition"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>

        <div className="flex-1 grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-zinc-500 uppercase">Scene title</label>
            <input
              className={`${inputCls} w-full mt-0.5`}
              value={scene.sceneTitle}
              onChange={(e) => onUpdate({ sceneTitle: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase">Order</label>
            <input
              type="number"
              className={`${inputCls} w-full mt-0.5`}
              value={scene.sceneOrder}
              onChange={(e) => onUpdate({ sceneOrder: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase">Timeline</label>
            <input
              type="number"
              className={`${inputCls} w-full mt-0.5`}
              value={scene.timelineOrder}
              onChange={(e) => onUpdate({ timelineOrder: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase">Location</label>
            <input
              className={`${inputCls} w-full mt-0.5`}
              value={scene.location ?? ""}
              onChange={(e) => onUpdate({ location: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase">Time hint</label>
            <input
              className={`${inputCls} w-full mt-0.5`}
              value={scene.timeHint ?? ""}
              onChange={(e) => onUpdate({ timeHint: e.target.value })}
            />
          </div>
        </div>

        <button
          onClick={onRemove}
          className="text-zinc-500 hover:text-red-400 transition"
          title="Remove scene"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Blocks */}
      {scene.blocks.length === 0 ? (
        <p className="text-xs text-zinc-600 italic pl-7">
          {`No blocks added yet. Use "Add to scene" from the extraction panel above.`}
        </p>
      ) : (
        <DndContext sensors={blockSensors} collisionDetection={closestCenter} onDragEnd={handleBlockDragEnd}>
          <SortableContext items={scene.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-1.5 pl-7">
              {scene.blocks.map((block) => (
                <BlockBadge key={block.id} block={block} onRemove={() => onRemoveBlock(block.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

interface Props {
  scenes: Scene[];
  onAddScene: () => void;
  onRemoveScene: (id: string) => void;
  onUpdateScene: (id: string, patch: Partial<Omit<Scene, "blocks">>) => void;
  onRemoveBlockFromScene: (sceneId: string, blockId: string) => void;
  onReorderSceneBlocks: (sceneId: string, blockIds: string[]) => void;
  onReorderScenes: (sceneIds: string[]) => void;
}

export function SceneComposer({
  scenes,
  onAddScene,
  onRemoveScene,
  onUpdateScene,
  onRemoveBlockFromScene,
  onReorderSceneBlocks,
  onReorderScenes,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = scenes.findIndex((s) => s.id === active.id);
      const newIdx = scenes.findIndex((s) => s.id === over.id);
      onReorderScenes(arrayMove(scenes, oldIdx, newIdx).map((s) => s.id));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-4">
            {scenes.map((scene) => (
              <SortableScene
                key={scene.id}
                scene={scene}
                onUpdate={(patch) => onUpdateScene(scene.id, patch)}
                onRemove={() => onRemoveScene(scene.id)}
                onRemoveBlock={(blockId) => onRemoveBlockFromScene(scene.id, blockId)}
                onReorderBlocks={(blockIds) => onReorderSceneBlocks(scene.id, blockIds)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        onClick={onAddScene}
        className="flex items-center gap-2 self-start rounded-lg border border-dashed border-zinc-600 px-4 py-2 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-200 transition"
      >
        <Plus className="h-4 w-4" /> Add scene
      </button>
    </div>
  );
}
