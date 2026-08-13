import type { ReactNode } from 'react';
import { RefreshCw, Search, SearchX, WifiOff } from 'lucide-react';

interface CatalogSearchStateProps {
  icon: ReactNode;
  tone?: 'neutral' | 'danger';
  title: string;
  description: string;
  action?: ReactNode;
}

/** Shared icon-card treatment for search/browse prompt, no-results, and error
 * states — used anywhere a plain text label previously stood in for these. */
export function CatalogSearchState({ icon, tone = 'neutral', title, description, action }: CatalogSearchStateProps) {
  return (
    <div className="px-4 py-8">
      <div className="mx-auto max-w-md rounded-[20px] border border-[var(--border-1)] bg-[var(--bg-surface)] px-6 py-8 text-center shadow-[var(--shadow-xs)]">
        <div
          className={
            tone === 'danger'
              ? 'mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ember-50)] text-[var(--danger-500)]'
              : 'mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--cream-100)] text-[var(--cream-700)]'
          }
        >
          {icon}
        </div>
        <h2 className="mt-4 text-lg font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--fg-3)]">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

export function CatalogSearchPromptState() {
  return (
    <CatalogSearchState
      icon={<Search className="h-5 w-5" />}
      title="Search your catalog"
      description="Type a product name, SKU, or brand to get started."
    />
  );
}

export function CatalogSearchEmptyState({ query }: { query: string }) {
  return (
    <CatalogSearchState
      icon={<SearchX className="h-5 w-5" />}
      title="No products found"
      description={`No matches for “${query}”. Try another term.`}
    />
  );
}

export function CatalogSearchErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <CatalogSearchState
      icon={<WifiOff className="h-5 w-5" />}
      tone="danger"
      title="Couldn't load results"
      description="Check your connection and try again."
      action={onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[var(--teal-500)] px-5 text-sm font-semibold text-[var(--teal-500)] transition-colors hover:bg-[var(--teal-500)] hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      ) : null}
    />
  );
}
