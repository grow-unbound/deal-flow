'use client';

import { useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
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

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// ── Pure validation function (also exported for unit tests) ──────────────────
export function validateImageFile(file: { size: number; type: string }): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Only JPG, PNG, and WebP images are allowed.';
  }
  if (file.size > MAX_SIZE_BYTES) {
    return 'Image must be under 5MB.';
  }
  return null;
}

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
}

interface UploadingFile {
  tempId: string;
  name: string;
}

export function ImageUploadZone({ value, onChange, maxImages = 5 }: ImageUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ── File processing ──────────────────────────────────────────────────────
  const uploadFile = useCallback(
    async (file: File) => {
      const validationError = validateImageFile(file);
      if (validationError) {
        toast.error(validationError);
        return;
      }

      if (value.length >= maxImages) {
        toast.error(`You can upload up to ${maxImages} images.`);
        return;
      }

      const tempId = `${Date.now()}-${Math.random()}`;
      setUploading((prev) => [...prev, { tempId, name: file.name }]);

      try {
        // Step 1: Get pre-signed URL from our API
        const presignRes = await fetch('/api/uploads/r2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          }),
        });

        if (!presignRes.ok) {
          const err = (await presignRes.json()) as { error?: string };
          throw new Error(err.error ?? 'Failed to get upload URL');
        }

        const { uploadUrl, publicUrl } = (await presignRes.json()) as {
          uploadUrl: string;
          publicUrl: string;
          key: string;
        };

        // Handle missing R2_PUBLIC_URL in local dev — skip actual upload, use placeholder
        if (!uploadUrl || uploadUrl.includes('undefined')) {
          console.warn('[R2 Upload] No valid uploadUrl — skipping PUT (local dev without R2 config)');
          onChange([...value, publicUrl]);
          return;
        }

        // Step 2: PUT file directly to R2 (browser → R2, no bytes through app server)
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });

        if (!putRes.ok) {
          throw new Error(`R2 upload failed: ${putRes.status} ${putRes.statusText}`);
        }

        // Step 3: Append public URL to form state
        onChange([...value, publicUrl]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        toast.error(message);
      } finally {
        setUploading((prev) => prev.filter((u) => u.tempId !== tempId));
      }
    },
    [value, onChange, maxImages]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      for (const file of Array.from(files)) {
        uploadFile(file);
      }
    },
    [uploadFile]
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
      onChange(value.filter((u) => u !== url));
      // TODO: fire-and-forget DELETE to clean up R2 object
      // const key = extractKeyFromUrl(url);
      // fetch('/api/uploads/r2/delete', { method: 'DELETE', body: JSON.stringify({ key }) })
      //   .catch((err) => console.warn('[R2 delete] failed for key', key, err));
      console.log('[R2] Image removed from form; R2 object cleanup deferred:', url);
    },
    [value, onChange]
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

  const canUploadMore = value.length + uploading.length < maxImages;

  return (
    <div className="space-y-3">
      {/* Upload zone */}
      {canUploadMore && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
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
