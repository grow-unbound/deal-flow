---
paths:
  - "app/api/**"
  - "app/**/page.tsx"
  - "src/hooks/**"
  - "src/lib/server/**"
  - "src/lib/query-*.ts"
  - "middleware.ts"
  - "next.config.js"
  - "tsconfig.json"
---
# Data fetching, caching, assets, bundle, build

Full rationale: `specs/performance-upgrade-2026-07.md`. Each rule was a real bug or regression from the July 2026 perf pass.

### SSR bootstrap fetches
- Every SSR page that bootstraps a list (`fetchSellerPageBootstrap` or equivalent) must pass an
  explicit, bounded `limit` query param. Never call a list API with no limit at all — some routes
  default safely (`PAGE_SIZE.SELLER`), but never rely on that; be explicit.
- **Before reducing an existing SSR limit, verify what the response is actually used for:**
  1. Check the client hook: is the row array consumed by a real `useInfiniteQuery` that fetches its
     own pages independently (safe to cut — the SSR array is just a wasted-serialization seed), or
     is it the client component's *only* source for the displayed list (unsafe — cutting the limit
     truncates what the user sees, with no way to load more)?
  2. Check whether KPIs/summary stats/callout panels in the same API response are computed from the
     *same* limited row set (unsafe to cut without also fixing the KPI computation to use a separate
     unbounded/period-scoped query) or from independent aggregate queries (safe).
  3. Only cut the limit when both checks are clear. If a list page has no cursor pagination or
     infinite scroll anywhere in its stack, don't add a small limit to "fix" it — either leave it
     alone (with a bounded safety `.limit()` server-side to cap worst-case query cost, not a
     UX-visible small page size) or build real pagination first.

### Query construction
- Filter in SQL (Supabase `.eq()` / `.in()` / joins), before hydration and before pagination. Never
  fetch a full unfiltered result set, hydrate every row (joins, price resolution, image URLs), and
  then filter or slice in JavaScript. This applies to every list/catalog endpoint, seller and buyer.
- Every list-returning table query needs a `.limit()` — either the real page size, or (if the entity
  genuinely has no pagination UI yet) a generous safety cap. An unbounded `.from(table).select(...)`
  with no `.limit()` at all is not acceptable in any new endpoint.

### Client-side query caching (TanStack Query)
- Set `staleTime`/`gcTime` explicitly from `src/lib/query-navigation.ts`'s tiers — don't hardcode raw
  millisecond values or rely on the `QueryClientProvider` default by omission. Use `REFERENCE_QUERY_*`
  (seller) / `BUYER_REFERENCE_QUERY_*` (buyer) for rarely-changing data (brands, categories,
  warehouses, locations, price lists, cohorts, catalogs list, buyer profile). Use the default
  `NAVIGATION_QUERY_*` / `BUYER_QUERY_*` tier for transactional data (estimates, orders, invoices,
  dashboard KPIs). A 60s staleTime on reference data is a bug, not a safe default.
- Every filtered/paginated list hook (`useQuery`/`useInfiniteQuery` with a search/filter/cursor param)
  sets `placeholderData: keepPreviousData` — a filter change or repeat page visit must keep showing
  the previous rows while refetching, never flash a blank loading state.
- Don't override the global retry policy (`noQueryRetry` — zero retries by default) unless the request
  is genuinely worth retrying; if so use `transientQueryRetry` (`src/lib/query-retry.ts`), which
  already distinguishes retryable 5xx/408/429 from non-retryable 4xx.
- Prefetch route + detail-query data on `pointerdown`/`touchstart` (`usePointerPrefetch`), not
  `onMouseEnter` — hover fires far more often and multiplies DB load for no benefit on touch devices.
- Wrap a server-only read in React `cache()` (see `seller-page-bootstrap.ts`,
  `seller-server-claims.ts`) only when it's called more than once in the same request tree and has no
  need to persist across requests. Never reach for Next's shared fetch/data cache (`next: {revalidate}`)
  on a tenant-scoped read unless the cache key explicitly includes `tenant_id`/`user_id` — an
  under-scoped shared cache key is a cross-tenant data leak, not just a staleness bug.

### Caching
- Every buyer-facing API GET route sets a `Cache-Control` header via
  `src/lib/server/buyer-cache-headers.ts` (`BUYER_CACHE_PERSONAL` or `BUYER_CACHE_CATALOG`). Always
  `private`, never `public`/`s-maxage` — buyer API responses are per-buyer, auth-gated via cookie; a
  shared/CDN cache keyed only on URL would leak one buyer's data to another.
- Mutation responses (POST/PATCH/DELETE) and error/4xx/5xx responses are never cached.

### Images
- Always `next/image` with the `unoptimized` prop, pointing at the correct presized R2 variant
  (`thumb`/`small`/`medium`/`large` — see `specs/image-upload-architecture.md` and
  `src/lib/r2-url.ts`). Match the variant size to the actual rendered slot (don't serve `medium` for
  a 56px thumbnail).
- Never a raw `<img>` tag for any catalog/product/brand/category image.
- Never let Vercel's runtime image optimizer touch these images (that means `unoptimized` is not
  optional) — resizing happens exactly once, at upload time, in the `yukti-image-worker` Cloudflare
  Worker. Don't introduce a second resizing path (no Cloudflare Images managed service, no
  Sharp-in-Vercel-route, no relying on `next/image`'s default optimizer).

### Bundle size
- Wrap heavy or rarely-visited components in `next/dynamic(() => import(...), { ssr: false })`:
  chart components (recharts), modals/sheets/drawers not needed on first paint, detail-page tabs
  other than the default tab.
- If a component you're dynamic-importing is re-exported through a barrel file (`index.ts`)
  alongside siblings that should stay eagerly loaded, import it directly from its own file instead
  of through the barrel — barrel re-export tree-shaking at a dynamic-import boundary isn't
  guaranteed, and can silently pull the whole barrel's contents into one chunk.
- Run `pnpm run analyze` before/after adding any new heavy dependency (charting, PDF generation,
  maps, rich text editors) to confirm it isn't bundled into a shared/initial chunk.

### Build tooling
- `tsconfig.json`'s `tsBuildInfoFile` must stay inside `.next/cache/` — that's the only directory
  Vercel's remote build cache is known to persist between deployments. If it ever gets removed or
  redirected elsewhere, every deploy's type-check goes cold (a flat ~30s regardless of change size,
  vs ~5s warm).

### Middleware
- `middleware.ts`'s route-matcher extension exclusions (`\.js`, `\.css`, `\.svg`, etc.) are a
  negative-lookahead regex that only matches paths *starting with* those literal strings — it does
  **not** exclude paths merely *ending* in those extensions. Any new root-level static public file
  (PWA manifest, service worker, etc.) must be added explicitly to `PUBLIC_PREFIXES`, or it will
  silently redirect to `/login` for unauthenticated requests.
