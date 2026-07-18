'use client';

import { DetailCardRenderer, type DetailCardPayload } from '@/components/seller/detail';

interface CohortPerformanceTabProps {
  performanceCards?: unknown[];
}

// get_seller_cohort_detail_v2 (supabase/migrations/20260716135550_..._phase_7_detail_bootstrap_rpcs.sql)
// is the source of truth here. An earlier order-based fallback UI (sales-over-time chart, top
// members by spend_mtd/order_count_mtd, campaigns-to-group) used to render when performanceCards
// was empty, but the RPC always returns 3 cards, so that path was unreachable dead code — and its
// figures were computed from orders, not invoices, which would have violated the invoiced-sales-only
// rule if ever surfaced. Removed rather than un-hidden; render only the honest v2 cards (ready or a
// clean 'unavailable' empty state) until a member-purchase fact table exists.
export function CohortPerformanceTab({ performanceCards }: CohortPerformanceTabProps) {
  return (
    <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
      {(performanceCards as DetailCardPayload[] | undefined ?? []).map((card) => (
        <DetailCardRenderer key={card.id} card={card} />
      ))}
    </section>
  );
}
