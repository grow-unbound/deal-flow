'use client';

import type { BrandDetailActivity } from '@/hooks/useBrands';

interface BrandActivityTimelineProps {
  activity: BrandDetailActivity[];
}

export function BrandActivityTimeline({ activity }: BrandActivityTimelineProps) {
  const groups = activity.reduce<Record<string, BrandDetailActivity[]>>((acc, item) => {
    const key = new Date(item.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <section className="mt-5 rounded-[14px] border border-cream-300 bg-white p-5">
      <h3 className="font-display text-[17px] text-cream-950">Activity</h3>
      <p className="mt-1 text-[13px] text-cream-700">Chronological changes related to this brand</p>
      <div className="mt-4 space-y-6">
        {Object.entries(groups).map(([date, items]) => (
          <div key={date}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-700">{date}</p>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3 rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-2.5">
                  <div className="mt-1 h-2 w-2 rounded-full bg-teal-600" />
                  <div>
                    <p className="text-[13px] font-medium text-cream-900">{item.summary}</p>
                    <p className="text-[11px] text-cream-600">
                      {item.entity_type} · {new Date(item.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
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
