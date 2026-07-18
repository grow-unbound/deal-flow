'use client';

import { DetailCardRenderer, CardEmptyState, PerformanceCard, type DetailCardPayload } from '@/components/seller/detail';

interface CategoryPerformanceTabProps {
  performanceCards?: unknown[];
}

/**
 * Renders app.get_seller_category_detail_v2's performance_cards array:
 * sales-over-time (unavailable — no category-daily V2 history),
 * brand-contribution (ready, ranked_list), product-action-list (ready, ranked_list).
 * Reuses the same DetailCardRenderer convention as BrandPerformanceTab — no new
 * card-rendering pattern is introduced here.
 */
export function CategoryPerformanceTab({ performanceCards }: CategoryPerformanceTabProps) {
  const cards = (performanceCards ?? []) as DetailCardPayload[];

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
