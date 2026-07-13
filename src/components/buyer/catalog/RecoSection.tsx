'use client';

import * as React from 'react';
import posthog from 'posthog-js';

import { BuyerHorizontalScroll } from '@/components/buyer/layout/BuyerHorizontalScroll';
import { BuyerSectionRow } from '@/components/buyer/layout/BuyerSectionRow';
import { RecoCarousel } from '@/components/buyer/catalog/RecoCarousel';
import { RecoWidgetProvider } from '@/contexts/RecoWidgetContext';
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
        <p className="px-4 text-sm" style={{ color: 'var(--fg-3)' }}>
          Recommendations coming soon.
        </p>
      )}
    </div>
  );
}
