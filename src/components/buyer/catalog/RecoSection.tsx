'use client';

import * as React from 'react';
import posthog from 'posthog-js';

import { RecoCarousel } from '@/components/buyer/catalog/RecoCarousel';
import type { BuyerCatalogItem } from '@/types/buyer';

interface RecoSectionProps {
  title: string;
  widget: string;
  items: BuyerCatalogItem[];
  sourceProductId?: string;
}

export function RecoSection({ title, widget, items, sourceProductId }: RecoSectionProps): React.ReactNode {
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (items.length === 0 || fired.current) return;
    fired.current = true;
    posthog.capture('reco_widget_shown', {
      widget,
      product_id: sourceProductId,
      result_count: items.length,
    });
  }, [widget, sourceProductId, items.length]);

  if (items.length === 0) return null;

  return (
    <div className="pb-4">
      <h2
        className="mb-3 px-4 text-xs font-semibold uppercase tracking-widest"
        style={{ color: 'var(--cream-500)' }}
      >
        {title}
      </h2>
      <RecoCarousel
        items={items}
      />
    </div>
  );
}
