import { cn } from '@/lib/utils';

interface DetailTab {
  id: string;
  label: string;
  badge?: number | string;
}

interface DetailTabsProps {
  tabs: DetailTab[];
  active: string;
  onChange?: (tabId: string) => void;
}

export function DetailTabs({ tabs, active, onChange }: DetailTabsProps) {
  return (
    <div className="mt-6 flex gap-0 border-b border-cream-300" role="tablist" aria-orientation="horizontal">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange?.(tab.id)}
            className={cn(
              'inline-flex items-center border-b-2 border-transparent px-5 py-3.5 text-base font-medium text-cream-700 transition-colors hover:text-cream-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-300/70',
              isActive && 'border-ember-500 text-cream-950'
            )}
          >
            <span>{tab.label}</span>
            {tab.badge != null ? (
              <span className="ml-2 rounded-full bg-cream-200 px-2 py-0.5 text-xs font-semibold text-cream-700">
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export type { DetailTab, DetailTabsProps };
