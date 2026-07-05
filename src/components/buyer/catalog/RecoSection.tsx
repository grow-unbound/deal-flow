'use client';

import * as React from 'react';
import posthog from 'posthog-js';

import { cn } from '@/lib/utils';
import { RecoCarousel } from '@/components/buyer/catalog/RecoCarousel';
import type { BuyerCatalogItem } from '@/types/buyer';

interface RecoSectionProps {
  title: string;
  widget: string;
  items: BuyerCatalogItem[];
  sourceProductId?: string;
  titleVariant?: 'default' | 'detail';
  /** When true, render the section header even with no items (placeholder body). */
  alwaysShow?: boolean;
}

export function RecoSection({
  title,
  widget,
  items,
  sourceProductId,
  titleVariant = 'default',
  alwaysShow = false,
}: RecoSectionProps): React.ReactNode {
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

  if (items.length === 0 && !alwaysShow) return null;

  return (
    <div className="pb-4">
      <h2
        className={cn(
          'mb-3 px-4',
          titleVariant === 'detail'
            ? 'text-base font-semibold text-[var(--fg-1)]'
            : 'text-xs font-semibold uppercase tracking-widest text-[var(--cream-500)]',
        )}
      >
        {title}
      </h2>
      {items.length > 0 ? (
        <RecoCarousel items={items} />
      ) : (
        <p className="px-4 text-sm" style={{ color: 'var(--fg-3)' }}>
          Recommendations coming soon.
        </p>
      )}
    </div>
  );
}
