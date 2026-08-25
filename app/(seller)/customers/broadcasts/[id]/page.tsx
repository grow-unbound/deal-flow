'use client';

import { use } from 'react';
import { FeatureGate } from '@/components/FeatureGate';
import { BroadcastDetailClient } from '@/components/seller/customers/BroadcastDetailClient';

export default function BroadcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <FeatureGate flag="WHATSAPP_BROADCAST">
      <BroadcastDetailClient broadcastId={id} />
    </FeatureGate>
  );
}
