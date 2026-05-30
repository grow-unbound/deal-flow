import type { CatalogDetailResponse } from '@/hooks/useCatalogs';
import { formatCompactInr } from '@/lib/utils';

interface CatalogBuyersTabProps {
  buyers: CatalogDetailResponse['buyers'];
}

export function CatalogBuyersTab({ buyers }: CatalogBuyersTabProps) {
  return (
    <section className="mt-4 overflow-hidden rounded-[14px] border border-cream-200 bg-white">
      <table className="w-full table-fixed">
        <thead>
          <tr className="border-b border-cream-200 bg-cream-50 text-left text-[11px] uppercase tracking-[0.08em] text-cream-600">
            <th className="px-4 py-3 font-semibold">Buyer</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Spend</th>
            <th className="px-4 py-3 font-semibold">Orders</th>
          </tr>
        </thead>
        <tbody>
          {buyers.map((row) => (
            <tr key={row.buyer_id} className="border-b border-cream-200 text-[13px] text-cream-900 last:border-b-0">
              <td className="px-4 py-3 font-medium">{row.buyer_name}</td>
              <td className="px-4 py-3">{row.status}</td>
              <td className="px-4 py-3">{row.spend > 0 ? formatCompactInr(row.spend) : '—'}</td>
              <td className="px-4 py-3">{row.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
