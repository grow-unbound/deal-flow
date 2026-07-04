# DealFlow Claude Instructions

Follow the repo `AGENTS.md` as the source of truth for product, UI, and workflow rules.

## Spacing Standard
- Forms, dialogs, alert dialogs, and confirmation sheets must use explicit `header` / `body` / `footer` spacing.
- Keep modal padding balanced and consistent: header at the top, roomy body spacing, and a dedicated footer row for actions.
- Prefer the shared dialog primitives (`DialogHeader`, `DialogBody`, `DialogFooter`) instead of hand-rolled spacing blocks.
- In two-column form layouts, keep labels, inputs, and helper text aligned to the grid and avoid letting helper text spill into the action row.

## Navigation & Perceived Performance Standard
- Use SPA navigation for all internal routes (`next/link`, `router.push`, `router.replace`). Do not use raw `<a href="/...">` for in-app pages.
- Keep route shells persistent and add `loading.tsx` skeleton boundaries for seller and buyer route segments.
- Every critical view must render a skeleton/pending state first; do not allow blank transition states.
- For CTA-driven mutations, default to optimistic UI with React Query (`onMutate` + rollback in `onError` + revalidate in `onSettled`).
- Avoid unnecessary `router.refresh()` calls; prefer targeted query updates and invalidation.

## Backend & Data-Fetching Performance Standard
(full rationale - read only when required: `specs/performance-upgrade-2026-07.md`)
- SSR bootstrap fetches always pass an explicit, bounded `limit` — never fetch a full table for SSR.
- Before reducing any list's SSR limit: check whether KPIs/summary/callout data are computed from that same limited row set, or from a separate unbounded query. Only cut the limit if the row array is genuinely discarded or refetched independently (e.g. via a real `useInfiniteQuery`). If a list page has no cursor pagination in its client hook, do not cut its API limit — cap unbounded queries with a safety `.limit()` instead, don't truncate the only data source the UI has.
- Every buyer-facing API GET route sets `Cache-Control: private, ...` (never `public`/`s-maxage` — responses are per-buyer auth-gated). Use `src/lib/server/buyer-cache-headers.ts`.
- Catalog/list filtering happens in the SQL query (Supabase `.eq()`/`.in()`) before hydration — never filter in JS after fetching and joining the full result set.
- Images always use `next/image` with the `unoptimized` prop, pointing at the correct presized R2 variant (thumb/small/medium/large per `specs/image-upload-architecture.md`). Never a raw `<img>` tag, never Vercel's runtime image optimizer, never a new resizing pipeline.
- Heavy or rarely-visited components (charts, modals, drawers, detail-tab panels) are wrapped in `next/dynamic(..., { ssr: false })`. Check `pnpm run analyze` before adding any new heavy dependency (charting, PDF, maps, etc).
- `tsconfig.json`'s `tsBuildInfoFile` stays inside `.next/cache/` — that's the only directory Vercel's build cache persists between deploys.
- `middleware.ts`'s route-matcher extension exclusions (`\.js`, `\.css`, etc.) only match paths that *start* with those strings, not paths ending in them. Any new root-level static public file (manifest, service worker, etc.) must be added explicitly to `PUBLIC_PREFIXES`.
