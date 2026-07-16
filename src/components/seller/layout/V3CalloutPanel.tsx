import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EntityAvatar, type EntityAvatarHue } from './EntityAvatar';

type CalloutKind = 'risk' | 'info' | 'opportunity';

interface CalloutRow {
  initials: string;
  hue: EntityAvatarHue;
  imageUrl?: string | null;
  name: string;
  reason?: ReactNode;
  trailing: ReactNode;
}

interface V3CalloutItem {
  kind: CalloutKind;
  eyebrow: string;
  hint: string;
  rows: CalloutRow[];
}

interface V3CalloutPanelProps {
  items: V3CalloutItem[];
  stalenessHint?: string;
}

export function V3CalloutPanel({ items, stalenessHint = '' }: V3CalloutPanelProps) {
  return (
    <section className="mt-5">
      <header className="mb-2 flex items-center justify-between">
        <p className="eyebrow text-cream-700">Today&apos;s read</p>
        <p className="text-xs text-cream-600">{stalenessHint}</p>
      </header>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item, index) => (
          <article
            key={`${item.eyebrow}-${index}`}
            className={cn(
              'rounded-[14px] border border-cream-300 bg-white px-4 py-[14px]',
              item.kind === 'risk' && 'border-l-[3px] border-l-danger-500',
              item.kind === 'info' && 'border-l-[3px] border-l-teal-500',
              item.kind === 'opportunity' && 'border-l-[3px] border-l-ember-400'
            )}
          >
            <div className="mb-[10px] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full bg-cream-500',
                    item.kind === 'risk' && 'bg-danger-500',
                    item.kind === 'info' && 'bg-teal-500',
                    item.kind === 'opportunity' && 'bg-ember-500'
                  )}
                />
                <p
                  className={cn(
                    'eyebrow text-cream-700',
                    item.kind === 'risk' && 'text-danger-700',
                    item.kind === 'info' && 'text-teal-700',
                    item.kind === 'opportunity' && 'text-ember-700'
                  )}
                >
                  {item.eyebrow}
                </p>
              </div>
              <p className="text-xs text-cream-700">{item.hint}</p>
            </div>
            {item.rows.length === 0 ? (
              <p className="py-1 text-sm text-cream-700 italic">None right now.</p>
            ) : (
              <div className="space-y-[10px]">
                {item.rows.map((row, rowIndex) => (
                  <div
                    key={`${row.name}-${rowIndex}`}
                    className="flex items-center gap-[10px] rounded-[10px] transition duration-150 focus-within:ring-2 focus-within:ring-ember-300/70 active:scale-[0.97]"
                  >
                    <EntityAvatar initials={row.initials} hue={row.hue} imageUrl={row.imageUrl} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium leading-[1.25] text-cream-900">{row.name}</p>
                    </div>
                    <div className="shrink-0 text-right text-sm font-medium text-cream-800">{row.trailing}</div>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export type { V3CalloutItem, CalloutRow, CalloutKind };
