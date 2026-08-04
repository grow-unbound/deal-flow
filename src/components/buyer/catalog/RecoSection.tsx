'use client';

import * as React from 'react';
import { usePostHog } from 'posthog-js/react';

import { BuyerHorizontalScroll } from '@/components/buyer/layout/BuyerHorizontalScroll';
import { BuyerSectionRow } from '@/components/buyer/layout/BuyerSectionRow';
import { RecoCarousel } from '@/components/buyer/catalog/RecoCarousel';
import { RecoWidgetProvider } from '@/contexts/RecoWidgetContext';
import { BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS } from '@/lib/buyer-lookbook';
import { BUYER_CARD_RADIUS_CLASS, BUYER_TWO_LINE_TITLE_CLASS } from '@/lib/buyer-ui';
import { cn } from '@/lib/utils';
import type { BuyerCatalogItem } from '@/types/buyer';

interface RecoSectionProps {
  title: string;
  widget: string;
  items: BuyerCatalogItem[];
  sourceProductId?: string;
  /** @deprecated Empty sections always hide after load; use isLoading for skeleton. */
  alwaysShow?: boolean;
  /** Independent loading — keep title visible, skeleton body only. */
  isLoading?: boolean;
  href?: string;
  linkLabel?: string;
  /** Override BuyerSectionRow horizontal padding (default px-4). */
  sectionClassName?: string;
  /** Override horizontal scroll gutter (default gap-3 px-4). */
  scrollClassName?: string;
}

export function RecoSection({
  title,
  widget,
  items,
  sourceProductId,
  alwaysShow: _alwaysShow = false,
  isLoading = false,
  href,
  linkLabel,
  sectionClassName = 'px-4 pb-3',
  scrollClassName = 'gap-3 px-4',
}: RecoSectionProps): React.ReactNode {
  const posthog = usePostHog();
  const firedKey = React.useRef<string | null>(null);

  React.useEffect(() => {
    const impressionKey = `${widget}:${sourceProductId ?? ''}:${items.length}`;
    if (isLoading || items.length === 0 || firedKey.current === impressionKey) return;
    firedKey.current = impressionKey;
    posthog?.capture('reco_widget_shown', {
      widget,
      product_id: sourceProductId,
      result_count: items.length,
    });
  }, [posthog, widget, sourceProductId, items.length, isLoading]);

  // Hide after settle when empty (home bestsellers pattern). Loading keeps title + skeleton.
  if (!isLoading && items.length === 0) return null;

  return (
    <div className="pb-4">
      <BuyerSectionRow title={title} href={href} linkLabel={linkLabel} className={sectionClassName} />
      {isLoading ? (
        <RecoSectionSkeleton scrollClassName={scrollClassName} />
      ) : (
        <RecoWidgetProvider value={{ widget, sourceProductId }}>
          <RecoCarousel items={items} scrollClassName={scrollClassName} />
        </RecoWidgetProvider>
      )}
    </div>
  );
}

export function RecoSectionSkeleton({
  scrollClassName = 'gap-3 px-4',
}: {
  scrollClassName?: string;
}): React.ReactNode {
  return (
    <BuyerHorizontalScroll className={scrollClassName}>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            BUYER_PRODUCT_CAROUSEL_WIDTH_CLASS,
            BUYER_CARD_RADIUS_CLASS,
            'shrink-0 overflow-hidden border border-cream-200 bg-cream-50',
          )}
        >
          <div className="aspect-square animate-pulse bg-cream-100" />
          <div className="bg-[var(--cream-50)] px-3 pb-3 pt-2.5">
            <div className={`${BUYER_TWO_LINE_TITLE_CLASS} animate-pulse rounded bg-cream-200`} />
            <div className="mt-0.5 h-3.5 w-2/5 animate-pulse rounded bg-cream-200" />
            <div className="mt-2 h-5 w-24 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </BuyerHorizontalScroll>
  );
}
