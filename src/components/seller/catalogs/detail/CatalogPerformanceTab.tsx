import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from 'recharts';
import type { CatalogDetailResponse } from '@/hooks/useCatalogs';
import { formatCompactInr } from '@/lib/utils';

interface CatalogPerformanceTabProps {
  performance: CatalogDetailResponse['performance'];
}

export function CatalogPerformanceTab({ performance }: CatalogPerformanceTabProps) {
  const funnelRows = [
    { label: 'Unique views', value: performance.funnel.unique_viewers },
    { label: 'Cart additions', value: performance.funnel.cart_additions },
    { label: 'Orders', value: performance.funnel.orders },
    { label: 'GMV', value: performance.funnel.gmv },
  ];

  return (
    <section className="mt-4 grid grid-cols-2 gap-4">
      <article className="rounded-[14px] border border-cream-200 bg-white p-4">
        <h3 className="font-display text-[16px] font-semibold text-cream-950">Engagement funnel</h3>
        <div className="mt-3 space-y-2">
          {funnelRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-2">
              <span className="text-[12px] text-cream-700">{row.label}</span>
              <span className="font-display text-[16px] text-cream-950">{row.label === 'GMV' ? formatCompactInr(row.value) : row.value}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-[14px] border border-cream-200 bg-white p-4">
        <h3 className="font-display text-[16px] font-semibold text-cream-950">Revenue trend</h3>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={performance.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6ded0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => formatCompactInr(value)} />
              <Bar dataKey="revenue" fill="#2f7a67" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="col-span-2 rounded-[14px] border border-cream-200 bg-white p-4">
        <h3 className="font-display text-[16px] font-semibold text-cream-950">Conversion trend</h3>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={performance.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6ded0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Line type="monotone" dataKey="conversion_rate" stroke="#c26e3a" strokeWidth={2.25} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>
    </section>
  );
}
