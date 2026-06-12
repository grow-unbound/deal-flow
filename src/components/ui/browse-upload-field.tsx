'use client';

import { useCallback, useRef, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export function validateUploadImageFile(file: { size: number; type: string }): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Only JPG, PNG, and WebP images are allowed.';
  }
  if (file.size > MAX_SIZE_BYTES) {
    return 'Image must be under 5MB.';
  }
  return null;
}

interface UploadingFile {
  tempId: string;
  name: string;
}

interface UseBrowseUploadFieldOptions {
  value: string[];
  onChange: (urls: string[]) => void;
  maxFiles?: number;
  uploadFile?: (file: File) => Promise<string>;
}

export function useBrowseUploadField({
  value,
  onChange,
  maxFiles = 1,
  uploadFile,
}: UseBrowseUploadFieldOptions) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);

  const uploadOneFile = useCallback(
    async (file: File) => {
      const validationError = validateUploadImageFile(file);
      if (validationError) {
        toast.error(validationError);
        return;
      }

      if (value.length + uploading.length >= maxFiles) {
        toast.error(`You can upload up to ${maxFiles} ${maxFiles === 1 ? 'image' : 'images'}.`);
        return;
      }

      const tempId = `${Date.now()}-${Math.random()}`;
      setUploading((prev) => [...prev, { tempId, name: file.name }]);

      try {
        if (uploadFile) {
          const uploadedUrl = await uploadFile(file);
          onChange([...value, uploadedUrl]);
          return;
        }

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
          const err = (await presignRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? 'Failed to get upload URL');
        }

        const { uploadUrl, publicUrl } = (await presignRes.json()) as {
          uploadUrl: string;
          publicUrl: string;
        };

        if (!uploadUrl || uploadUrl.includes('undefined')) {
          onChange([...value, publicUrl]);
          return;
        }

        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });

        if (!putRes.ok) {
          throw new Error(`R2 upload failed: ${putRes.status} ${putRes.statusText}`);
        }

        onChange([...value, publicUrl]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        toast.error(message);
      } finally {
        setUploading((prev) => prev.filter((item) => item.tempId !== tempId));
      }
    },
    [maxFiles, onChange, uploading.length, value],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      Array.from(files).forEach((file) => {
        void uploadOneFile(file);
      });
    },
    [uploadOneFile],
  );

  const removeUrl = useCallback(
    (url: string) => {
      onChange(value.filter((item) => item !== url));
    },
    [onChange, value],
  );

  return {
    inputRef,
    isDragOver,
    setIsDragOver,
    uploading,
    canUploadMore: value.length + uploading.length < maxFiles,
    openPicker: () => inputRef.current?.click(),
    handleFiles,
    removeUrl,
  };
}

interface BrowseUploadFieldProps {
  value: string[];
  onChange: (urls: string[]) => void;
  maxFiles?: number;
  uploadFile?: (file: File) => Promise<string>;
  label?: string;
  helperText?: string;
  emptyLabel?: string;
  previewInline?: boolean;
  className?: string;
}

export function BrowseUploadField({
  value,
  onChange,
  maxFiles = 1,
  uploadFile,
  label = 'Upload image',
  helperText = 'JPG, PNG, WebP • Max 5MB',
  emptyLabel = 'Drop an image here or browse from your computer',
  previewInline = false,
  className,
}: BrowseUploadFieldProps) {
  const {
    inputRef,
    isDragOver,
    setIsDragOver,
    uploading,
    canUploadMore,
    openPicker,
    handleFiles,
    removeUrl,
  } = useBrowseUploadField({ value, onChange, maxFiles, uploadFile });

  return (
    <div className={cn('space-y-3', className)}>
      <div className={cn('flex gap-3', previewInline ? 'items-stretch' : 'flex-col')}>
        {previewInline ? (
          <div className="relative flex w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cream-200 bg-white">
            {value[0] ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={value[0]} alt="Uploaded image preview" className="h-[88px] w-[88px] object-cover" />
                <button
                  type="button"
                  onClick={() => removeUrl(value[0])}
                  className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-cream-600 shadow-sm transition-colors hover:text-cream-900"
                  aria-label="Remove uploaded image"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <div className="flex h-[88px] w-[88px] items-center justify-center rounded-xl bg-cream-100 text-cream-400">
                <Upload size={20} />
              </div>
            )}
          </div>
        ) : null}

        {canUploadMore ? (
          <div
            role="button"
            tabIndex={0}
            onClick={openPicker}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openPicker();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragOver(false);
              handleFiles(event.dataTransfer.files);
            }}
            className={cn(
              'min-w-0 flex-1 rounded-xl border border-dashed px-4 py-4 transition-colors',
              isDragOver ? 'border-teal-400 bg-teal-50' : 'border-cream-300 bg-cream-50 hover:bg-cream-100',
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-cream-500 shadow-sm">
                <Upload size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-cream-900">{label}</p>
                <p className="mt-1 text-sm text-cream-700">{emptyLabel}</p>
                <p className="mt-1 text-xs text-cream-500">{helperText}</p>
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_TYPES.join(',')}
              className="hidden"
              onChange={(event) => handleFiles(event.target.files)}
              onClick={(event) => ((event.target as HTMLInputElement).value = '')}
            />
          </div>
        ) : (
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            className="hidden"
            onChange={(event) => handleFiles(event.target.files)}
            onClick={(event) => ((event.target as HTMLInputElement).value = '')}
          />
        )}
      </div>

      {uploading.length > 0 ? (
        <div className="rounded-lg border border-cream-200 bg-cream-50 px-4 py-3">
          {uploading.map((file) => (
            <div key={file.tempId} className="flex items-center gap-2 text-sm text-cream-700">
              <Loader2 size={14} className="animate-spin" />
              <span className="truncate">{file.name}</span>
            </div>
          ))}
        </div>
      ) : null}

      {!previewInline && value.length > 0 ? (
        <div className="space-y-2">
          {value.map((url, index) => (
            <div key={url} className="flex items-center gap-3 rounded-lg border border-cream-200 bg-white px-3 py-3">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md bg-cream-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Uploaded asset ${index + 1}`} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-cream-900">{index === 0 ? 'Primary image' : `Image ${index + 1}`}</p>
                <p className="truncate text-xs text-cream-500">{url}</p>
              </div>
              <button
                type="button"
                onClick={() => removeUrl(url)}
                className="rounded-full p-2 text-cream-500 transition-colors hover:bg-cream-100 hover:text-cream-700"
                aria-label="Remove uploaded image"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
