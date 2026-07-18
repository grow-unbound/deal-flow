'use client';

import { DetailCardRenderer, type DetailCardPayload } from '@/components/seller/detail';
import type { PriceListDetail } from '@/hooks/usePriceLists';

interface PriceListPerformanceTabProps {
  priceList: PriceListDetail;
  performanceCards?: unknown[];
}

/**
 * Coverage & checks explore surface for a price list (doc lines 702-713):
 * who-receives-this-pricing, product-coverage-gaps, discount-bands-and-price-checks —
 * all three ready from app.get_seller_pricelist_detail_v2's performance_cards.
 * Falls back to a locally-computed equivalent if the API ever omits performance_cards.
 */
export function PriceListPerformanceTab({ priceList, performanceCards }: PriceListPerformanceTabProps) {
  if (performanceCards?.length) {
    return (
      <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(performanceCards as DetailCardPayload[]).map((card) => (
          <DetailCardRenderer key={card.id} card={card} />
        ))}
      </section>
    );
  }

  return (
    <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
      <DetailCardRenderer
        card={{
          id: 'price-list-recipients',
          representation: 'distribution',
          title: 'Who receives this pricing',
          subtitle: 'Assignment mix by target type',
          body: {
            items: [
              {
                id: 'buyer',
                label: 'Buyer specific',
                value: priceList.assignments.filter((assignment) => assignment.target_type === 'buyer').length,
                pct: priceList.assignments.length > 0 ? Math.round((priceList.assignments.filter((assignment) => assignment.target_type === 'buyer').length / priceList.assignments.length) * 100) : 0,
              },
              {
                id: 'cohort',
                label: 'Customer group',
                value: priceList.assignments.filter((assignment) => assignment.target_type === 'cohort').length,
                pct: priceList.assignments.length > 0 ? Math.round((priceList.assignments.filter((assignment) => assignment.target_type === 'cohort').length / priceList.assignments.length) * 100) : 0,
              },
              {
                id: 'all-buyers',
                label: 'All buyers',
                value: priceList.assignments.filter((assignment) => assignment.target_type === 'all_buyers').length,
                pct: priceList.assignments.length > 0 ? Math.round((priceList.assignments.filter((assignment) => assignment.target_type === 'all_buyers').length / priceList.assignments.length) * 100) : 0,
              },
            ].filter((item) => item.value > 0),
            emptyTitle: 'No assignments yet',
            emptyDescription: 'This price list is not assigned to any buyer segments yet.',
          },
        }}
      />

      <DetailCardRenderer
        card={{
          id: 'price-list-discount-bands',
          representation: 'distribution',
          title: 'Discount bands and price checks',
          subtitle: 'Current item pricing posture',
          body: {
            items: [
              {
                id: 'discounted',
                label: 'Discounted vs base',
                value: priceList.items.filter((item) => {
                  const base = item.tenant_product?.base_selling_price ?? null;
                  return base != null && item.price < base;
                }).length,
                pct: priceList.items.length > 0 ? Math.round((priceList.items.filter((item) => {
                  const base = item.tenant_product?.base_selling_price ?? null;
                  return base != null && item.price < base;
                }).length / priceList.items.length) * 100) : 0,
              },
              {
                id: 'at-base',
                label: 'At base price',
                value: priceList.items.filter((item) => {
                  const base = item.tenant_product?.base_selling_price ?? null;
                  return base != null && Math.abs(item.price - base) < 0.0001;
                }).length,
                pct: priceList.items.length > 0 ? Math.round((priceList.items.filter((item) => {
                  const base = item.tenant_product?.base_selling_price ?? null;
                  return base != null && Math.abs(item.price - base) < 0.0001;
                }).length / priceList.items.length) * 100) : 0,
              },
              {
                id: 'above-base',
                label: 'Above base',
                value: priceList.items.filter((item) => {
                  const base = item.tenant_product?.base_selling_price ?? null;
                  return base != null && item.price > base;
                }).length,
                pct: priceList.items.length > 0 ? Math.round((priceList.items.filter((item) => {
                  const base = item.tenant_product?.base_selling_price ?? null;
                  return base != null && item.price > base;
                }).length / priceList.items.length) * 100) : 0,
              },
            ].filter((item) => item.value > 0),
            emptyTitle: 'No priced items yet',
            emptyDescription: 'Discount and price posture will appear once this list has line items.',
          },
        }}
      />

      <DetailCardRenderer
        card={{
          id: 'price-list-coverage-gaps',
          representation: 'unavailable',
          title: 'Product coverage gaps',
          subtitle: 'Eligibility universe not yet available in this surface',
          availability: 'unavailable',
          body: {
            title: 'Unavailable',
            description: 'Coverage gaps are not shown here until this page has the eligible product universe for a bounded comparison.',
          },
        }}
      />

      <DetailCardRenderer
        card={{
          id: 'price-list-assigned-entities',
          representation: 'ranked_list',
          title: 'Assigned entities',
          subtitle: 'Current recipient list',
          body: {
            items: priceList.assignments.map((assignment) => ({
              id: assignment.id,
              label: assignment.label ?? 'Unlabeled assignment',
              meta: assignment.target_type === 'cohort' ? 'Customer group' : assignment.target_type === 'buyer' ? 'Buyer specific' : 'All buyers',
              value: assignment.members != null ? `${assignment.members}` : undefined,
              supporting: assignment.priority != null ? `Priority ${assignment.priority}` : 'Active assignment',
            })),
            emptyTitle: 'No recipients yet',
            emptyDescription: 'Assign this price list to buyers or customer groups to see recipients here.',
          },
        }}
      />
    </section>
  );
}
