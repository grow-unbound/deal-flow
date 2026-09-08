'use client';

import { createContext, useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
  isSplitPaneDetailQuery,
  SPLIT_PANE_DETAIL_QUERY_KEY,
} from '@/lib/seller-split-pane';

/** Set by `EntitySplitShell` while a detail pane is open in the split view; consumed by
 * `DetailActions` to render the pane's close (X) button inline with the overflow menu,
 * far-right of the title row, instead of a separate row above the detail content. */
export const SplitPaneCloseContext = createContext<(() => void) | null>(null);

interface EntitySplitShellProps {
  /** The list/landing content — always mounted, stays visible while browsing. */
  listSlot: ReactNode;
  /** Detail pane content (the route's `children`) — whatever `[id]/page.tsx` rendered. */
  children?: ReactNode;
  /** Route to return to when the pane is closed, e.g. `/products`. */
  basePath: string;
}

const DESKTOP_QUERY = '(min-width: 768px)';

export function EntitySplitShell({ listSlot, children, basePath }: EntitySplitShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // `children` is always a truthy React element (the page segment), even when that
  // page renders null — Next.js layouts can't tell "no page" from "page rendered
  // nothing" via the children prop. The actual signal is the URL: a detail pane is
  // open iff the current route has an `id` param, which only [id]/page.tsx matches.
  const { id: openId } = useParams<{ id?: string }>();
  const wantsDetailPane = isSplitPaneDetailQuery(searchParams.get(SPLIT_PANE_DETAIL_QUERY_KEY));

  // JS-driven breakpoint check (matches the pattern already used in SellerShell.tsx)
  // rather than rendering both layouts and CSS-toggling visibility — `listSlot` runs
  // its own data fetching/realtime subscriptions, so mounting it twice (once per
  // CSS-hidden branch) would double every hook in the list tree.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    setIsDesktop(query.matches);
    const onChange = () => setIsDesktop(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const hasDetail = openId != null || (isDesktop && wantsDetailPane);

  if (!isDesktop) {
    // Mobile: plain document flow, identical to the old full-page behavior — detail
    // full-bleed when open, else the list. No split, no height constraint.
    return <>{hasDetail ? children : listSlot}</>;
  }

  // Desktop: `listSlot` always lives inside the same ResizablePanelGroup > ResizablePanel
  // ancestor chain, whether or not a detail is open — only the sibling handle+detail
  // panel is conditionally added/removed. Toggling between a plain wrapper and this
  // structure (as an earlier version of this component did) changes listSlot's
  // ancestor chain and forces React to unmount+remount it, losing all of the list's
  // client state (search text, filters, scroll position) every time a pane opens/closes.
  return (
    <div className="h-[calc(100vh-var(--topbar-h))] overflow-hidden">
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="seller-detail-split"
        id="seller-detail-split-group"
        className="h-full"
      >
        <ResizablePanel
          id="seller-detail-split-list"
          order={1}
          defaultSize={hasDetail ? 30 : 100}
          minSize={hasDetail ? 28 : 100}
          className="h-full min-h-0"
        >
          {/* flex column, not a scroll container itself — the list's own sticky
              header (StickyListHeader) stays truly static via flexbox `shrink-0`,
              and only the body region beneath it scrolls. */}
          <div className="flex h-full min-h-0 flex-col overflow-hidden">{listSlot}</div>
        </ResizablePanel>
        {hasDetail ? (
          <>
            <ResizableHandle id="seller-detail-split-handle" withHandle />
            <ResizablePanel id="seller-detail-split-pane" order={2} defaultSize={70} minSize={40} className="h-full min-h-0">
              <div className="flex h-full min-h-0 flex-col">
                {/* Close (X) button is rendered by `DetailActions`, inline with the
                    overflow menu at the far right of the title row — see
                    `SplitPaneCloseContext`. This keeps the detail pane's header on a
                    single line instead of reserving a separate row above it. */}
                <SplitPaneCloseContext.Provider value={() => router.push(basePath)}>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {openId != null ? children : <SplitPaneEmptyDetail basePath={basePath} />}
                  </div>
                </SplitPaneCloseContext.Provider>
              </div>
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  );
}

function SplitPaneEmptyDetail({ basePath }: { basePath: string }) {
  const entityLabel = splitPaneEntityLabel(basePath);
  return (
    <div className="flex min-h-full items-center justify-center px-8 py-10">
      <div className="max-w-sm rounded-xl border border-cream-200 bg-cream-50 px-6 py-5 text-center shadow-xs">
        <h2 className="font-display text-lg font-semibold text-cream-900">
          Select {entityLabel} to view details
        </h2>
        <p className="mt-2 text-md leading-6 text-cream-700">
          Choose a row from the list to open its detail pane.
        </p>
      </div>
    </div>
  );
}

function splitPaneEntityLabel(basePath: string): string {
  if (basePath.includes('/invoices')) return 'an invoice';
  if (basePath.includes('/orders')) return 'an order';
  if (basePath.includes('/estimates')) return 'an estimate';
  if (basePath.includes('/brands')) return 'a brand';
  if (basePath.includes('/categories')) return 'a category';
  if (basePath.includes('/branches')) return 'a branch';
  if (basePath.includes('/warehouses')) return 'a warehouse';
  if (basePath.includes('/products')) return 'a product';
  if (basePath.includes('/customers')) return 'a customer';
  return 'an entity';
}
