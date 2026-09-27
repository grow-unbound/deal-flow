---
paths:
  - "app/**/*.tsx"
  - "src/components/**"
  - "app/globals.css"
---
# UI standards (spacing, navigation, skeletons/CLS, scrollbars)

## Spacing & Layout Standard
- Forms, dialogs, alert dialogs, and confirmation sheets must use clear `header` / `body` / `footer` spacing, not ad hoc stacked blocks.
- Keep modal inner spacing balanced: header padding at the top, consistent body padding, and a dedicated footer row for actions.
- Use the shared dialog primitives (`DialogHeader`, `DialogBody`, `DialogFooter`) whenever possible so spacing stays consistent across screens.
- For two-column form rows, keep labels, inputs, and helper text aligned with the form grid and avoid collapsing helper text into the action row.

## Navigation & Perceived Performance Standard
- Internal navigation must be SPA-style: use `next/link` or `router.push` for in-app routes. Do not use raw `<a href="/...">` for internal pages.
- Allowed raw anchors: external URLs, `mailto:`, `tel:`, download links, and API/file endpoints that require browser-native behavior.
- Keep shells persistent across navigation (`app/(seller)/layout.tsx`, `app/(buyer)/layout.tsx`) and avoid patterns that remount the full app frame.
- Add and maintain route-level `loading.tsx` skeletons for every seller and buyer page so route transitions render immediately with no blank flash.
- Skeleton loaders are mandatory for all new pages — landing pages, detail pages, and sub-routes alike. A `loading.tsx` is a **blocking deliverable** when creating any new `page.tsx`.
- **Structural fidelity rule:** `loading.tsx` must mirror the exact layout of the page it covers — same padding, same grid columns, same section count and proportional heights. It must match the client component's own skeleton (e.g. `BrandLandingSkeleton`, `OrdersLoadingSkeleton`) so SSR streaming and client hydration produce no visual jump.
- **Seller landing pages** wrap content in `max-w-[1920px] mx-auto w-full px-8 py-6` (equivalent to `PageWrap`). Use this directly in `loading.tsx` — do not import `PageWrap` (it is a client-only export).
- **Seller detail pages** use `max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6` (equivalent to `PageWrap className="pt-7"`). Standard structure: breadcrumb bar → title row (avatar + name/desc + action buttons) → 4 KPI cards → tab pills → content panel.
- **Buyer pages** use `p-4` or the shell's own padding; do not add extra wrappers.
- Use only `animate-pulse bg-cream-100 border border-cream-200` for skeleton blocks and `bg-cream-200` for text/label placeholders. Do not import the shadcn `Skeleton` component into `loading.tsx` files — use plain `div`s to keep them dependency-free.
- When a page's layout changes (sections added, removed, or resized), update its `loading.tsx` in the same PR. Treat mismatched skeletons as a layout bug.
- Stub/scaffolded pages (not yet fully implemented) still require a `loading.tsx`; use the detail-page template as the base and add a comment noting it should be updated when the page is complete.
- Optimistic UI is mandatory for human-triggered CTAs where rollback is safe: show instant pending state, apply optimistic cache update, rollback on error, and revalidate in background.
- Prefer targeted React Query cache updates/invalidation over `router.refresh()`. Use `router.refresh()` only when targeted invalidation cannot provide correct data.
- **CLS budget: < 0.05.** A skeleton that's shorter than the content it precedes is a layout-shift bug, same severity as a missing `loading.tsx`.
  - Any title/label that can wrap to 2 lines (product name, catalog name, buyer name) reserves that height in both the real component and its skeleton — use `BUYER_TWO_LINE_TITLE_CLASS` (`src/lib/buyer-ui.ts`) or an equivalent `line-clamp-2 min-h-[2.4em]` on both sides, never just on the real component.
  - Conditional widgets fed by an async hook (recommendation rails, gap-fill banners, insight cards) render a same-footprint skeleton while loading — never nothing-then-pop-in.
  - Use `dvh`, not `vh`, for any full-height mobile sheet/drawer/page shell — plain `vh` reflows when the mobile browser chrome collapses on scroll.
  - When a table/landing page re-fetches in place (filter change, background refresh), don't swap in the full page-level skeleton over content that's already rendered — that duplicates KPI/header sections instead of just refreshing the row area.

## Scrollbar Standard
- Scrollbars are transparent by default and only take color while the element is actively being interacted with (hover or focus-within). No scrollable surface in either app should show a permanently-visible thumb.
- This is enforced globally in `app/globals.css` (`::-webkit-scrollbar-thumb` + `scrollbar-color`, revealed on `:hover`/`:focus-within`) — do not add component-level `::-webkit-scrollbar` overrides that hardcode a visible thumb color; if a surface needs different behavior, extend the shared pattern instead of hand-rolling a new one.
- Showing/hiding the thumb must never shift layout: only change thumb/track *color*, never the reserved scrollbar-gutter width. The gutter is reserved by the browser the moment content overflows regardless of thumb visibility, so a pure color toggle is layout-shift-free by construction — don't "fix" a jump by conditionally adding/removing `overflow-y-auto` or swapping element height instead.
- For panels where the pointer often rests over content without scrolling it (dashboard cards, tall lists), prefer the stricter true-active-scroll pattern (`dashboard-vscroll` class + an `onScroll` handler that sets an active flag and clears it after ~900ms of inactivity, see `SellerDashboardClient.tsx`) over the base hover reveal.
- Horizontal chip/carousel rows with an obvious non-scrollbar affordance (drag, chevron buttons, touch swipe) may hide their scrollbar entirely (`buyer-hscroll` / `[scrollbar-width:none]` pattern) — that's a deliberate exception, not a violation of this standard.

- All primary buttons: lucide icon (left, 16px) + text label. Never icon-only for CTAs.
