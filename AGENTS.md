# DealFlow — Project AGENTS.md

## Product in One Line
Distributor command center: manage multibrand catalogs, publish cohort-specific pricing to retailers, capture orders via a buyer PWA. Target: Indian SMB multibrand distributors.

---

## Tech Stack (locked — do not debate)
| Layer | Choice |
|---|---|
| Framework | Next.js App Router + React + Tailwind + shadcn/ui |
| Validation | Zod — shared client + server, single type source |
| Backend | Supabase (Postgres + RLS + Auth + pgvector) |
| Business logic | Postgres RPCs/functions. Defer Vercel serverless until logic outgrows DB |
| Search | PG full-text (tsvector + GIN) + pgvector hybrid. No Typesense until post-PMF |
| File storage | Cloudflare R2 via S3-compatible API |
| Analytics + flags | PostHog (product analytics + feature flags) |
| Background jobs | Supabase pg_cron + scheduled functions |
| Hosting | Vercel |
| Email | Resend |
| WhatsApp OTP | Meta Cloud API via AiSensy/Interakt |
| Observability | PostHog + Sentry |

---

## Project Structure
```
dealflow/
├── app/                          # Next.js App Router
│   ├── (auth)/                  # Auth routes
│   ├── (seller)/                # Distributor seller routes (dashboard, brands, products, buyers, cohorts, price-lists, catalogs, orders, exports, settings)
│   ├── (buyer)/shop/            # Buyer PWA routes (home, catalog, orders, profile + deep: product/[id], cart, checkout)
│   ├── api/                     # API routes & RPC wrappers
│   ├── layout.tsx
│   └── globals.css
├── src/
│   ├── components/              # Reusable UI components
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── layout/             # Layout components (sidebar, nav, shells)
│   │   ├── seller/             # Distributor seller features (was: cockpit/)
│   │   └── buyer/              # Buyer app components
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client & auth helpers
│   │   ├── zod.ts              # Shared Zod schemas
│   │   └── utils.ts            # Utilities
│   ├── hooks/                  # React hooks (useQuery, useAuth, etc.)
│   ├── contexts/               # React contexts (AuthContext, TenantContext)
│   ├── types/                  # TypeScript types (generated from Zod)
│   ├── constants/              # Feature flags, roles, etc.
│   └── styles/                 # Tailwind config, design tokens
├── supabase/
│   ├── migrations/             # SQL migrations (schemas, RLS, functions)
│   ├── seed.sql                # Master catalog seed data
│   └── functions/              # Edge functions (create-user, batch-assignments, etc.)
├── public/                      # Static assets
├── .env.example
├── .env.local                   # Git-ignored local secrets
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── AGENTS.md                    # This file
```

---

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

---

## Backend & Data-Fetching Performance Standard
Full rationale and worked examples: `specs/performance-upgrade-2026-07.md`. These rules exist because
each one was a real bug or real regression risk found and fixed in the July 2026 performance pass —
follow them for all new development, not just when explicitly asked to optimize.

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

### Metrics aggregation standard
- The metric dictionary in `specs/metrics-definitions-2026-07.md` is the source of truth for KPI
  semantics, status inclusion, date grain, location scope, and null/zero behavior.
- KPI cards, page headers, dashboard totals, and table-row aggregate fields must read from
  `app.*_snapshot`, `app.kpi_*_daily`, or a documented aggregate-backed RPC/read model. Do not
  recompute those metrics from the visible page slice, an optimistic row cache, or a route-local
  unbounded relational query.
- Use canonical document dates and IST boundaries for period metrics: orders use `order_date`
  falling back to `created_at`, invoices use `invoice_date` falling back to `created_at`, and
  estimates use `estimate_date` falling back to `created_at`.
- Use shared database status helpers for metric inclusion, especially
  `app.order_status_in_flow`, `app.order_status_is_open`,
  `app.invoice_status_has_receivable`, and `app.invoice_is_overdue`. Do not duplicate status arrays
  in frontend code or API routes.
- Seller-assistant views must preserve location scoping from the aggregate contract. A location KPI
  cannot be silently replaced by a tenant total, and tenant totals cannot be inferred from a
  location-filtered page.
- Bounded relational queries are allowed only for detail previews, recent activity, and drill-down
  rows. If a KPI needs an aggregate that does not exist yet, document the exception in
  `specs/metrics-aggregation-execution-log-2026-07.md` instead of hiding page-slice math in the
  route.
- Optimistic UI may update row state, but aggregate KPI totals must come from a refetch or an
  aggregate response. Do not optimistically replace aggregate totals from the current page rows.
- `app.kpi_product_daily.on_hand` is a current inventory posture copied into daily facts, not a
  historical stock trend, until an inventory movement ledger exists.
