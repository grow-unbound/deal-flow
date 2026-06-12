# yukti Performance Playbook

## What Was Slowing The App
- Client-side auth/workspace bootstrapping blocked first paint, producing a blank/loading phase before meaningful skeletons.
- Multiple seller landings were client-fetch-first, delaying content until hydration + browser fetch finished.
- Hot APIs (products/catalogs/customers/orders) did large fan-out queries and in-memory aggregation.
- Feature-flag checks incurred repeated runtime overhead without caching.
- Middleware and fetch/auth patterns added avoidable per-request work.

## High-Impact Fixes Implemented
- Server-side seller route guard in layout; removed client auth gate for seller shell.
- Server-first initial-data wrappers for seller landings:
  - orders, catalogs, products, customers, cohorts, price-lists.
- Code-split heavy landing dialogs/forms (customers + price-lists) so initial bundles avoid form-heavy dependencies.
- Token caching in `src/lib/api-fetch.ts` to avoid repeated `getSession()` calls.
- Flag caching + singleton PostHog client in `src/lib/flags.ts`.
- Added `Server-Timing` on key APIs for latency visibility.
- Added near-real-time KPI aggregation migration (`app.kpi_tenant_daily`, `app.kpi_product_daily`) with triggers and backfill.
- Shifted products API MTD/prev-MTD metrics to `kpi_product_daily` reads.
- Reduced heavy query scopes in catalogs/customers APIs.

## How To Measure Quickly
1. Start app:
   - `npm run dev:turbo`
2. Capture an authenticated cookie from browser devtools.
3. Run smoke benchmark:
   - `PERF_BASE_URL=http://localhost:3000 PERF_COOKIE='sb-...=...' PERF_ROUNDS=5 node scripts/perf-smoke.mjs`
4. Track these over time:
   - API client p50/p95
   - `Server-Timing` p50/p95
   - Route transition latency for seller pages

## Suggested Next Steps
- Move remaining heavy detail endpoints to aggregate-table reads where possible.
- Add a daily reconciliation job for KPI tables via `pg_cron` (already scaffolded pattern).
- Add pagination/cursoring to large detail lists where still unbounded.
- Capture baseline and post-change timings in PR notes for every perf change.
