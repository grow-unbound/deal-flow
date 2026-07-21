'use client';

import { formatNumberValue } from '@/lib/utils';
import { DetailCardRenderer, CardEmptyState, PerformanceCard, type DetailCardPayload } from '@/components/seller/detail';
import type { DetailRankedListCardBody } from '@/components/seller/detail/detail-card-types';

interface CategoryPerformanceTabProps {
  performanceCards?: unknown[];
}

function getInitials(name: string): string {
  return String(name)
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Formats raw numeric `value` in ranked list items as INR and ensures initials are set.
 * brand-contribution items also get units sold formatted in valueSupporting.
 */
function enrichRankedCard(card: DetailCardPayload): DetailCardPayload {
  const body = card.body as DetailRankedListCardBody;
  if (!Array.isArray(body?.items)) return card;

  const isBrandContribution = card.id === 'brand-contribution';

  return {
    ...card,
    body: {
      ...body,
      items: body.items.map((item) => {
        const rawValue = Number(item.value ?? 0);
        const formattedRevenue = rawValue > 0 ? formatNumberValue(rawValue, 'CURRENCY_THRESHOLD') : '—';

        // brand-contribution: supporting is "N units" from the RPC — show as valueSupporting
        const valueSupporting = isBrandContribution && item.supporting
          ? String(item.supporting)
          : item.valueSupporting;

        return {
          ...item,
          initials: item.initials ?? getInitials(String(item.label ?? '')),
          value: formattedRevenue,
          valueSupporting,
          // clear supporting on brand cards (it's moved to valueSupporting)
          supporting: isBrandContribution ? undefined : item.supporting,
        };
      }),
    },
  };
}

/**
 * Renders performance_cards for a category:
 * - Filters out the unavailable sales-over-time card
 * - Formats revenue values as INR in ranked list cards
 * - brand-contribution: shows brand image + product count meta + units sold (valueSupporting)
 * - product-action-list: shows product image + SKU meta + formatted revenue
 */
export function CategoryPerformanceTab({ performanceCards }: CategoryPerformanceTabProps) {
  const cards = ((performanceCards ?? []) as DetailCardPayload[])
    .filter((card) => card.id !== 'sales-over-time')
    .map((card) => card.representation === 'ranked_list' ? enrichRankedCard(card) : card);

  if (!cards.length) {
    return (
      <section className="mt-6">
        <PerformanceCard title="Performance" subtitle="Category performance" bodyClassName="p-5">
          <CardEmptyState
            title="No performance data yet"
            description="Performance cards for this category are not available yet."
            tone="unavailable"
          />
        </PerformanceCard>
      </section>
    );
  }

  return (
    <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
      {cards.map((card) => (
        <DetailCardRenderer key={card.id ?? card.title} card={card} />
      ))}
    </section>
  );
}
