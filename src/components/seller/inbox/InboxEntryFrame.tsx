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
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header ? <div className="shrink-0">{header}</div> : null}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">{children}</div>
        <div className="shrink-0 border-t border-cream-200 bg-white/95 px-4 py-3 backdrop-blur">{footer}</div>
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
