# Performance Upgrade — July 2026

> **Status:** Implemented, build-verified. Buyer-facing surfaces (catalog filters, image rendering,
> service worker registration) need a manual QA pass with a real authenticated buyer session —
> not verifiable headlessly in this environment.

## Context

`pnpm run build` was taking 1m45s–2m05s with occasional spikes to the high end tied to webpack
cache "Serializing big strings (101kiB/231kiB)" warnings. Separately, we wanted to know whether
build-speed fixes actually make the app *feel* faster to end users — they mostly don't, so work was
split into two buckets: deployment-speed (CI/build pipeline) and user-speed (real TTI/FCP), with the
buyer PWA on mobile 3G/4G/5G called out as the priority surface since that's where adoption and
stickiness are won or lost.

Findings came from 3 parallel codebase audits (build config, seller cockpit — 19 pages, buyer PWA)
followed by a design pass, then a full implementation pass where several of the audit's assumptions
were checked against the actual code and corrected before shipping.

## Bucket A — Deployment speed

### A1. Capped fully-unbounded seller SSR fetches
**Problem:** `products`, `brands`, `price-lists`, `cohorts` seller pages fetched their API with no
`limit` param at all — full tenant table on every page load.

**What we found on inspection:** `products` needed no change — its API route
(`app/api/tenant/products/route.ts`) already defaults to `PAGE_SIZE.SELLER` (50) when no `limit` is
passed. But `brands`, `price-lists`, `cohorts` turned out to have **zero pagination anywhere in the
stack** — no cursor support in the API, no infinite scroll in the client (plain `useQuery`, not
`useInfiniteQuery`). A naive `limit=50` on these would have silently truncated the list with no UI
to see the rest — a real regression, not a perf win.

**Fix shipped:** added a `.limit(500)` safety cap directly in the three API routes
(`app/api/tenant/brands/route.ts`, `app/api/price-lists/route.ts`, `app/api/cohorts/route.ts`),
bounding worst-case query cost while preserving the current full-list UX. Real pagination for these
three is a separate, larger initiative if a tenant ever exceeds 500 brands/price-lists/cohorts.

### A2. Oversized seller SSR limits
**Problem:** `customers` (limit=300), `estimates` (limit=500), `orders`/`invoices`/`catalogs`
(limit=200) all over-fetched relative to `PAGE_SIZE.SELLER=50`.

**What we found on inspection:** each of the 5 pages behaves differently, and the plan's original
assumption ("cap all 5, maybe seed an infinite-query cache") didn't hold up route by route:

| Page | Row array actually used for? | Safe to cut? |
|---|---|---|
| `customers` | Discarded — only `.kpis`/`.callouts` used, both from separate unbounded queries | ✅ Yes |
| `estimates` | "Today's read" panel reads rows from the same limited fetch | ❌ No |
| `invoices` | KPIs computed from the same limited row set | ❌ No |
| `catalogs` | No infinite scroll — SSR data *is* the displayed list; base query is DB-limited | ❌ No |
| `orders` | No infinite scroll — SSR data *is* the displayed list, client-sorted | ❌ No |

Only `customers` turned out to be genuinely safe: its list UI is powered by a fully separate
cursor-paginated query (`useCustomersLandingInfinite`) that never touches the SSR payload — the
300-row array from SSR was pure wasted serialization.

**Fix shipped:** `app/(seller)/customers/page.tsx` limit dropped 300→50
(`PAGE_SIZE.SELLER`). No infinite-query cache seeding was needed anywhere — every case where it
might have helped turned out to already be a non-issue (customers) or unsafe to touch without a
larger fix (estimates/invoices/catalogs/orders — flagged as follow-up work, not done here).

### A3. Bundle analyzer + dead Tailwind content globs
- Added `@next/bundle-analyzer` (pinned to a Next-15-compatible `^15.x`, not the auto-resolved `16.x`
  which mismatches our Next version), gated behind `ANALYZE=true`. Run via `pnpm run analyze`.
- Removed `./pages/**/*` from `tailwind.config.ts` (dead — App Router only, no `pages/` dir exists).
  Also removed `./components/**/*` — same reason, only `src/components/` exists.

### A4. Type-check build-cache miss (root-caused and fixed, not just investigated)
**Finding:** `tsc --noEmit` took a flat ~34s on every Vercel build regardless of what changed,
despite `incremental: true` in `tsconfig.json`.

**Root cause, verified locally:**
- Cold run (no `.tsbuildinfo`): ~23–28s.
- Warm run (`.tsbuildinfo` present from a prior run): ~4–6s — a **5.5x speedup**, proving incremental
  caching genuinely works when the file persists.
