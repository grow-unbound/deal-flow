# Yukti (hcpzbnmumbykdqveyjhr) — DB Performance Audit
Date: 2026-07-26 | Scope: Postgres/Supabase layer only | No changes applied — recommendations only

## TL;DR — where the time actually goes

Total DB time accounted for in `pg_stat_statements` (recent window), top consumers:

| Source | % of total DB time | Calls | Total time |
|---|---|---|---|
| `app.metrics_refresh_tick` cron DO block (job 13, every **15s**) | **27.5%** | 42,669 | 5,919,292 ms |
| Realtime WAL polling (`wal->>...` / `realtime.list_changes` pattern) | **25.2%** | 523,865 | 5,433,782 ms |
| PostgREST schema-cache introspection (`pg_timezone_names`, `pg_publication`, table/column introspection) | ~8% | ~2,600 | ~2,300,000 ms |
| `get_*_landing*_v2` / `get_metrics_v2_*` dashboard RPCs (combined) | ~9% | ~2,100 | ~1,900,000 ms |
| Everything else (actual product queries: orders, invoices, buyers, etc.) | **< 25%** | — | — |

**Over half of all database time is background/infra overhead — cron tick + Realtime — not user traffic.** This is the single biggest lever for the sub-50ms goal, and it costs nothing to fix (no schema changes, no new infra).

---

## 1. Auth Endpoint Bottlenecks & Client Refresh Loop

**Evidence:**
- `auth` logs show the same buyer JWT (`actor_id e2a1b2f2-...`, tenant "Quantum Security Systems") issuing repeated `token_refreshed` events back-to-back within the same short log window — classic symptom of a client-side refresh loop (token refreshed more often than its TTL should require), not of legitimate re-auth.
- `/admin/users` (i.e. `supabase.auth.admin.listUsers()` or similar) appears in the logs at **189ms–483ms** per call. Multiple calls per short window from the same `remote_addr` (`13.204.72.130`) — this is a server-side call (Next.js API route/middleware), not a browser.
- No `auth.users` is queried directly in RLS policies — confirmed `app.buyers`, `app.buyer_users`, `app.tenant_users` RLS policies use `app.jwt_tenant_id()` / `app.jwt_buyer_id()` (JWT-claim helpers, not DB lookups). **This part is already correctly designed** — no index/RLS fix needed here.

**Root cause:** the cost isn't in Postgres — it's app-layer code calling `supabase.auth.admin.listUsers()` (or similar) inside a hot path (likely middleware or a server component resolving "current user" on every request), each call costing 200-500ms against the Auth service, plus a refresh loop multiplying token endpoint traffic.

**Recommendations (no DB migration needed):**
1. Grep the codebase for `auth.admin.listUsers` / `auth.admin.getUserById` in `middleware.ts` and any server route — replace with a lookup against `app.tenant_users`/`app.buyer_users` (already tenant-scoped, RLS-protected, and indexed) instead of the Auth admin API.
2. Audit the client Supabase client config for `autoRefreshToken`/`persistSession` — check for multiple `createClient()` instances (a common cause of duplicate refresh timers) instead of one singleton per browser tab.
3. Enable **leaked password protection** (flagged by security advisor, zero cost, one toggle in Auth settings) — unrelated to perf but free to fix while in Auth settings.

---

## 2. Background Worker & Lock Contention — `app.metrics_refresh_tick`

**Confirmed exactly as suspected — and worse than 31% CPU implies at the query level:**
- `cron.job` 13 runs the tick **every 15 seconds** (`schedule: '15 seconds'`), executing a claim → compute → acknowledge → (fail/release on error) cycle every time, unconditionally.
- `cron.job` 40 (`app.membership_refresh_tick()`) runs every **30 seconds**, same pattern.
- Combined: 42,669 calls of the metrics tick DO block totaling **5.9M ms** (~98 minutes of cumulative DB time), 27.5% of all tracked DB time — for a job that should be near-instant when there's nothing to refresh.
- No blocking locks observed at snapshot time (`pg_stat_activity` wait_event_type='Lock' = 0), so it's CPU/IO churn, not deadlocks — consistent with "unnecessary writes/claims on every tick even when idle."

