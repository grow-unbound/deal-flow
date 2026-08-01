'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

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
  // `children` is always a truthy React element (the page segment), even when that
  // page renders null — Next.js layouts can't tell "no page" from "page rendered
  // nothing" via the children prop. The actual signal is the URL: a detail pane is
  // open iff the current route has an `id` param, which only [id]/page.tsx matches.
  const { id: openId } = useParams<{ id?: string }>();
  const hasDetail = openId != null;

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
          defaultSize={hasDetail ? 40 : 100}
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
            <ResizablePanel id="seller-detail-split-pane" order={2} defaultSize={60} minSize={40} className="h-full min-h-0">
              <div className="flex h-full min-h-0 flex-col">
                {/* Close button lives in its own row above the detail content —
                    never overlaps the detail page's own title-row CTAs. */}
                <div className="flex shrink-0 justify-end px-3 pt-3">
                  <button
                    type="button"
                    onClick={() => router.push(basePath)}
                    aria-label="Close detail pane"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cream-300 bg-white text-cream-600 shadow-sm transition-colors hover:bg-cream-100 hover:text-cream-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
              </div>
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  );
}