- But TypeScript was defaulting `tsBuildInfoFile` to the project root (`./tsconfig.tsbuildinfo`) —
  a location **outside** `.next/cache`, the only directory Vercel's remote build cache is known to
  restore between deployments (confirmed via "Restored build cache from previous deployment" in
  deployment logs, and via `.gitignore` showing `.next/` and `*.tsbuildinfo` are both untracked, so
  this is purely about Vercel's cache mechanism, not git).

**Fix shipped:** `tsconfig.json` — added `"tsBuildInfoFile": ".next/cache/tsconfig.tsbuildinfo"`.
Verified locally: cold 23.2s → warm 4.2s at the new path. Should now persist and give every
subsequent Vercel deploy a warm type-check, not just local runs.

## Bucket B — User speed (TTI/FCP), buyer PWA mobile priority

### B1. Cache-Control headers on all buyer API GET routes
**Problem:** every route under `app/api/buyer/*` returned a bare `NextResponse.json(...)` with zero
cache headers — full DB round-trip on nearly every buyer navigation, on 3G/4G India.

**Fix shipped:** new helper `src/lib/server/buyer-cache-headers.ts` exporting two header sets, both
`private` (never `public`/`s-maxage` — these responses are per-buyer, auth-gated via cookie; a
shared/CDN cache keyed only on URL would leak one buyer's data to another):
- `BUYER_CACHE_PERSONAL` (`max-age=30, stale-while-revalidate=120`) — home, orders, orders/[id],
  estimates, estimates/[id], invoices, invoices/[id], me, activity.
- `BUYER_CACHE_CATALOG` (`max-age=60, stale-while-revalidate=300`) — catalog, catalogs, categories,
  brands (less volatile, still buyer-visibility-scoped).

Applied to all 11 routes' success responses only — error/401/500 paths are correctly left uncached.

### B2. Pushed catalog category/brand filters into SQL
**Problem:** `app/api/buyer/catalog/route.ts` fetched ALL matching `tenant_products`, hydrated the
**entire** result set (image/price joins via `assembleBuyerCatalogItemsForProductIds`), then filtered
by `category_id`/`brand_id` in JS, then paginated. Full-catalog hydration on every filtered request
regardless of filter narrowness — duplicated in both the campaign-scoped and default branches.

**Fix shipped:** two new helpers, `resolveMasterProductIdsForCategory` and
`resolveTenantBrandIdsForMasterBrand`, push both filters into the `tenant_products` Supabase query
before hydration, in both branches. `allowedTenantBrandIds` (buyer visibility) and the requested
`brand_id` are intersected into a single `.in()` call rather than double-filtering. Pagination shape
(offset/limit) untouched — it was already correct.

**Needs manual QA:** filtered result counts should be spot-checked against pre-change behavior on a
tenant with a large catalog — this is a genuine query restructure, not a config tweak.

### B3. Image handling — corrected mid-implementation
**Original assumption (wrong):** "swap 2 raw `<img>` tags for `next/image`."

**What we actually found:** this app already has a presized-image pipeline
(`specs/image-upload-architecture.md`) — a Cloudflare Worker resizes every upload into
`thumb`/`small`/`medium`/`large`/`original` WebP variants at upload time, written to R2. Every other
buyer image component (`ProductCard`, `DiscoveryThumbTile`, `RecoCarousel`, `CatalogLookbookCard`,
`BuyerProductDetailClient`) already uses `next/image` with the `unoptimized` prop — deliberately
bypassing Vercel's runtime image optimizer, since it would burn through transform quota for zero
benefit (the Worker already produced the right size).

Traced `item.image_urls[0]` (the field the two raw `<img>` tags used) back to
`app/api/upload/tenant-product/route.ts` — confirmed it's populated with the **medium** (640×640)
R2-hosted WebP variant, not a raw original. So no backend/data-layer change was needed — just
matching the established rendering pattern.

**Fix shipped:**
- `app/(buyer)/buy/home/page.tsx` (reorder carousel) and `app/(buyer)/buy/cart/page.tsx` (cart line
  item) — converted raw `<img>` to `next/image` with `fill`, `unoptimized`, and a `sizes` hint
  matching the actual rendered slot (178px, 56px).
- Extended the existing `dynamic()` lazy-load pattern (already used for `AddProductSheet` etc.) to:
  - `BuyerNotificationDrawer` (buyer home page) — previously loaded eagerly, off critical path.
  - **7** seller detail-tab components using `recharts` — the original audit found 5, missed
    `LocationOverviewTab` and `CategoryOverviewTab`. Confirmed `SellerDashboardClient` does **not**
    use recharts at all (audit was wrong there — verified before touching, left untouched).
  - The `CustomerPerformanceTab` case required extra care: it was re-exported through a barrel file
    (`@/components/seller/customers/detail/index.ts`) alongside 3 sibling tabs. Dynamic-importing
    through a barrel risks pulling all 4 tabs into one chunk regardless of the `dynamic()` wrapper
    (barrel re-export tree-shaking isn't guaranteed) — switched the other 3 tabs to import directly
    from their own files instead, so the barrel is no longer referenced at all.

**Verified:** `/products/[id]` route First Load JS dropped from 485kB → 382kB (~100kB, consistent
with recharts being fully split out of the eagerly-loaded bundle).

### B4. PWA manifest + service worker
Per explicit decision: ship a basic service worker now (not defer to manifest-only), accepting the
added cache-invalidation risk, since it's scoped tightly enough to avoid the usual failure modes.

**`app/manifest.ts`** — Next.js native `MetadataRoute.Manifest`. `start_url: '/buy/home'`,
`scope: '/buy'` — this restricts PWA installability/navigation to the buyer surface even though
Next.js only supports one `manifest.ts` per app (served from app root, not scoped by route group).
Icons use the existing `public/brand/app-icon-copper.svg` (1024×1024, solid background) — no PNG
192/512 exports exist yet; SVG works for modern Chrome but dedicated PNG exports would improve
cross-browser reliability. Flagged, not blocking.

**`public/buyer-sw.js`** — hand-rolled, not `next-pwa` (real App Router / Next 15 compatibility risk
with that package, and it would have interacted with the bundle-analyzer webpack wrapping already
added in A3). Deliberately minimal scope to avoid the classic PWA failure modes:
- Caches **only** `/_next/static/*` — content-hashed by Next.js, so cache-first here has zero
  staleness risk (a new deploy always produces new URLs, never reuses old ones).
- **Never** caches navigation (HTML) — the standard "stuck on stale app shell after deploy" bug is
  structurally impossible here because HTML always goes straight to network.
- **Never** caches API responses or images — those are already handled by B1's headers and the R2
  presized-variant pipeline respectively; the SW doesn't duplicate or conflict with either.
- `CACHE_VERSION` constant + an `activate` handler that deletes any cache not matching the current
  version, so stale entries get pruned on the next SW update.

Registered via a small client component (`src/components/buyer/layout/BuyerServiceWorkerRegistration.tsx`)
mounted in `app/(buyer)/layout.tsx`, scoped to `/buy/`.

**Real bug found and fixed in the process:** `middleware.ts`'s route matcher excludes certain file
extensions (`\.js`, `\.css`, etc.) via a negative-lookahead regex — but that lookahead only matches
paths that **start with** those literal strings, not paths **ending in** them. Root-level static
files like `/buyer-sw.js` and `/manifest.webmanifest` were falling through and hitting the
auth-gated middleware logic, silently redirecting to `/login` for any unauthenticated request —
which would have made the manifest and service worker completely unreachable in production, since
browsers fetch both without necessarily having a buyer session cookie. Fixed by adding both paths
explicitly to `PUBLIC_PREFIXES` in `middleware.ts`, with a comment documenting why the regex
exclusions don't cover this case. Verified via curl post-fix: both now return 200 (were 307→`/login`
before).

**Verified:** manifest content correct, service worker file reachable with correct
`Content-Type: application/javascript`, build succeeds. **Not verified:** actual SW registration
inside a live authenticated buyer session — requires completing the buyer OTP login flow, not
feasible headlessly in this environment. Recommend a manual check via Chrome DevTools →
Application → Service Workers on a real buyer session before considering this fully shipped.

## What we deliberately did NOT do

- **Real pagination for brands/price-lists/cohorts** (A1) — the 500-row safety cap is a stopgap, not
  a fix. Needed only if a tenant approaches that scale.
- **Estimates/invoices/catalogs/orders SSR limit reduction** (A2) — all four have a genuine reason
  the current limit is load-bearing (KPI accuracy or no separate list-fetching query). Reducing any
  of them requires either splitting KPI computation from the row-limiting query (a real bug in
  `invoices`/`catalogs`/`estimates` today, arguably pre-existing — KPIs were already an
  approximation at the current limits for any tenant exceeding them) or building real infinite
  scroll for `orders`/`catalogs`. Both are separate initiatives.
- **Full offline/precaching PWA support** — the service worker here is speed-only (static asset
  cache), not an offline-first rebuild. No IndexedDB cart persistence, no background sync for failed
  order submissions, no offline catalog browsing.
- **PNG icon exports for the manifest** — using the existing SVG; works but PNG 192/512 with
  `purpose: maskable` would be more broadly reliable across Android launchers.

## Verification

- `pnpm run build` — clean, 0 errors, at every checkpoint through the implementation.
- `pnpm run type-check` — clean throughout.
- `pnpm run analyze` — generates `.next/analyze/{client,nodejs,edge}.html` treemaps.
- Bundle size diff: `/products/[id]` 485kB → 382kB First Load JS.
- Type-check cache: cold 23.2s → warm 4.2s, now persisted in `.next/cache/`.
- Manifest + service worker reachability confirmed via curl after the middleware fix.

### Still needed (manual, real buyer session required)
- Confirm B2's filtered catalog result counts match pre-change behavior on a tenant with a large
  catalog.
- Confirm B3's images render at the correct presized variant (Network tab: file should be
  `thumb.webp` or similar, small, `.webp` extension — not `original`).
- Confirm B4's service worker actually registers and activates on `/buy/home` in a real session
  (Chrome DevTools → Application → Service Workers), and that a deploy doesn't strand users on a
  stale app shell.
- Lighthouse / WebPageTest on a Fast-3G throttled mobile profile against `/buy/home`, `/buy/catalog`,
  `/buy/cart` — track LCP/FCP/TTI before/after as the metric that actually matters here.