- Metrics changes require targeted tests for status edges, canonical date fallbacks, sparse/no-data
  behavior, and multi-line order joins whenever those paths are touched.

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

---

## Database: Three Schemas
- **`auth`** — Supabase-managed identity (system-owned)
- **`catalog`** — Master brands, products, categories. Reusable across tenants. `is_public = true` is global-readable.
- **`app`** — All tenant business data. RLS-enforced per tenant.

### Mandatory conventions on every table
- PK: `id uuid default gen_random_uuid()`
- Audit: `created_at`, `updated_at`, `created_by`, `updated_by` — non-negotiable
- Soft-delete: `deleted_at timestamptz` (never hard-delete business data)
- ERP mapping: `external_ref text` — unique per `(tenant_id, external_ref)`
- All FKs: `ON DELETE RESTRICT` — never cascade business data

### Metrics V2 operational table exception
- Metrics V2 dirty-work, lease, runtime-control, refresh-state, and execution-history tables are operational coordination tables, not business records.
- These tables must still carry tenant ownership where applicable, timestamps, explicit RLS/service-role access, bounded retention, and schema-qualified `app` DDL.
- They are explicitly exempt from `external_ref`, business audit columns (`created_by`, `updated_by`), and soft-delete (`deleted_at`) so queues, leases, and run history can be pruned or hard-deleted by retention jobs without accumulating operational bloat.
- This exception is narrow: business-facing metric snapshots and read models still follow the mandatory business table conventions above unless a later approved plan records a separate exception.

### Key `app` tables
- `tenants` → `tenant_users` → `tenant_brands` → `tenant_products` → `tenant_inventory`
- `buyers` → `buyer_users` → `cohorts` → `cohort_members`
- `price_lists` → `price_list_items` → `price_list_assignments`
- `published_catalogs` → `published_catalog_items`
- `orders` → `order_items`
- `audit_log` (append-only, every entity mutation)

### Pricing resolution
Single function `app.resolve_price(tenant_product_id, buyer_id, qty)` → evaluates in order:
1. Catalog `price_override` → 2. Buyer price lists (highest priority + valid window) → 3. Cohort price lists → 4. `all_buyers` → 5. `base_selling_price`

---

## Tenancy Model
- **Tenant = Distributor.** One business = one tenant. Subdomain: `{slug}.dealflow.in`
- **Buyers belong inside a tenant** — not tenants themselves
- One auth user can link to multiple buyers across multiple tenants (via `buyer_users` join table)
- JWT claims carry `tenant_id`, `buyer_id` (nullable), `role` — verify on every request

---

## RBAC: Four Roles
`seller_admin` | `seller_assistant` | `buyer_admin` | `buyer_assistant`

- Seller roles manage brands, products, cohorts, catalogs, orders, Tally export
- `seller_admin` only: settings, users, cost prices, cohort/price-list management
- Buyer roles browse catalogs and place orders only
- Sensitive ops (publish catalog, status change, Tally export) go through `SECURITY DEFINER` RPCs — role double-checked inside DB function

---

## Feature Flags (PostHog — non-negotiable)
Every major feature ships behind `df_<module>` flag. Default off until tenant pilot passes.

Modules: `df_tenant_onboarding`, `df_brand_product_master`, `df_customer_master`, `df_cohorts`, `df_pricing_engine`, `df_catalog_publishing`, `df_buyer_app`, `df_order_management`, `df_search`, `df_tally_export`, `df_zoho_integration`

Phase-2 scaffolded off: `df_ai_intake`, `df_replenishment`, `df_payments`

**Rules:** Gate both UI and RPC. Support per-`tenant_id` targeting. Every flag has owner + removal date.

---

## Two Interfaces

### Distributor Cockpit
URL: `{slug}.dealflow.in` — desktop-first, left sidebar nav with 10 nav items (Dashboard, Brands, Products, Customers, Cohorts, Price Lists, Catalogs, Orders, Exports, Settings). Footer: user avatar + name + role + logout (pinned with `mt-auto`).

### Buyer PWA
URL: `shop.dealflow.in/{share_token}` — mobile-first, WhatsApp OTP auth (no passwords). Two modes: tokenized (share link → OTP → order) and authenticated (persistent session).

**Tab bar (4 primary tabs):** Home / Catalog / Orders / Profile
**Deep screens (no tab bar):** Product detail, Cart, Checkout, Order Placed

- **Home** — KPI grid (annual spend, open orders, credit limit), distributor list, "order again" horizontal scroll, new catalogs, recent activity
- **Catalog** — search, location/delivery picker, filter chips, catalogs scroll, category grid, brand chips, product grid
- **Orders** — sub-tabs (Orders / Enquiries / Invoices), status filter chips, order cards
- **Profile** — avatar head, account card (business/GSTIN/credit/delivery), preferences, logout

