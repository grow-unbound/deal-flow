'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { EntityAvatar, type EntityAvatarHue } from './EntityAvatar';
import { SeeAllSheet } from './SeeAllSheet';

type CalloutKind = 'risk' | 'info' | 'opportunity';

function columnsFor(count: number) {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 md:grid-cols-2';
  return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
}

interface CalloutRow {
  /** Required to enable "see all" row navigation via getHref. */
  id?: string;
  href?: string;
  initials: string;
  hue: EntityAvatarHue;
  imageUrl?: string | null;
  name: string;
  reason?: ReactNode;
  trailing: ReactNode;
}

interface V3CalloutItem {
  id: string;
  kind: CalloutKind;
  eyebrow: string;
  hint: string;
  rows: CalloutRow[];
  /** Builds the entity detail-page href for a row; omit to render rows without navigation. */
  getHref?: (row: CalloutRow) => string;
  /** Optional lazy loader for the full callout list shown in the side sheet. */
  loadRows?: () => Promise<CalloutRow[]>;
}

interface V3CalloutPanelProps {
  items: V3CalloutItem[];
  stalenessHint?: string;
}

export function V3CalloutPanel({ items, stalenessHint = '' }: V3CalloutPanelProps) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [loadedRowsByItemId, setLoadedRowsByItemId] = useState<Record<string, CalloutRow[]>>({});
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const activeItem = activeIndex == null ? null : items[activeIndex] ?? null;
  const activeRows = activeItem ? (loadedRowsByItemId[activeItem.id] ?? activeItem.rows) : [];

  useEffect(() => {
    if (!activeItem?.loadRows || loadedRowsByItemId[activeItem.id]) return;

    let cancelled = false;
    setLoadingItemId(activeItem.id);

    activeItem.loadRows()
      .then((rows) => {
        if (cancelled) return;
        setLoadedRowsByItemId((current) => ({ ...current, [activeItem.id]: rows }));
      })
      .catch((error) => {
        console.error(`[V3CalloutPanel] Failed to load callout rows for ${activeItem.id}`, error);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingItemId((current) => (current === activeItem.id ? null : current));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeItem, loadedRowsByItemId]);

  return (
    <>
      <section className="mt-5">
        <header className="mb-2 flex items-center justify-between">
          <p className="eyebrow text-cream-700">Today&apos;s read</p>
          <p className="text-xs text-cream-600">{stalenessHint}</p>
        </header>
        <div className={cn('grid gap-3', columnsFor(items.length))}>
          {items.map((item, index) => {
            const visibleRows = item.rows.slice(0, 2);
            const isClickable = item.rows.length > 0;

            return (
              <article
                key={item.id}
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
                  <button
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-1 text-xs font-medium text-cream-700 transition hover:text-cream-900',
                      !isClickable && 'cursor-default opacity-60 hover:text-cream-700'
                    )}
                    onClick={() => {
                      if (!isClickable) return;
                      setLoadedRowsByItemId((current) => {
                        if (!(item.id in current)) return current;
                        const next = { ...current };
                        delete next[item.id];
                        return next;
                      });
                      setActiveIndex(index);
                    }}
                    disabled={!isClickable}
                    aria-label={`Open full ${item.eyebrow} list`}
                  >
                    <span>{item.hint}</span>
                    {isClickable ? <ChevronRight className="h-3 w-3" /> : null}
                  </button>
                </div>
                {visibleRows.length === 0 ? (
                  <p className="py-1 text-sm italic text-cream-700">None right now.</p>
                ) : (
                  <div className="space-y-[10px]">
                    {visibleRows.map((row, rowIndex) => {
                      const href = row.href ?? item.getHref?.(row);
                      const rowContent = (
                        <>
                          {/* <EntityAvatar initials={row.initials} hue={row.hue} imageUrl={row.imageUrl} size={32} /> */}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-medium leading-[1.25] text-cream-900">{row.name}</p>
                            {row.reason ? <p className="mt-0.5 truncate text-xs leading-5 text-cream-700">{row.reason}</p> : null}
                          </div>
                          <div className="shrink-0 text-right text-base font-medium text-cream-800">{row.trailing}</div>
                        </>
                      );
                      const rowClassName = 'flex w-full items-center gap-[10px] rounded-[10px] px-2 py-1 transition duration-150 focus-within:ring-2 focus-within:ring-ember-300/70 active:scale-[0.97]';
                      return href ? (
                        <Link key={row.id ?? rowIndex} href={href} className={cn(rowClassName, 'hover:bg-cream-100')}>
                          {rowContent}
                        </Link>
                      ) : (
                        <div key={row.id ?? rowIndex} className={rowClassName}>
                          {rowContent}
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <SeeAllSheet
        title={activeItem?.eyebrow ?? ''}
        subtitle={activeItem ? `${activeRows.length} item${activeRows.length === 1 ? '' : 's'}` : undefined}
        open={activeItem != null}
        onOpenChange={(open) => {
          if (!open) setActiveIndex(null);
        }}
        columns={[
          { width: '68%' },
          { align: 'right', width: '32%' },
        ]}
        items={activeRows}
        loading={activeItem != null && loadingItemId === activeItem.id && !loadedRowsByItemId[activeItem.id]}
        pageSize={20}
        renderRow={(row, index) => {
          const href = row.href ?? activeItem?.getHref?.(row);
          return (
            <tr
              key={row.id ?? index}
              className={cn(
                'border-b border-cream-200 last:border-b-0',
                href && 'cursor-pointer hover:bg-cream-100'
              )}
              tabIndex={href ? 0 : undefined}
              role={href ? 'link' : undefined}
              onClick={href ? () => router.push(href) : undefined}
              onKeyDown={href ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  router.push(href);
                }
              } : undefined}
            >
              <td className="px-5 py-4">
                <div className="flex items-center gap-[10px]">
                  <EntityAvatar initials={row.initials} hue={row.hue} imageUrl={row.imageUrl} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-[1.25] text-cream-900">{row.name}</p>
                    {row.reason ? <p className="mt-0.5 truncate text-xs leading-5 text-cream-700">{row.reason}</p> : null}
                  </div>
                </div>
              </td>
              <td className="px-5 py-4 text-right text-sm font-medium text-cream-800">{row.trailing}</td>
            </tr>
          );
        }}
      />
    </>
  );
}

export type { V3CalloutItem, CalloutRow, CalloutKind };
