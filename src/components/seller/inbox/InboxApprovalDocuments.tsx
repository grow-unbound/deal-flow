'use client';

import { useState } from 'react';
import { FileText, Image as ImageIcon, Download, Loader2, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useEntryDocuments, fetchDocumentSignedUrl, type EntryDocument } from '@/hooks/useInboxEntries';

const DOC_TYPE_LABEL: Record<EntryDocument['doc_type'], string> = {
  shop_image: 'Shop image',
  gst_certificate: 'GST certificate',
};

function DocThumbnail({ doc, onOpen }: { doc: EntryDocument; onOpen: () => void }) {
  const Icon = doc.doc_type === 'shop_image' ? ImageIcon : FileText;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-36 shrink-0 flex-col items-start gap-1.5 rounded-[10px] border border-cream-300 bg-cream-50 p-3 text-left transition-colors hover:bg-cream-100"
    >
      <div className="flex h-16 w-full items-center justify-center rounded-sm bg-white">
        <Icon className="h-6 w-6 text-cream-500" aria-hidden />
      </div>
      <p className="text-sm font-medium text-cream-900">{DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}</p>
      {doc.verified ? (
        <span className="inline-flex items-center gap-1 text-xs text-teal-700">
          <BadgeCheck className="h-3 w-3" aria-hidden /> Verified
        </span>
      ) : (
        <span className="text-xs text-cream-500">{new Date(doc.uploaded_at).toLocaleDateString()}</span>
      )}
    </button>
  );
}

interface InboxApprovalDocumentsProps {
  entryId: string;
}

/**
 * Submitted-documents section for a `business_approval` / `new_user_login`
 * expanded card (Task 12, item 1). Thumbnails never carry an image or a
 * signed URL — just a doc-type icon/label — because signed R2 URLs are
 * short-lived and must not be fetched or embedded until the seller actually
 * opens a document (Yukti_Public-Signup_Frontend-Spec_v1.md §6/§1.2).
 */
export function InboxApprovalDocuments({ entryId }: InboxApprovalDocumentsProps) {
  const { data, isLoading } = useEntryDocuments(entryId);
  const [openDoc, setOpenDoc] = useState<EntryDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const documents = data?.documents ?? [];

  async function openPreview(doc: EntryDocument) {
    setOpenDoc(doc);
    setPreviewUrl(null);
    setPreviewLoading(true);
    try {
      const result = await fetchDocumentSignedUrl(entryId, doc.id);
      setPreviewUrl(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load this document');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDownload() {
    if (!openDoc) return;
    setDownloading(true);
    try {
      // Always requests a brand-new signed URL rather than reusing the one
      // used for preview — the preview dialog may have been open long enough
      // for that URL to have expired.
      const result = await fetchDocumentSignedUrl(entryId, openDoc.id);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not download this document');
    } finally {
      setDownloading(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-cream-500">Loading documents…</p>;
  }
  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-cream-800">Submitted documents</p>
      <div className="flex flex-wrap gap-3">
        {documents.map((doc) => (
          <DocThumbnail key={doc.id} doc={doc} onOpen={() => openPreview(doc)} />
        ))}
      </div>

      <Dialog open={openDoc != null} onOpenChange={(open) => !open && setOpenDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{openDoc ? DOC_TYPE_LABEL[openDoc.doc_type] ?? openDoc.doc_type : ''}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {previewLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-cream-500" aria-hidden />
              </div>
            ) : previewUrl && openDoc?.doc_type === 'shop_image' ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URL, not an optimizable asset
              <img src={previewUrl} alt={DOC_TYPE_LABEL[openDoc.doc_type]} className="max-h-[60vh] w-full rounded-sm object-contain" />
            ) : previewUrl ? (
              <iframe title="Document preview" src={previewUrl} className="h-[60vh] w-full rounded-sm border border-cream-200" />
            ) : (
              <p className="text-sm text-cream-500">Could not load a preview for this document.</p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={handleDownload} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
