'use client';

import { useCallback } from 'react';
import { X, GripVertical, ImageIcon, Loader2 } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBrowseUploadField, validateUploadImageFile } from '@/components/ui/browse-upload-field';

// ── Pure validation function (also exported for unit tests) ──────────────────
export const validateImageFile = validateUploadImageFile;

// ── SortableImageItem ────────────────────────────────────────────────────────
interface SortableImageItemProps {
  id: string;
  url: string;
  index: number;
  onRemove: (url: string) => void;
}

function SortableImageItem({ id, url, index, onRemove }: SortableImageItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative flex-shrink-0 w-20 h-20 rounded-md shadow-xs overflow-hidden group border border-cream-200"
    >
      {/* Thumbnail image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Product image ${index + 1}`} className="w-full h-full object-cover" />

      {/* Primary badge */}
      {index === 0 && (
        <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-semibold bg-teal-500 text-white py-0.5 leading-tight">
          Primary
        </span>
      )}

      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-0.5 left-0.5 cursor-grab active:cursor-grabbing text-cream-400 opacity-0 group-hover:opacity-100 transition-opacity bg-white/70 rounded p-0.5"
      >
        <GripVertical size={12} />
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(url)}
        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-white/80 text-cream-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label={`Remove image ${index + 1}`}
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── ImageUploadZone ──────────────────────────────────────────────────────────
export interface ImageUploadZoneProps {
  value: string[];
  onChange: (urls: string[]) => void;
  maxImages?: number;
  uploadFile?: (file: File) => Promise<string>;
}

export function ImageUploadZone({
  value,
  onChange,
  maxImages = 5,
  uploadFile,
}: ImageUploadZoneProps) {
  const {
    inputRef,
    isDragOver,
    setIsDragOver,
    uploading,
    canUploadMore,
    openPicker,
    handleFiles,
    removeUrl,
  } = useBrowseUploadField({
    value,
    onChange,
    maxFiles: maxImages,
    uploadFile,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ── Drag-and-drop into zone ──────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  // ── Remove image ─────────────────────────────────────────────────────────
  const handleRemove = useCallback(
    (url: string) => {
      removeUrl(url);
    },
    [removeUrl]
  );

  // ── Reorder via DnD kit ───────────────────────────────────────────────────
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = value.indexOf(active.id as string);
    const newIndex = value.indexOf(over.id as string);
    if (oldIndex !== -1 && newIndex !== -1) {
      onChange(arrayMove(value, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-3">
      {/* Upload zone */}
      {canUploadMore && (
        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openPicker()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={[
            'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors select-none',
            isDragOver
              ? 'border-teal-400 bg-teal-50'
              : 'border-cream-300 bg-cream-50 hover:bg-cream-100',
          ].join(' ')}
        >
          <ImageIcon size={24} className="mx-auto text-cream-400 mb-2" />
          <p className="text-sm text-cream-700 font-medium">Drop images here or click to upload</p>
          <p className="text-xs text-cream-400 mt-1">JPG, PNG, WebP • Max 5MB each</p>
          <p className="text-xs text-cream-400">
            {value.length}/{maxImages} images added
          </p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        // Reset input so same file can be re-selected if removed
        onClick={(e) => ((e.target as HTMLInputElement).value = '')}
      />

      {/* Uploading indicators */}
      {uploading.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {uploading.map((u) => (
            <div
              key={u.tempId}
              className="relative flex-shrink-0 w-20 h-20 rounded-md border border-teal-200 bg-teal-50 flex items-center justify-center"
            >
              <Loader2 size={20} className="animate-spin text-teal-500" />
            </div>
          ))}
        </div>
      )}

      {/* Thumbnail grid with drag-and-drop reorder */}
      {value.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={value} strategy={horizontalListSortingStrategy}>
            <div className="flex flex-wrap gap-2">
              {value.map((url, index) => (
                <SortableImageItem
                  key={url}
                  id={url}
                  url={url}
                  index={index}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
