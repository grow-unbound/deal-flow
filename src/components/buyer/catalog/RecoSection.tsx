'use client';

import * as React from 'react';
import posthog from 'posthog-js';

import { BuyerHorizontalScroll } from '@/components/buyer/layout/BuyerHorizontalScroll';
import { BuyerSectionRow } from '@/components/buyer/layout/BuyerSectionRow';
import { RecoCarousel } from '@/components/buyer/catalog/RecoCarousel';
import { RecoWidgetProvider } from '@/contexts/RecoWidgetContext';
import { BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS } from '@/lib/buyer-lookbook';
import { BUYER_CARD_RADIUS_CLASS } from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';
import type { BuyerCatalogItem } from '@/types/buyer';

interface RecoSectionProps {
  title: string;
  widget: string;
  items: BuyerCatalogItem[];
  sourceProductId?: string;
  /** When true, render the section header even with no items (placeholder body). */
  alwaysShow?: boolean;
  href?: string;
  linkLabel?: string;
}

export function RecoSection({
  title,
  widget,
  items,
  sourceProductId,
  alwaysShow = false,
  href,
  linkLabel,
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
      <BuyerSectionRow title={title} href={href} linkLabel={linkLabel} />
      {items.length > 0 ? (
        <RecoWidgetProvider value={{ widget, sourceProductId }}>
          <RecoCarousel items={items} />
        </RecoWidgetProvider>
      ) : (
        <RecoSectionSkeleton />
      )}
    </div>
  );
}

function RecoSectionSkeleton(): React.ReactNode {
  return (
    <BuyerHorizontalScroll className="gap-3 px-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS,
            BUYER_CARD_RADIUS_CLASS,
            'shrink-0 overflow-hidden border border-cream-200 bg-white',
          )}
        >
          <div className="aspect-[0.92] animate-pulse bg-cream-100" />
          <div className="space-y-2.5 px-4 py-4">
            <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-3/5 animate-pulse rounded bg-cream-200" />
            <div className="h-5 w-24 animate-pulse rounded bg-cream-200" />
            <div className="h-10 w-full animate-pulse rounded-xl bg-cream-100" />
          </div>
        </div>
      ))}
    </BuyerHorizontalScroll>
  );
}
