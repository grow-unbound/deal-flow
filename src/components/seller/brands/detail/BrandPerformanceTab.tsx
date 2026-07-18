'use client';

import { DetailCardRenderer, type DetailCardPayload } from '@/components/seller/detail';

interface BrandPerformanceTabProps {
  performanceCards?: unknown[];
}

// get_seller_brand_detail_v2 (supabase/migrations/20260716135550_..._phase_7_detail_bootstrap_rpcs.sql)
// is the source of truth here. An earlier order-based fallback UI (monthly revenue trend, top
// buyers, top SKUs) used to render when performanceCards was empty, but the RPC always returns 4
// cards, so that path was unreachable dead code — and its figures were computed from orders, not
// invoices, which would have violated the invoiced-sales-only rule if ever surfaced. Removed rather
// than un-hidden; render only the honest v2 cards — 2 of 4 (product-contribution,
// current-inventory-by-warehouse) are real and invoice-based today, the other 2 render a clean
// 'unavailable' empty state until a brand-daily history and brand-buyer read model exist.
export function BrandPerformanceTab({ performanceCards }: BrandPerformanceTabProps) {
  return (
    <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
      {(performanceCards as DetailCardPayload[] | undefined ?? []).map((card) => (
        <DetailCardRenderer key={card.id} card={card} />
      ))}
    </section>
  );
}
