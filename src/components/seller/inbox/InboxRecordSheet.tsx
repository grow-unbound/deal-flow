'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface InboxRecordSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerId: string;
  buyerName: string;
  buyerPhone: string | null;
}

export function InboxRecordSheet({ open, onOpenChange, buyerId, buyerName, buyerPhone }: InboxRecordSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="max-w-md">
        <SheetHeader>
          <SheetTitle>{buyerName}</SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-500">Phone</p>
            <p className="mt-1 text-sm text-cream-800">{buyerPhone ?? 'Not on file'}</p>
          </div>
          <Link
            href={`/customers/${buyerId}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ember-700 hover:text-ember-800"
          >
            Open full customer record
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
