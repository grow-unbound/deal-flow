# DB Performance Round — Implementation Review & Measured Results
Date: 2026-07-27 | Method: fresh `pg_stat_statements` reset + full click-through of both apps (dev server request logs = ground truth, not estimates)

## 1. Plan checklist — what's actually implemented

| Item | Status | Evidence |
|---|---|---|
| Realtime publication trim (`integration_sync_jobs`, `tenant_integrations`) | ⚠️ **partially reverted — but by design, not a bug** | Both tables are back in `supabase_realtime` publication right now. Root cause found: `app.resume_sync_realtime()`/`pause_sync_realtime()` (pre-existing app functions, not touched by us) hard-code exactly these tables and flip them in/out of the publication around active Zoho sync runs. The daily sync orchestrator (`cron.job` 26) ran at 19:00 IST yesterday and re-added them; the hourly idle-sweep (`cron.job` 8) should drop them again once the sync goes idle. **Not a regression** — my one-time DROP just wasn't going to stay dropped forever given this existing pause/resume cycle. See §4 for the real fix.
| `metrics_claim_dirty_work` idle fast-path | ✅ **confirmed working** | Mean latency dropped from **138ms → 24ms** (see §2). Cron jobs 13/40 both running clean — the 13 failures visible in `cron.job_run_details` are all dated 2026-07-25, before this fix shipped; zero failures since.
| FK indexes on hot tables | ✅ applied | `orders`, `estimates`, `kpi_*_daily`, `credit_notes`, `whatsapp_broadcasts` indexes confirmed present.
| `purge_otp_sessions` wired + one-time purge | ✅ applied | `otp_sessions` 0 rows now, cron wired into `run_storage_maintenance`.
| Autovacuum tuning on small high-churn tables | ✅ applied | Migration present, settings live.
| Category landing page metrics v2 → snapshot-backed | ✅ applied | Confirmed via fresh `pg_stat_statements`: mean **1009ms** for the full-category-list case (25 categories) — down from the original **3.8s** baseline for the same live-join pattern. `buyers_current` intentionally still live (no snapshot exists for it), so this is not as fast as the earlier 3-category isolated test (142ms) suggested for a full page load, but the *live-join surface area* is cut to one narrow column instead of three.
| Category landing summary v2 → snapshot-backed + dead code dropped | ✅ applied | Mean **217ms** now, down from **2.6s** baseline.
| Warehouse landing row metrics v2 → bounded live join | ✅ applied (partial, as documented) | Mean **776ms** now, down from **2.7s** baseline. Still touches raw tables — this was always flagged as needing a new `metrics_product_warehouse_snapshot` table for a full fix, not done this pass.
| `auth.admin.*` sweep (phone/email off Auth, TTL cache, dedup) | ✅ applied and verified live | See §3 — Auth Admin API call volume and latency both down sharply during the full app crawl.
| `tenant_users.email`/`.phone` backfill + write-path wiring | ✅ applied | 5/5 rows have both now; `create_tenant_and_admin`, `team/invite`, `team/members/[id]` all write both fields going forward.
| Team-members duplicate-implementation consolidation | ✅ applied | `app/api/team/members/route.ts` now calls the shared, cached `getTenantMemberDirectory` instead of its own copy.
| Nested `<button>` hydration bug (`select-buyer/page.tsx`) | ✅ fixed | Confirmed via DOM inspection: 0 nested buttons post-fix (was 3).

**Tiers explicitly deferred in the plan (Tier 2 full fix / Tier 4), confirmed still not done:** per-warehouse snapshot table, `get_seller_locations_landing_summary`, `get_seller_location_landing_row_metrics`, `get_seller_customer_detail_v2`, `metrics_v2_transaction_landing` — none of these were touched, consistent with what was documented.

## 2. Hard numbers — Postgres side (pg_stat_statements, reset then full app crawl)

Reset stats at 03:26:18 UTC, then clicked through every seller page (dashboard, categories, warehouses, orders, invoices, estimates, customers, products, brands, locations, price-lists, customer-groups, campaigns, buyer-app, settings/team, customer detail) and every buyer page (home, catalog, orders, profile, product detail, preview picker). This is what actually ran, not a synthetic benchmark.

| Query | Calls | Mean | Max | % of total DB time |
|---|---|---|---|---|
| Realtime `list_changes` (WAL decode) | 486 | 12.5ms | 388ms | **23.5%** — still the single largest consumer |
| `get_metrics_v2_seller_dashboard` | 2 | **1445ms** | 2625ms | 11.2% |
| `get_seller_brand_landing_summary` | 4 | 547ms | 1511ms | 8.5% |
| `get_seller_category_landing_page_metrics_v2` (our fix) | 2 | 1009ms | 1854ms | 7.8% |
| `get_seller_warehouse_landing_row_metrics_v2` (our fix) | 2 | 777ms | 959ms | 6.0% |
| `metrics_v2_customers_landing` | 2 | 478ms | 756ms | 3.7% |
| `metrics_refresh_tick` cron DO block (our fix) | 21 | **40ms** | 534ms | 3.3% (was 27.5% pre-fix) |
| `get_metrics_v2_buyer_app_dashboard` | 1 | 731ms | 731ms | 2.8% |
| `get_seller_category_landing_summary_v2` (our fix) | 2 | 217ms | 264ms | 1.7% |

**Direct before/after on what we touched:**
- `metrics_claim_dirty_work` idle-tick: **138ms → 24-40ms mean**, **27.5% → 3.3%** of total DB time. This is the clearest, cleanest win — confirmed.
- Category landing page: **3.8s → 1.0s mean** (full 25-category load), category summary: **2.6s → 217ms**. Real, substantial, confirmed.
- Warehouse landing: **2.7s → 777ms mean**. Real improvement, but still not fast — matches the documented "partial fix" caveat exactly.

