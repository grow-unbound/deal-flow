'use client';

import type { LocationDetailActivityItem } from '@/hooks/useLocations';

interface LocationActivityTabProps {
  activity: LocationDetailActivityItem[];
}

export function LocationActivityTab({ activity }: LocationActivityTabProps) {
  return (
    <div className="mt-6 divide-y divide-cream-100 rounded-[14px] border border-cream-300 bg-white">
      {activity.length === 0 ? (
        <div className="py-12 text-center text-sm text-cream-500">
          No activity recorded for this location.
        </div>
      ) : (
        activity.map((item) => (
          <div key={item.id} className="flex items-start gap-3 px-5 py-4">
            <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-teal-500" />
            <div className="min-w-0">
              <p className="text-sm font-medium capitalize text-cream-900">
                {item.action.replace(/_/g, ' ')}
              </p>
              {item.diff ? (
                <p className="mt-0.5 truncate text-xs text-cream-600">
                  {Object.entries(item.diff)
                    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                    .join(' · ')}
                </p>
              ) : null}
            </div>
            <p className="ml-auto shrink-0 text-xs text-cream-500">
              {new Date(item.ts).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
