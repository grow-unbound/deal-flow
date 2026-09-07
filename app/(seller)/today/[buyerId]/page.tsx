'use client';

import { use } from 'react';
import { InboxDetailClient } from '@/components/seller/inbox/InboxDetailClient';

export default function TodayBuyerDetailPage({ params }: { params: Promise<{ buyerId: string }> }) {
  const { buyerId } = use(params);
  return <InboxDetailClient buyerId={buyerId} />;
}
