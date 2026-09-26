'use client';

import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InboxReplyQuoteBody, useInboxReplyQuoteDraft } from './InboxReplyQuoteView';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

interface InboxReplyQuoteSheetProps {
  entry: InboxEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Desktop wrapper for the quote editor -- wider than the default Dialog
 * (the content is rich: image + sku + stock + resolved price + two inputs per
 * line, add-item search, totals, notes) but still a dialog, since desktop has
 * the width to spare. Mobile gets its own full screen instead
 * (InboxReplyQuoteScreen) -- same InboxReplyQuoteBody content either way.
 */
export function InboxReplyQuoteSheet({ entry, open, onOpenChange }: InboxReplyQuoteSheetProps) {
  const draft = useInboxReplyQuoteDraft(entry, open);

  async function handleSend() {
    const sent = await draft.sendQuote();
    if (sent) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Reply with a quote</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {open ? <InboxReplyQuoteBody draft={draft} /> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" variant="outline" onClick={() => draft.saveDraft()} disabled={!draft.canSave || draft.isSaving}>
            {draft.isSaving ? 'Saving…' : 'Save Draft'}
          </Button>
          <Button type="button" variant="primary" onClick={handleSend} disabled={!draft.canSend || draft.isSending}>
            {draft.isSending ? 'Sending…' : 'Send quote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
