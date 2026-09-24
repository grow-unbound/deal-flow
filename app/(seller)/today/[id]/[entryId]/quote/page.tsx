'use client';

import { use } from 'react';
import { InboxReplyQuoteScreen } from '@/components/seller/inbox/InboxReplyQuoteScreen';

export default function TodayEntryQuotePage({ params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id: buyerId, entryId } = use(params);
  return <InboxReplyQuoteScreen buyerId={buyerId} entryId={entryId} />;
}
