'use client';

import * as React from 'react';
import { Globe, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';

interface CatalogMeta {
  id: string;
  name: string;
  shareToken: string;
  productCount: number;
  cohortName?: string;
  validUntil?: string;
}

interface PublishPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: CatalogMeta | null;
  onPublish: (catalogId: string) => Promise<void>;
  publishing?: boolean;
}

function PublishPreview({ open, onOpenChange, catalog, onPublish, publishing }: PublishPreviewProps) {
  const [copied, setCopied] = React.useState(false);

  if (!catalog) return null;

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/shop/${catalog.shareToken}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Publish catalog</DialogTitle>
          <DialogDescription>
            Review details before publishing. Buyers will receive a shareable link.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Catalog summary */}
          <div className="bg-cream-100 rounded-md p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-body-sm font-medium text-cream-900">{catalog.name}</span>
              <Badge variant="teal">{catalog.productCount} products</Badge>
            </div>
            {catalog.cohortName && (
              <p className="text-caption text-cream-600">Cohort: {catalog.cohortName}</p>
            )}
            {catalog.validUntil && (
              <p className="text-caption text-cream-600">Valid until: {catalog.validUntil}</p>
            )}
          </div>

          {/* Share link */}
          <div>
            <p className="text-body-sm font-medium text-cream-800 mb-1.5">Share link (after publish)</p>
            <div className="flex items-center gap-2 bg-cream-100 border border-cream-300 rounded-sm px-3 py-2">
              <Globe className="h-3.5 w-3.5 text-cream-500 shrink-0" />
              <span className="text-caption text-cream-700 font-mono truncate flex-1">{shareUrl}</span>
              <button
                onClick={handleCopy}
                className="shrink-0 text-cream-500 hover:text-teal-500 transition-colors"
                aria-label="Copy link"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success-700" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => onPublish(catalog.id)}
            disabled={publishing}
          >
            <Globe className="h-4 w-4" />
            {publishing ? 'Publishing…' : 'Publish catalog'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { PublishPreview };
