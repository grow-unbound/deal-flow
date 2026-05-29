import { MoreVertical, PencilLine, Archive } from 'lucide-react';

type DetailActionMode = 'default' | 'brand' | 'product' | 'customer' | 'cohort' | 'catalog';

interface DetailActionsProps {
  mode?: DetailActionMode;
}

export function DetailActions({ mode = 'default' }: DetailActionsProps) {
  if (mode !== 'default') {
    return (
      <div className="flex items-center gap-2">
        <button type="button" className="cockpit-btn cockpit-btn-secondary">
          <PencilLine size={14} />
          <span>Edit</span>
        </button>
        <button type="button" className="cockpit-btn cockpit-btn-secondary">
          <Archive size={14} />
          <span>Archive</span>
        </button>
        <button
          type="button"
          aria-label="More actions"
          className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-cream-300 bg-cream-50 text-cream-700 hover:bg-cream-100"
        >
          <MoreVertical size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" className="cockpit-btn cockpit-btn-secondary">
        <PencilLine size={14} />
        <span>Edit</span>
      </button>
      <button type="button" className="cockpit-btn cockpit-btn-secondary">
        <Archive size={14} />
        <span>Archive</span>
      </button>
      <button
        type="button"
        aria-label="More actions"
        className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-cream-300 bg-cream-50 text-cream-700 hover:bg-cream-100"
      >
        <MoreVertical size={14} />
      </button>
    </div>
  );
}

export type { DetailActionMode, DetailActionsProps };
