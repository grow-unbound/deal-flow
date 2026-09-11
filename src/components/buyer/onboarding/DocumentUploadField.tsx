'use client';

import { useRef, useState } from 'react';
import { Loader2, CheckCircle2, RotateCcw } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api-fetch';

/**
 * Single onboarding-document upload control (shop image / GST certificate)
 * for /onboarding's business block. Uses Task 7's presign/confirm routes:
 * presign -> PUT bytes directly to the returned upload_url -> confirm ->
 * bubble the resulting document id up to the parent's documentIds state.
 *
 * Inline idle/uploading/done/error state machine — no upload library needed.
 */

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

export interface DocumentUploadFieldProps {
  id: string;
  label: string;
  required?: boolean;
  docType: 'shop_image' | 'gst_certificate';
  scope: 'personal' | 'business';
  gstin?: string;
  disabled?: boolean;
  documentId: string | null;
  onChange: (documentId: string | null) => void;
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,application/pdf';

export function DocumentUploadField({
  id,
  label,
  required,
  docType,
  scope,
  gstin,
  disabled,
  documentId,
  onChange,
}: DocumentUploadFieldProps) {
  const [state, setState] = useState<UploadState>(documentId ? 'done' : 'idle');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setState('uploading');
    setError('');
    try {
      const presignRes = await apiFetch('/api/buyer/documents/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          gstin: scope === 'business' ? gstin : undefined,
          doc_type: docType,
          content_type: file.type,
        }),
      });
      const presignData = await presignRes.json().catch(() => ({}));
      if (!presignRes.ok || !presignData.upload_url || !presignData.key) {
        setError(presignData?.error ?? 'Could not start the upload. Please try again.');
        setState('error');
        return;
      }

      const putRes = await fetch(presignData.upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!putRes.ok) {
        setError('Upload failed. Please try again.');
        setState('error');
        return;
      }

      const confirmRes = await apiFetch('/api/buyer/documents/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: presignData.key,
          doc_type: docType,
          subject_scope: scope,
          gstin: scope === 'business' ? gstin : undefined,
        }),
      });
      const confirmData = await confirmRes.json().catch(() => ({}));
      if (!confirmRes.ok || !confirmData.id) {
        setError(confirmData?.error ?? 'Could not confirm the upload. Please try again.');
        setState('error');
        return;
      }

      setState('done');
      onChange(confirmData.id as string);
    } catch {
      setError('Network error. Please try again.');
      setState('error');
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    fileRef.current = file;
    setFileName(file.name);
    onChange(null);
    void upload(file);
  }

  function handleRetry() {
    if (fileRef.current) {
      void upload(fileRef.current);
    } else {
      inputRef.current?.click();
    }
  }

  function handleReplace() {
    inputRef.current?.click();
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? ' (required)' : ' (optional)'}
      </Label>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileSelect}
        disabled={disabled || state === 'uploading'}
        className="hidden"
      />

      {state === 'idle' && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="w-full text-left px-3 py-2.5 rounded-md border border-dashed border-cream-400 bg-cream-50 text-body-sm text-cream-600 hover:border-cream-500 hover:bg-cream-100 transition-colors"
        >
          Tap to upload {label.toLowerCase()}
        </button>
      )}

      {state === 'uploading' && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-cream-300 bg-cream-50 text-body-sm text-cream-700">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span className="truncate">Uploading {fileName}…</span>
        </div>
      )}

      {state === 'done' && (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-md border border-teal-200 bg-teal-50 text-body-sm text-teal-800">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{fileName || 'Uploaded'}</span>
          </div>
          <button
            type="button"
            onClick={handleReplace}
            disabled={disabled}
            className="shrink-0 text-caption font-medium text-teal-700 hover:text-teal-900 underline"
          >
            Replace
          </button>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-md border border-danger-200 bg-danger-50 text-body-sm text-danger-600">
            <span className="truncate">{error || 'Upload failed.'}</span>
            <button
              type="button"
              onClick={handleRetry}
              disabled={disabled}
              className="shrink-0 inline-flex items-center gap-1 text-caption font-medium text-danger-600 hover:text-danger-800"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