All primary buttons: lucide icon (left, 16px) + text label. Never icon-only for CTAs.

---

## MVP Scope — Build This
1. Tenant onboarding + subdomain routing
2. Brand & Product master (CRUD + CSV import + R2 image upload)
3. Customer (Buyer) Master — CRUD + CSV import. **Ships before cohorts.**
4. Cohort builder — rule-based + static lists + preview count
5. Custom pricing per cohort + `resolve_price()` RPC
6. Catalog publishing — draft → publish → share_token
7. Buyer PWA — WhatsApp OTP, catalog browse, cart, order placement
8. Distributor cockpit — brands, products, customers, cohorts, catalogs, orders
9. Order management — status workflow (draft → received → confirmed → dispatched → delivered → cancelled)
10. Tally CSV export (Item Master, Sales Voucher, Ledger Master CSVs)
11. Zoho Books/Inventory connector — piloted on WineYard tenant first, behind `df_zoho_integration`
12. PG full-text + pgvector hybrid search via `app.search_products(tenant_id, query, filters)` RPC

## Not In MVP — Defer Ruthlessly
AI multimodal intake, replenishment forecasting, payment reconciliation, live Tally/Busy API, returns management, trade promotions, brand-side dashboards, Typesense, webhooks.

---

## WineYard (First Customer)
CCTV products distributor. On Zoho. The Zoho integration is the conversion wedge — removes their main objection to switching. Pilot the `df_zoho_integration` flag on WineYard's tenant. Goal: convert to ₹50-75K/mo Scale-tier SaaS package.

---

## Security Non-Negotiables
- 5 cross-tenant isolation tests on day 1 — run on every PR
- Run security tests with feature flags both on and off
- Never trust client-supplied `tenant_id` — always verify membership from JWT
- RLS on all `app.*` tables; `catalog.*` enforces `is_public` + `origin_tenant_id`

---

## Development Setup

### Prerequisites
```bash
node >= 18
npm (or bun)
```

### Local Setup
```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local

# 3. Run migrations on Supabase (see supabase/migrations/)
# Use Supabase dashboard or CLI

# 4. Seed master catalog (see supabase/seed.sql)

# 5. Start dev server
npm run dev

# App runs at http://localhost:3000
```

### Environment Variables (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=<project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_KEY=<service-role-key>

NEXT_PUBLIC_POSTHOG_KEY=<posthog-project-key>

CLOUDFLARE_ACCOUNT_ID=<r2-account-id>
CLOUDFLARE_API_TOKEN=<r2-token>

RESEND_API_KEY=<resend-api-key>

NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID=<aisemsy-phone-id>
AISEMSY_AUTH_TOKEN=<aisemsy-token>

