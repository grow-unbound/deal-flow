'use client';

import { useRef, useState } from 'react';
import { Loader2, CheckCircle2, RotateCcw, Upload } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api-fetch';

/**
 * Single onboarding-document upload control (shop image / GST certificate)
 * for /onboarding's business block. The file is posted to a same-origin API
 * route, which writes to R2 and returns the resulting buyer_documents id.
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

const ACCEPTED_TYPES: Record<DocumentUploadFieldProps['docType'], string> = {
  shop_image: 'image/jpeg,image/png,image/webp',
  gst_certificate: 'application/pdf,image/jpeg,image/png',
};
const SHOP_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const GST_CERTIFICATE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_SHOP_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_GST_CERTIFICATE_BYTES = 10 * 1024 * 1024;

function validateDocumentFile(file: File, docType: DocumentUploadFieldProps['docType']): string | null {
  if (docType === 'shop_image') {
    if (!SHOP_IMAGE_TYPES.has(file.type)) return 'Shop image must be a JPG, PNG, or WebP file.';
    if (file.size > MAX_SHOP_IMAGE_BYTES) return 'Shop image must be under 8 MB.';
    return null;
  }

  if (!GST_CERTIFICATE_TYPES.has(file.type)) return 'GST certificate must be a PDF, JPG, or PNG file.';
  if (file.size > MAX_GST_CERTIFICATE_BYTES) return 'GST certificate must be under 10 MB.';
  return null;
}

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
      const validationError = validateDocumentFile(file, docType);
      if (validationError) {
        setError(validationError);
        setState('error');
        return;
      }

      const form = new FormData();
      form.append('scope', scope);
      form.append('doc_type', docType);
      form.append('file', file);
      if (scope === 'business' && gstin) form.append('gstin', gstin);

      const uploadRes = await apiFetch('/api/buyer/documents/upload', {
        method: 'POST',
        body: form,
      });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok || !uploadData.id) {
        setError(uploadData?.error ?? 'Upload failed. Please try again.');
        setState('error');
        return;
      }

      setState('done');
      onChange(uploadData.id as string);
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
        accept={ACCEPTED_TYPES[docType]}
        onChange={handleFileSelect}
        disabled={disabled || state === 'uploading'}
        className="hidden"
      />

      {state === 'idle' && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="w-full rounded-xl border border-dashed border-cream-300 bg-cream-50 px-4 py-4 text-left transition-colors hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-cream-500 shadow-sm">
              <Upload size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-cream-900">Upload {label.toLowerCase()}</span>
              <span className="mt-1 block text-sm text-cream-700">Drop a file here or browse from your computer</span>
              <span className="mt-1 block text-xs text-cream-500">JPG, PNG, WebP, PDF</span>
            </span>
          </span>
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
