'use client';

import { formatCurrency } from '@/lib/utils';

interface CustomerActivityTabProps {
  activity: Array<{
    id: string;
    at: string;
    title: string;
    subtitle: string;
    amount: number | null;
  }>;
}

export function CustomerActivityTab({ activity }: CustomerActivityTabProps) {
  const groups = activity.reduce<Record<string, CustomerActivityTabProps['activity']>>((acc, item) => {
    const key = new Date(item.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <section className="mt-5 rounded-[14px] border border-cream-300 bg-white p-5">
      <h3 className="font-display text-lg text-cream-950">Activity</h3>
      <p className="mt-1 text-base text-cream-700">Invoices, payments, credit adjustments, catalog views, and order events</p>

      <div className="mt-4 space-y-6">
        {Object.entries(groups).map(([date, items]) => (
          <div key={date}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">{date}</p>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-3 rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-2.5">
                  <div className="mt-1 h-2 w-2 rounded-full bg-teal-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-base font-medium text-cream-900">{item.title}</p>
                      {item.amount != null ? (
                        <p className="font-mono text-sm text-cream-700">{formatCurrency(item.amount)}</p>
                      ) : null}
                    </div>
                    <p className="text-xs text-cream-600">
                      {item.subtitle} · {new Date(item.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
