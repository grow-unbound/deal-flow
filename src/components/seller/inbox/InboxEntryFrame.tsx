import type { ReactNode } from 'react';

interface InboxEntryFrameProps {
  /**
   * Only rendered by the `stacked` variant (mobile full-screen route needs a
   * back button + static title here). The `inline` variant (desktop card)
   * renders its own clickable toggle header outside this frame instead --
   * pass `header` there and it's ignored.
   */
  header?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  /**
   * `inline` -- desktop card body, expands in place, no sticky positioning.
   * `stacked` -- mobile full-screen route, body scrolls, footer pins to the
   * bottom so actions stay reachable without scrolling past the line items.
   */
  variant: 'inline' | 'stacked';
}

/**
 * Presentational-only header/body/footer contract, reused by desktop's
 * inline-expand card (InboxEntryCard) and mobile's stacked full-screen route
 * (InboxEntryDetailPage) -- the two no longer diverge on chrome, only on
 * which navigation shell wraps this frame.
 */
export function InboxEntryFrame({ header, children, footer, variant }: InboxEntryFrameProps) {
  if (variant === 'stacked') {
    // Fills the viewport below the 3.5rem mobile top bar so the footer pins to the bottom
    // edge (sticky) instead of floating under short content; long content scrolls the page.
    return (
      <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
        {header ? <div className="shrink-0">{header}</div> : null}
        <div className="flex-1 space-y-5 px-4 py-5">{children}</div>
        <div className="sticky bottom-0 z-10 border-t border-cream-200 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">{footer}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-6 py-6">
      {children}
      {footer}
    </div>
  );
}
