'use client';

import { Activity } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import type { CategoryDetailActivity } from '@/hooks/useCategories';

interface CategoryActivityTabProps {
  activity: CategoryDetailActivity[];
}

function actionLabel(action: string): string {
  switch (action) {
    case 'create': return 'Created';
    case 'update': return 'Updated';
    case 'delete': return 'Archived';
    default: return action.charAt(0).toUpperCase() + action.slice(1);
  }
}

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function CategoryActivityTab({ activity }: CategoryActivityTabProps) {
  if (activity.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={<Activity size={28} strokeWidth={1.5} />}
          heading="No activity yet"
          description="Changes to this category will appear here."
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-1">
      {activity.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-4 rounded-[10px] border border-cream-200 bg-white px-3 py-2"
        >
          <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-cream-100 text-xs font-semibold text-cream-600">
            {item.actor_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-cream-900">
              <span className="font-medium">{item.actor_name}</span>
              {' · '}
              <span className="text-cream-600">{actionLabel(item.action)}</span>
            </p>
            <p className="text-xs text-cream-400">{formatTs(item.ts)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
