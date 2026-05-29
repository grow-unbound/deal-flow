'use client';

import { LandingTable, StatusTag } from '@/components/seller/layout';
import type { BrandDetailCatalog } from '@/hooks/useBrands';
import { formatCompactInr } from '@/lib/utils';

interface BrandCatalogsTabProps {
  catalogs: BrandDetailCatalog[];
}

export function BrandCatalogsTab({ catalogs }: BrandCatalogsTabProps) {
  return (
    <section className="mt-5">
      <LandingTable
        columns={[
          { label: 'Catalog name', className: 'px-5' },
          { label: 'Cohort', className: 'px-5' },
          { label: 'GMV', className: 'px-5' },
          { label: 'Orders', className: 'px-5' },
          { label: 'Status', className: 'px-5' },
          { label: 'Sent', className: 'px-5' },
        ]}
        className="rounded-[14px] border border-cream-300"
      >
        {catalogs.map((catalog) => (
          <tr key={catalog.id} className="border-b border-cream-300 bg-white transition-colors hover:bg-cream-50">
            <td className="px-5 py-3.5 text-[13.5px] font-medium text-cream-900">{catalog.name}</td>
            <td className="px-5 py-3.5 text-cream-900">{catalog.cohort}</td>
            <td className="px-5 py-3.5 font-display text-[15px] text-cream-950">{formatCompactInr(catalog.gmv)}</td>
            <td className="px-5 py-3.5 text-cream-900">{catalog.orders}</td>
            <td className="px-5 py-3.5 text-cream-900">
              <StatusTag
                label={catalog.status}
                tone={catalog.status === 'published' ? 'success' : catalog.status === 'draft' ? 'warning' : 'neutral'}
              />
            </td>
            <td className="px-5 py-3.5 text-cream-900">{new Date(catalog.sent_at).toLocaleDateString('en-IN')}</td>
          </tr>
        ))}
      </LandingTable>
    </section>
  );
}