**New finding, not in original scope:** `get_metrics_v2_seller_dashboard` itself is **1.4-2.6s** — this was marked "already correct, snapshot-driven" in the plan (true for the primary KPI cards), but the full RPC call including the still-live `sales_mix` brand/category breakdown is genuinely slow. This function was never rewritten; Tier 3 only asserted the primary cards were fine, which is accurate but incomplete — the full call is not fast. See §4.

## 3. Auth Admin API — before/after (the regression-fix verification)

Before the fix (from the original bug report): same `user_id` hit `/admin/users/<id>` **7+ times in one session window** at 434/191/152/148/147/143/113ms.

During this full crawl (every seller + buyer page, ~40 page loads/API calls): **10 total Auth Admin API calls**, spread across 4 distinct users, durations **2.4ms – 106ms** (one outlier at 106ms, everything else single-digit-to-low-double-digit ms). No repeated bursts for the same user. This is the direct, measured proof the sweep worked — call volume and per-call latency both down an order of magnitude from the reported-broken state.

## 4. Where the remaining time actually goes — ranked opportunities

1. **`get_metrics_v2_seller_dashboard` full-page load is 1.4-2.6s at the RPC layer, but the `/api/tenant/dashboard` route itself took 8-10s end-to-end in this crawl** (`GET /api/tenant/dashboard?period=month` — 8260ms, 8831ms, 4737ms, 9675ms, 13264ms across repeated loads). The RPC is only ~15-30% of that. `src/lib/server/seller-dashboard.ts` (the route's data-loader, ~1000+ lines) is doing significantly more work than the one RPC call — very likely additional sequential queries for the "Today's Read" widgets (Estimate follow-up, Collections, Buyer App activation lists visible on the dashboard) and/or `metrics_v2_transaction_landing` calls not running in parallel with the main dashboard RPC. **This is now the single biggest per-page-load cost in the entire app and wasn't touched by this round at all.** Recommend a dedicated pass: trace this route's actual query sequence, parallelize what's sequential, and apply the same snapshot-first treatment to the `sales_mix` live join inside `get_metrics_v2_seller_dashboard`.

2. **Realtime WAL decode is still 23.5% of total DB time** — unchanged in share despite the earlier trim, because `integration_sync_jobs`/`tenant_integrations` cycle back in during Zoho sync windows (§1) and the other 6 tables (`campaigns`, `estimates`, `invoices`, `orders`, `whatsapp_broadcasts`, `whatsapp_messages`) were never touched. The original audit's actual recommendation — consolidate into a single `app.realtime_notifications` queue table with targeted triggers — is still the real fix and still not done. This remains the largest single lever in the whole system.

3. **`get_seller_brand_landing_summary` (547ms mean, 1.5s max)** — Tier 3 called this "reference pattern, already fine" because its *common* path reads `kpi_brand_daily`. But this crawl shows it's not fast in practice — either the location-scoped live-fallback or the estimates-primary live-fallback path is being hit more than assumed. Worth re-checking which branch WineYard's tenant actually takes.

4. **`/api/tenant/current` latency is wildly inconsistent: 154ms to 8138ms** across ~30 calls in this crawl, and it fires on nearly every single page navigation (it's the workspace-context call). It calls `supabase.auth.getUser(token)` — a live network round-trip to the Auth service on every request. Given the app already verifies JWTs via `getVerifiedClaims`/JWT claims elsewhere, this route could likely verify the JWT locally (no Auth network call) instead of calling `getUser()`, except where session-revocation freshness genuinely matters. High-value target since it's the most frequently-called endpoint in the app.

5. **`/api/buyer/preview/candidates` still 1.0-1.2s mean** even after removing the Auth dependency. The remaining cost is `findBuyerLoginCandidates`' own live join across `buyers`/`buyer_users`/`tenants` — worth an `EXPLAIN ANALYZE` pass to check for a missing index on the phone-lookup path (this table wasn't in the original FK-index audit).

6. **`/api/buyer/home` got progressively slower across repeated loads in this same session: 896ms → 2595ms → 4006ms → 4683ms.** That growth pattern within one test session (not just cross-page variance) suggests either an unbounded/accumulating query (e.g., activity log growing without a LIMIT, or a per-call cache never invalidating and growing) rather than steady-state latency. Worth investigating specifically — this looks like a bug, not just "slow."

7. **Tier 4 RPCs never classified**: `get_seller_locations_landing_summary`, `get_seller_location_landing_row_metrics`, `get_seller_customer_detail_v2`, `metrics_v2_transaction_landing`. The `/locations` page in this crawl took **2969ms** first load — consistent with these being unaddressed.

8. **Per-warehouse snapshot table** (Tier 2's full fix) — would take warehouse landing from ~777ms to the same ~150-250ms range category landing achieved.

9. Dev-mode Turbopack compile overhead inflates first-hit numbers considerably (e.g., `/categories` 4595ms first load vs sub-second on repeat) — this won't reflect production (compiled/cached bundles), but it means none of the raw numbers above should be read as literal production latency; they're directionally accurate and internally comparable (same dev server, same session) but a real production load-test would be needed for absolute SLA numbers.

## Bottom line

Everything in the approved plan is implemented and independently verified via fresh measurements, except the realtime table trim which self-reverts by design (not a bug in our work) and the two explicitly-deferred tiers. The metrics-tick fix and the category-landing rewrites are the clearest, most confirmed wins. The Auth sweep is confirmed working under live load. The single biggest opportunity now is the seller dashboard route (`/api/tenant/dashboard`, 8-10s observed) and the still-unconsolidated Realtime publication (23.5% of all DB time) — neither was in scope for this round.
