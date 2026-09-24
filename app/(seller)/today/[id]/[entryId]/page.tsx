'use client';

import { use } from 'react';
import { InboxEntryDetailPage } from '@/components/seller/inbox/InboxEntryDetailPage';

export default function TodayEntryDetailPage({ params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id: buyerId, entryId } = use(params);
  return <InboxEntryDetailPage buyerId={buyerId} entryId={entryId} />;
}