**Recommendation (SQL-level, not applied):**
- Add an early-exit guard at the top of `app.metrics_refresh_tick('claim', ...)`: `SELECT 1 FROM app.metrics_dirty_work WHERE ... LIMIT 1` (or equivalent pending-work check) and `RETURN` immediately with zero writes if nothing is pending — before acquiring any advisory lock/row lock for the claim.
- Same pattern for `app.membership_refresh_tick()` against `app.membership_dirty_work`.
- Change cron cadence from fixed 15s/30s to **event-driven**: have the write path (order/invoice/estimate insert triggers) `NOTIFY` or flip a "dirty" flag, and only run the tick cron every 60-120s as a backstop sweep, or use `pg_cron`'s ability to skip runs when a lightweight guard function returns false. This alone should cut that 27.5% down by an order of magnitude on quiet tenants.
- Add index support to whatever `metrics_dirty_work`/`membership_dirty_work` predicate the claim query uses (both currently have RLS enabled but **no policies** — see Security note below — so they're also unreachable by anon/authenticated roles today, meaning risk is currently contained to `SECURITY DEFINER` internal calls only).

---

## 3. Realtime Replication & WAL Overhead

**Confirmed — this is the #2 single cost center, larger than any user-facing query class:**
- The `wal->>...` decoding query (Realtime's logical-replication polling) has **523,865 calls / 5.43M ms total / 10.4ms mean** — 25.2% of all DB time.
- Tables currently in `supabase_realtime` publication: `campaigns`, `estimates`, `integration_sync_jobs`, `invoices`, `orders`, `tenant_integrations`, `whatsapp_broadcasts`, `whatsapp_messages` — **8 tables**, including high-write-volume ones (`orders`, `invoices`, `estimates`, `integration_sync_jobs` — which is also the heartbeat table taking 26,039 UPDATE calls).

**Root cause:** every WAL change on any of these 8 tables gets decoded and evaluated per Realtime subscriber-check, regardless of whether anyone is actually listening on that channel/row. With `integration_sync_jobs.heartbeat_at` updating every few seconds per active sync job, that alone generates continuous WAL traffic feeding the Realtime decoder.

**Recommendations:**
1. **Drop `integration_sync_jobs` and `tenant_integrations` from the Realtime publication immediately** — these are backend-orchestration tables with no legitimate case for client-side subscriptions; the heartbeat UPDATE loop is pure WAL noise. `ALTER PUBLICATION supabase_realtime DROP TABLE app.integration_sync_jobs, app.tenant_integrations;`
2. For `orders`/`invoices`/`estimates`/`whatsapp_*`/`campaigns`: confirm which ones actually have an active client-side `.channel().on('postgres_changes', ...)` subscriber in the frontend. Per the architecture doc's stated plan, consolidate to **one lightweight `app.realtime_notifications` queue table** (id, tenant_id, entity_type, entity_id, event_type, created_at) written by targeted triggers on the source tables, with only *that single table* in the Realtime publication. This turns "N tables × every column change" WAL decoding into "1 row insert per meaningful event," which is both cheaper to decode and cheaper for clients to filter (single channel, `tenant_id` predicate).
3. If full row payloads aren't needed by subscribers, set `REPLICA IDENTITY DEFAULT` (not `FULL`) on these tables to shrink WAL payload size — check current replica identity; `FULL` on wide tables (`invoices`, `orders`) multiplies WAL volume unnecessarily.

---

## 4. Landing & Dashboard RPC Query Plans

Per your note: **no changes to v2 aggregation-table schema** — findings below are query/index-level only, safe to act on without touching the v2 tables pending your customer-input review.

**Measured mean latencies (pg_stat_statements, current window):**

| RPC | Calls | Mean latency |
|---|---|---|
| `get_seller_category_landing_page_metrics_v2` | 72+78 | **3,830ms** / 1,398ms |
| `get_seller_warehouse_landing_row_metrics_v2` | 179 | **2,724ms** |
| `get_seller_category_landing_summary_v2` | 149 | **2,615ms** |
| `get_seller_brand_landing_summary` | 187 | 1,657ms |
| `get_metrics_v2_buyer_app_dashboard` | 138 | 1,765ms |
| `get_metrics_v2_seller_dashboard` | 290 | 1,932ms |
| `get_seller_brand_landing_rows` | 215 | 1,043ms |
| `metrics_v2_customers_landing` | 264 | 1,085ms |
| `get_seller_locations_landing_summary` | 235 | 814ms |
| `get_seller_price_list_landing_aggregates` | 380 | 476ms |

None of these are close to the 50ms target — several are 40-75x over.

**Root cause (read the actual function bodies):**
- These RPCs do **live joins across `invoice_items` × `invoices` × `tenant_products`/`tenant_categories` on every call**, even though the schema already maintains precomputed snapshot tables (`metrics_product_snapshot`, `metrics_buyer_snapshot`, `metrics_location_daily`, `metrics_tenant_setup_snapshot`) for exactly this purpose. The GMV/units/buyers aggregates are recomputed from raw transactional rows instead of reading a snapshot — inventory counts pull from `metrics_product_snapshot` correctly, but revenue metrics don't.
- `get_seller_warehouse_landing_row_metrics_v2`'s `last_sales` CTE joins `tenant_inventory → invoice_items → invoices` with **no date bound and no LIMIT** to compute `MAX(last_invoice_day)` per product — this scans the *entire* invoice history per warehouse per page load. This one will get slower every month as invoice history grows; it's not just slow today, it's unbounded.
- Several CTEs are `MATERIALIZED` (forces separate execution, no cross-CTE predicate pushdown) — appropriate in some cases (the `requested` CTE, correctly capped `LIMIT 100`) but compounds cost in the ones doing full joins.
- `json_to_record` overhead at the PostgREST call boundary (converting the POST body into named params) is inherent to every RPC call (a few ms each) — not the dominant cost here; the dominant cost is inside the SQL body itself.

**Recommendations (query/index level, not touching v2 table schema):**
1. Rewrite the revenue/GMV portions of these RPCs to read from `metrics_product_snapshot` / `metrics_location_daily` / a per-category rollup snapshot — consistent with how inventory metrics already do it — rather than live-aggregating `invoice_items`/`invoices`. This is a query-body change only.
2. Bound `get_seller_warehouse_landing_row_metrics_v2`'s `last_sales` CTE with a `WHERE i.invoice_date >= now() - interval '180 days'` (or similar business-relevant window) and confirm `invoices_metrics_tenant_day_idx`/`idx_invoice_items_tenant_product_id` cover it — right now it has no upper/lower bound so no index range-scan helps.
3. Add composite covering indexes for the join keys actually driving cost:
   - `app.invoice_items (tenant_product_id) INCLUDE (invoice_id, line_total, qty)` — avoids heap fetch per row in the aggregation join.
   - `app.tenant_products (tenant_id, tenant_category_id) WHERE deleted_at IS NULL AND is_active` — the `products` CTE in the category functions filters on exactly this triple but only has separate single-column indexes (`idx_tenant_products_category_id`, `idx_app_tenant_products_deleted_at`) — a composite partial index removes a bitmap-AND step.
4. Once (1) lands, expect these RPCs to be dominated by snapshot-table point lookups (already indexed) — should land well under 50ms for typical location/category counts.

---

## 5. High-Frequency Table Pagination & Write Traffic

- `estimates` and `orders` both already have solid tenant+location+created_at composite indexes (`idx_estimates_tenant_location_created_at`, `idx_orders_tenant_location_placed_at`) suitable for **keyset pagination** (`WHERE tenant_id = $1 AND (created_at, id) < ($cursor_ts, $cursor_id) ORDER BY created_at DESC, id DESC LIMIT $n`).
- If the current API routes for these lists use `OFFSET/LIMIT`, confirm and switch to keyset — `OFFSET` cost grows linearly with page depth even with a perfect index, since Postgres still has to walk and discard the skipped rows.
- `app.integration_webhook_errors` — 4-5 single-column indexes (`tenant_id`, `integration_webhook_id`, `tenant_integration_id`, `created_by`, `updated_by`) but **no composite `(tenant_id, created_at)` index**, and it's an error-log table growing unbounded (see §7). Every FK index here writes on every insert with no read benefit if nothing ever queries by `created_by`/`updated_by` alone (flagged as `unused_index` by the advisor for related tables) — worth confirming actual read patterns before keeping all 5.

---

## 6. FK & List Indexing (advisor: `unindexed_foreign_keys` + `unused_index`)

**87 unindexed foreign keys** flagged total. Ones on your named hot tables:

```sql
-- orders
CREATE INDEX CONCURRENTLY idx_orders_catalog_id ON app.orders (catalog_id);
CREATE INDEX CONCURRENTLY idx_orders_placed_by  ON app.orders (placed_by);

-- estimates
CREATE INDEX CONCURRENTLY idx_estimates_catalog_id            ON app.estimates (catalog_id);
CREATE INDEX CONCURRENTLY idx_estimates_converted_to_order_id  ON app.estimates (converted_to_order_id);

-- metrics_product_snapshot (audit columns — used by created_by/updated_by lookups if any admin UI filters by actor)
CREATE INDEX CONCURRENTLY idx_metrics_product_snapshot_created_by ON app.metrics_product_snapshot (created_by);
CREATE INDEX CONCURRENTLY idx_metrics_product_snapshot_updated_by ON app.metrics_product_snapshot (updated_by);

-- kpi_*_daily (location_id — exactly the pattern your last index_advisor run flagged)
CREATE INDEX CONCURRENTLY idx_kpi_estimates_daily_location_id ON app.kpi_estimates_daily (location_id);
CREATE INDEX CONCURRENTLY idx_kpi_invoices_daily_location_id  ON app.kpi_invoices_daily  (location_id);
CREATE INDEX CONCURRENTLY idx_kpi_orders_daily_location_id    ON app.kpi_orders_daily    (location_id);

-- credit_notes, whatsapp_broadcasts
CREATE INDEX CONCURRENTLY idx_credit_notes_invoice_id            ON app.credit_notes (invoice_id);
CREATE INDEX CONCURRENTLY idx_whatsapp_broadcasts_target_cohort_id ON app.whatsapp_broadcasts (target_cohort_id);
```

**Conversely — 105 `unused_index` findings** (never scanned since stats reset), concentrated in: `orders`(5), `integration_webhook_event_changes`(5), `integration_data_flows`(5), `campaigns`(5), `brands`(5), `tenant_products`(4), `tenant_integrations`(4), `tenant_categories`(4), `products`(4), `integration_webhook_events`(4), `integration_webhook_errors`(4), plus smaller counts elsewhere.

Every unused index is pure write-amplification tax (maintained on every INSERT/UPDATE, e.g. the `integration_webhook_events` insert averaging 22.7ms for 6,726 calls above is partly this) with zero read benefit. Before dropping any, confirm against a longer stats window (`pg_stat_user_indexes` resets on restart/`pg_stat_reset()` — verify `stats_reset` timestamp first so "unused" isn't just "young"), then drop confirmed-dead ones in a batch migration.

---

## 7. Data Purge & Operational Overload

- `app.integration_webhook_events`: **54 MB**, 6,726 live rows, essentially **0% deleted** (`n_dead_tup` only 368, i.e. rows accumulate and stay) — this is the single largest table by size relative to row count (avg ~8KB/row, unusually wide for an event log — check for a bloated JSONB `raw_payload` column being retained forever).
- `app.integration_entity_map`: 25MB / 45,705 rows — mapping table, likely fine to keep, but worth confirming it's not accumulating stale rows for disconnected integrations.
- `app.otp_sessions`: only 65 live rows but **46% dead tuples**, `last_autovacuum: null` — a high-churn ephemeral table (OTP codes expire in minutes) that's never been vacuumed; same pattern on `estimates_snapshot` (96% dead), `kpi_warehouse_daily` (95% dead), `campaign_views` (86% dead), `tenant_integrations` (97% dead) — all **small tables with no autovacuum ever run**, meaning `autovacuum_vacuum_scale_factor`'s default threshold never triggers on low-row-count tables. Bloat itself is cheap at this size, but it signals these tables have no active TTL/purge job.
- `app.run_storage_maintenance()` (daily at 08:00 and 21:45 IST via cron 17/31) already calls `purge_cron_job_run_details()`, `purge_metrics_dirty_work()`, `purge_integration_webhook_events()`, `purge_net_http_response()`, `purge_supabase_hooks()` — the plumbing exists. Given `integration_webhook_events` still shows 0 deletions and full history retained, the purge predicate in `purge_integration_webhook_events()` is likely too conservative (e.g. only purges rows older than 90 days when the account is only weeks old, or only purges `processing_status = 'processed'` rows that never transition).

**Recommendations:**
1. Read `app.purge_integration_webhook_events()`'s actual retention window/predicate and tighten it — e.g. purge `processed`/`failed` webhook events after 7 days (keep only `pending`/`retrying`), not 90.
2. Add explicit low-threshold autovacuum settings for small high-churn tables so they don't wait for the default 20%-of-table scale factor:
   ```sql
   ALTER TABLE app.otp_sessions SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 20);
   ALTER TABLE app.integration_webhook_echo_guards SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 20);
   ```
3. Add a dedicated TTL purge for `otp_sessions` (delete `expires_at < now()`) on the existing 15-min-cadence infra rather than relying on autovacuum alone — dead rows there are a correctness signal too (expired OTPs should be gone, not just dead-tuple).

---

## Security items surfaced incidentally (from the same advisor run — flagging, not in scope for the perf goal but free/cheap to fix)

- 8 tables have **RLS enabled with zero policies** (`email_verification_otps`, `integration_oauth_states`, `membership_dirty_work`, `metrics_dirty_work`, `metrics_refresh_leases`, `platform_admins`, `whatsapp_rate_card`, `whatsapp_send_queue`) — currently deny-all to anon/authenticated (safe by default), but confirm this is intentional (internal-only, `SECURITY DEFINER` access) vs. an oversight blocking legitimate access.
- `app.otp_sessions_public` policy is `USING (true)` / `WITH CHECK (true)` for `ALL` — fully open RLS on an OTP table. Worth a second look given it's auth-adjacent.
- `pg_trgm` and `vector` extensions installed in `public` schema — move to a dedicated `extensions` schema (standard Supabase hardening, zero downtime via `ALTER EXTENSION ... SET SCHEMA`).
- 273 functions (`142` authenticated + `131` anon) are `SECURITY DEFINER` and directly executable by `anon`/`authenticated` roles, and 84 functions have a mutable `search_path` — combination is a known privilege-escalation vector if any of those functions are callable with attacker-controlled input. Worth a follow-up pass to confirm every `SECURITY DEFINER` function actually needs anon/authenticated exposure and sets `search_path` explicitly (most of the ones inspected above already do — good pattern, just not universal).

---

## Priority order to hit sub-50ms without upgrading

1. **Realtime table trim + cron tick early-exit guards (§2, §3)** — zero schema risk, removes ~50%+ of total DB load, do first.
2. **Auth admin-API removal from hot path (§1)** — app-code only, no migration.
3. **Unindexed FK indexes on hot tables (§6)** — `CREATE INDEX CONCURRENTLY`, safe, no lock.
4. **Landing RPC rewrite to use existing snapshot tables (§4)** — biggest per-request latency win, function-body-only change, no v2 table schema touched.
5. **Purge tightening + autovacuum tuning (§7)** — ongoing hygiene, prevents regression as data grows.
6. **Unused-index cleanup + pagination cursor switch (§5, §6)** — do after confirming stats window, lower urgency.