ZOHO_CLIENT_ID=<zoho-oauth-client-id>
ZOHO_CLIENT_SECRET=<zoho-oauth-secret>
```

---

## Build Sequence (12 weeks)
Wk 1: Setup, schemas, RLS, auth, PostHog/flag scaffold, Zod base schemas
Wk 2: Design system tokens → Tailwind/shadcn, layout shells, sidebar
Wk 3: Brands + products CRUD + CSV import + R2 images
Wk 4: Customer Master → Cohorts (rule engine + preview)
Wk 5: Price lists + `resolve_price()` + tests
Wk 6: Catalog publishing flow + share_token
Wk 7: Buyer PWA shell + WhatsApp OTP
Wk 8: Cart + checkout + order placement
Wk 9: Orders cockpit (list, detail, status, invoice PDF)
Wk 10: PG FTS + pgvector search
Wk 11: Tally CSV export + Zoho integration (WineYard pilot)
Wk 12: Cross-tenant security tests, onboarding polish, first paid customer

---

## Supabase Conventions

### Migration workflow
- **Always create migration files via CLI:** `supabase migration new <descriptive-name>` — never create or name migration files manually. The CLI generates the correct `YYYYMMDDHHMMSS_<name>.sql` timestamp format.
- **Never create schema changes directly in the Supabase dashboard.** If an emergency dashboard change is explicitly authorized, immediately capture it with the linked remote CLI, review the generated migration, and reconcile migration history before further work.
- This repository uses the hosted **`yukti-dev`** Supabase project (`hcpzbnmumbykdqveyjhr`, ap-northeast-2) for all development, migration validation, SQL tests, seeds, auth/setup work, function deployment, integration tests, and load tests. Agents must not use the local Docker stack and must not run or require `supabase start`, `supabase db reset --local`, `supabase test db --local`, or another Docker-dependent Supabase workflow.
- The **`yukti-prod`** project (`cckmurgapnkytbzxqesp`, ap-south-1 / Mumbai, created 2026-08-31) is production. **Never** run SQL, tests, migrations, seeds, function/config/auth/storage changes, `--linked` commands, or `db push` against it. Production access requires a separate explicit user authorization naming the exact production action; Phase 8 authorization must not be inferred from earlier development approval. The main checkout may still be linked to `yukti-prod` — never trust that link.
- Use the official `SUPABASE_DB_PASSWORD` variable from `.env.local` for linked remote CLI commands (fall back to `DATABASE_PASSWORD` if that is the only db password present). Never print, echo, log, inline in a command, or commit its value. (`SUPABASE_PASSWORD` is not the project variable.)
- Before **every** `--linked` inspection, test, dry-run, or push, read the current linked project ref and require it to equal `hcpzbnmumbykdqveyjhr`. Project refs are safe to record; credentials are not. Stop on any mismatch — especially `cckmurgapnkytbzxqesp`. Use a verified temporary Supabase project directory/workdir linked to `yukti-dev`; never rely on another session's link state. Never `db push` to `yukti-prod`.
- Read-only inspection and SQL behavior tests may use `npx supabase db query --linked --file <file>`. Wrap mutation-shaped validation in `BEGIN ... ROLLBACK`, use isolated fixtures, and verify that no persistent business data changed.
- Before a persistent remote migration, run `npx supabase migration list --linked` and `npx supabase db push --linked --dry-run`. A real `npx supabase db push --linked` requires explicit user approval. Verify migration history, RLS, grants, advisors, and focused tests afterward.
- Never run `supabase db reset --linked`, remote destructive cleanup, or `supabase migration repair` unless the user explicitly authorizes a documented recovery procedure.
- Cross-connection, API, Cron, sync, or load tests that cannot run inside a rolled-back transaction use `yukti-dev` with deterministic isolated seed data. Never fall back to `yukti-prod` because the development environment is unavailable.

### Local storefront hosts (no Vercel, no `/etc/hosts`)
Browsers resolve `*.localhost` to `127.0.0.1`. With `pnpm dev`, use:
- Seller: `http://app.localhost:3000`
- Tenant storefront: `http://{slug}.localhost:3000` (e.g. `http://wineyard.localhost:3000`)
- Unscoped seller (legacy): `http://localhost:3000`

Do not add hosts-file entries, `lvh.me`, or nip.io unless those hostnames already exist. Going live is `app.catalogs.live_at` (plus `pricing_mode`); unpublished hosts render `/not-live`.
- For newly created Data API objects, explicitly verify schema exposure, grants, and RLS; do not assume a new table is automatically API-accessible.

### Always qualify schema names
Every SQL statement — in migration files, seed files, RPC definitions, Edge Functions, and application code (Supabase JS client calls) — **must explicitly name the schema**. This project uses three schemas (`auth`, `catalog`, `app`) and ambiguity causes silent bugs.

```sql
-- ✅ correct
SELECT * FROM app.tenants WHERE id = $1;
INSERT INTO catalog.brands (name) VALUES ($1);
CREATE FUNCTION app.resolve_price(...) ...

-- ❌ wrong — schema is implicit and fragile
SELECT * FROM tenants WHERE id = $1;
```

In application code, always pass `{ schema: 'app' }` or `{ schema: 'catalog' }` explicitly on the Supabase client:
```ts
// ✅ correct
supabase.schema('app').from('tenants').select('*')

// ❌ wrong — defaults to public, which has no tables
supabase.from('tenants').select('*')
```

---

## Workflow Rules (from parent project)
- Explore first, plan before coding. Use plan mode for anything touching >2 files.
- Always verify your work. After every code change in a session, run `npx tsc --noEmit` and the focused Vitest files that cover the change (or `pnpm exec vitest run <paths>`). Do not declare done while either is failing. Broaden tests when the change is cross-cutting (auth, middleware, catalog, pricing). Show a diff when there is no test surface.
- Use subagents for investigation tasks. Do not bloat main context with file reads.
- Commit frequently with descriptive messages. Always create a PR, never push to main.
- Agent commits must not hang on an interactive signing prompt. Default to `git -c commit.gpgsign=false commit ...` without changing repository or global Git configuration.
- A signed commit is allowed when the existing SSH signing key is already available non-interactively through macOS Keychain/`ssh-agent`; agents may load already-stored keys with `ssh-add --apple-load-keychain`. Never request, extract, print, or store a key passphrase or private-key material; fall back to the per-command unsigned form unless signing was explicitly required.

---

## Key First Steps
1. ✅ Initialize git repo
2. ✅ Create package.json
3. ⏳ Create `.env.example`
4. ⏳ Create Supabase project & generate migrations
5. ⏳ Set up Next.js config (tailwind, zod schemas)
6. ⏳ Create auth/tenant routing scaffold
7. ⏳ Seed catalog master data
8. ⏳ First PR: auth + tenant subdomain routing
