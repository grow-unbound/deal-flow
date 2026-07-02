'use client';

import { BookCheck, Boxes, Cable, ChevronRight, ServerCog } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { IntegrationCatalogItem } from '@/hooks/useIntegrationsSettings';

function getIntegrationIcon(integration: IntegrationCatalogItem) {
  if (integration.connectivity_mode === 'local') return Cable;
  if (integration.id.includes('inventory')) return Boxes;
  if (integration.id.includes('books')) return BookCheck;
  return ServerCog;
}

interface IntegrationPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrations: IntegrationCatalogItem[];
  onSelect: (integration: IntegrationCatalogItem) => void;
}

export function IntegrationPickerDialog({
  open,
  onOpenChange,
  integrations,
  onSelect,
}: IntegrationPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-cream-200 bg-white">
        <DialogHeader>
          <DialogTitle className="font-display text-cream-900">Add integration</DialogTitle>
          <DialogDescription className="text-cream-700">
            Select a tool to connect to Yukti.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {integrations.length === 0 ? (
            <p className="text-sm text-cream-700">All available integrations are already connected.</p>
          ) : (
            <div className="space-y-2">
              {integrations.map((integration) => {
                const Icon = getIntegrationIcon(integration);
                return (
                  <button
                    key={integration.id}
                    type="button"
                    onClick={() => onSelect(integration)}
                    className="flex w-full items-center gap-4 rounded-2xl border border-cream-200 bg-white px-4 py-4 text-left shadow-xs transition-colors hover:border-teal-200 hover:bg-teal-50/40"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cream-200 bg-cream-50 text-teal-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-cream-900">{integration.display_name}</div>
                      <p className="mt-0.5 line-clamp-1 text-sm text-cream-600">{integration.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-cream-400" />
                  </button>
                );
              })}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
