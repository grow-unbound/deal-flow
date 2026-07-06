'use client';

import { useState } from 'react';
import { ChevronRight, Users } from 'lucide-react';

import { SellerBuyerPickerOverlay } from '@/components/seller/shared/SellerBuyerPickerOverlay';

export function BroadcastBuyerPickerOverlay({
  selectedBuyerIds,
  onChange,
}: {
  selectedBuyerIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-[8px] border border-cream-300 bg-white px-3 py-[10px] text-left transition-colors hover:bg-cream-50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Users size={14} className="shrink-0 text-cream-700" />
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-cream-900">
              {selectedBuyerIds.length === 0
                ? 'Select buyers'
                : `${selectedBuyerIds.length} buyer${selectedBuyerIds.length === 1 ? '' : 's'} selected`}
            </p>
            <p className="mt-0.5 text-sm text-cream-700">
              Search, filter, and choose the exact buyers for this broadcast.
            </p>
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-cream-500" />
      </button>

      <SellerBuyerPickerOverlay
        open={open}
        onOpenChange={setOpen}
        title="Select target buyers"
        selectedBuyerIds={selectedBuyerIds}
        onSelectedBuyerIdsChange={onChange}
      />
    </>
  );
}
