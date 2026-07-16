# Metrics V2 Execution Ledger

This is the dedicated execution ledger for the Metrics V2 upgrade described in:

- [metrics-v2-implementation-plan-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-v2-implementation-plan-2026-07.md)
- [metrics-data-architecture-proposal-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-data-architecture-proposal-2026-07.md)
- [metrics-product-strategy-proposal-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-product-strategy-proposal-2026-07.md)

## Metrics V2 Phase 0: Contract Freeze and Live Database Audit

Date: 2026-07-15
Status: Complete; Phase 0A required before Phase 1B and later phases
Coordinator: primary Codex session
Investigators:

- Investigator A / Popper: repository aggregate DB inventory and live inspection query list.
- Investigator B / Russell: snapshot/KPI/read-model consumer graph and disposition.
- Investigator C / Peirce: canonical raw expected-value fixture matrix.



### Scope and non-implementation guardrails

- Executed only Phase 0. No Phase 0A containment, Phase 1B schema/control work, migrations, app behavior changes, route rewrites, or tests were implemented.
- Reconfirmed pre-launch stance: no `df_metrics_v2`, no `read_model_version`, no tenant metrics-routing branch, and no runtime V1/V2 UI fallback path were added.
- "Shadow" remains reconciliation tooling against an isolated hosted remote development/staging database only.
- The current dirty workspace was preserved. Starting status was `develop...origin/develop` with pre-existing edits to:
  - `specs/metrics-product-strategy-proposal-2026-07.md`
  - `supabase/seed.sql`
  - untracked `specs/metrics-data-architecture-proposal-2026-07.md`
  - untracked `specs/metrics-v2-implementation-plan-2026-07.md`
  - untracked `specs/metrics-v2-phase-session-prompt.md`



### Changed files

- [AGENTS.md](/Users/phanikrovvidi/projects/deal-flow/AGENTS.md)
  - Recorded the approved narrow Metrics V2 operational-table exception.
  - Dirty-work, lease, runtime-control, refresh-state, and execution-history tables must carry tenant ownership where applicable, timestamps, explicit RLS/service-role access, bounded retention, and schema-qualified `app` DDL.
  - Those operational coordination tables are exempt from `external_ref`, business audit columns, and soft-delete. Business-facing snapshots/read models still follow normal table conventions unless separately approved.
- [specs/metrics-v2-execution-log-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-v2-execution-log-2026-07.md)
  - Added this dedicated Metrics V2 ledger and Phase 0 evidence.



### Contract freeze

- Canonical definitions remain [metrics-definitions-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-definitions-2026-07.md).
- Metrics V2 product/architecture contracts frozen for later implementation:
  - invoices are sales truth for customer/product/brand/category/location/tenant sales;
  - Estimate and Order facts remain separate;
  - primary demand resolves centrally from enabled modules: Orders when enabled, otherwise Estimates; Estimates and Orders are never added together;
  - tenant-facing period metrics use `Asia/Kolkata` boundaries and canonical document dates with fallback: `estimate_date`, `order_date`, `invoice_date`, then `created_at`;
  - landing Pulse/Actions use fixed horizons from the landing-period matrix, while transaction table filters affect only transaction lists;
  - null/unavailable provenance is not converted to zero;
  - no Metrics V2 buyer-by-day or product-by-day facts;
  - no entity-ID arrays, stored ranked JSON membership, stored callout result lists, or current stock copied into historical V2 rows;
  - seller-assistant location scope uses explicit document location and tenant unique counts are computed independently, not by summing location uniques.
- Target response-contract boundaries for later phases:
  - APIs return explicit `as_of`, fixed commercial horizon where relevant, table period where relevant, source/freshness metadata, and primary-demand document where labels depend on it.
  - Landing Pulse is one bounded snapshot/read-model RPC; collapsed callouts are named indexed `LIMIT 3` queries; See-all overlays are cursor-paginated.



### Live and repository evidence

- Read-only remote project evidence:
  - `npx supabase projects list` succeeded and showed linked project `hcpzbnmumbykdqveyjhr`, name `yukti`, status `ACTIVE_HEALTHY`, region `ap-northeast-2`, Postgres `17.6.1.141`.
  - `npx supabase migration list` succeeded against the remote database. Local and remote migration versions matched through `20260714114957`.
- Live definition inspection:
  - `npx supabase db query --linked` succeeded through the Supabase Management API after `SUPABASE_DB_PASSWORD` was added to `.env.local`.
  - `psql` direct host access was not usable from this environment because DNS resolution for `db.hcpzbnmumbykdqveyjhr.supabase.co` failed.
  - `npx supabase db dump --linked ...` was not usable because the CLI dump path requires Docker, and Docker was not running at `/Users/phanikrovvidi/.docker/run/docker.sock`.
  - The required live checks were completed with read-only SQL queries instead of schema dump files.
- Live/repository differences recorded:
  - Migration history matched the repository through latest remote version `20260714114957`; no migration-version divergence was found.
  - Live extensions include repo-declared extensions plus Supabase/platform extras: `hypopg`, `index_advisor`, and `plpgsql`.
  - Live active cron jobs are the standing jobs only: `buyer-metric-snapshot-freshness`, `cron-job-run-details-purge`, `reco-assoc-category-fortnightly`, `reco-buyer-weekly`, `reco-popularity-daily`, `sync-cron-idle-sweep`, and `zoho-sync-daily`. Repo migrations also contain job-lifetime or conditional schedules such as sync coordinator/backstop, repair, and WhatsApp dispatch jobs; those are not active standing cron rows in `cron.job`.
  - Live aggregate table, column, RLS, index, trigger, and function inventories match the expected V1 aggregate families from the repository migration history. No unexpected missing snapshot/KPI family was found.
- Repository aggregate tables found in [20260709000001_prod_bootstrap.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/migrations/20260709000001_prod_bootstrap.sql):
  - Snapshots/source: `brands_snapshot`, `buyer_app_activity`, `buyer_app_snapshot`, `buyer_current_snapshot`, `buyers_snapshot`, `categories_snapshot`, `estimates_snapshot`, `invoices_snapshot`, `locations_snapshot`, `orders_snapshot`, `products_snapshot`, `warehouses_snapshot`.
  - Daily KPI/read facts: `kpi_brand_daily`, `kpi_buyer_app_daily`, `kpi_buyers_daily`, `kpi_category_daily`, `kpi_estimates_daily`, `kpi_invoices_daily`, `kpi_location_daily`, `kpi_orders_daily`, `kpi_product_daily`, `kpi_tenant_daily`, `kpi_warehouse_daily`.
- Live aggregate table/RLS evidence:
  - All 23 listed snapshot/KPI/source tables exist in `app` and have RLS enabled.
  - Each listed table has one SELECT policy; most are `tenant members can read ...`, while `kpi_product_daily` and `kpi_tenant_daily` use their consolidated select policies.
  - Live column inventory confirms V1 high-cardinality daily facts are present, including `kpi_buyers_daily`, `kpi_product_daily`, and `kpi_buyer_app_daily`; `buyer_app_snapshot` still contains ranked/list JSON columns such as `not_ordering_buyers`, `top_app_buyers_callout`, `no_app_buyers`, `top_app_buyers_card`, and `top_locations`.
  - Live `kpi_product_daily` still carries copied current `on_hand`, plus business-table convention columns.
- Live index evidence:
  - Snapshot/KPI/source indexes are present for all listed families.
  - High-cardinality daily facts include tenant/day or unique-grain indexes: `kpi_buyers_daily`, `kpi_product_daily`, `kpi_brand_daily`, `kpi_category_daily`, `kpi_location_daily`, `kpi_warehouse_daily`, and tenant/document daily families.
- Repository refresh/read functions found:
  - snapshot refresh families: `refresh_*_snapshot`;
  - KPI refresh/rebuild families: `refresh_kpi_*`, `rebuild_kpi_*_for_tenant`;
  - repair/freshness: `post_sync_rebuild`, `rebuild_metrics_for_tenant_range`, `get_tenant_aggregate_freshness`, `_run_metrics_analysis_for_tenant_range`, `run_metrics_analysis_for_tenant`;
  - read models/RPCs: `get_buyer_home_summary`, `get_seller_locations_landing_summary`, `get_seller_warehouses_landing_summary`, `get_seller_brand_landing_summary`, `get_seller_category_landing_summary_v1`, `get_seller_cohort_landing_aggregates`, `get_seller_price_list_landing_aggregates`, `get_catalog_composer_product_metrics`.
- Live function inventory:
  - Read-only `pg_get_functiondef` MD5 inventory was captured for all relevant aggregate dispatch, refresh, rebuild, repair/freshness, analysis, buyer-home, and seller landing/read-model RPCs.
  - Live signatures include all expected V1 aggregate families, including `dispatch_from_*`, `refresh_*_snapshot`, `refresh_kpi_*`, `rebuild_kpi_*_for_tenant`, `rebuild_metrics_for_tenant_range`, `get_tenant_aggregate_freshness`, `_run_metrics_analysis_for_tenant_range`, `run_metrics_analysis_for_tenant`, `get_buyer_home_summary`, seller landing summaries, cohort/pricelist aggregates, and catalog composer metrics.
- Repository dispatch/cron/extension evidence:
  - Interactive dispatch triggers exist for buyers, buyer users, estimates, invoices, orders, order items, tenant inventory, tenant brands, and tenant products.
  - `trg_integration_sync_jobs_post_rebuild` calls `trg_post_sync_rebuild`.
  - Extension DDL in bootstrap includes `pg_cron`, `pg_net`, `pg_stat_statements`, `pg_trgm`, `pgcrypto`, `supabase_vault`, `uuid-ossp`, and `vector`.
  - Cron scheduling appears for buyer metric freshness, Zoho sync, sync coordinator/backstop, cron run purge, recommendation jobs, repair jobs, and WhatsApp dispatch backstop.
- Live trigger evidence:
  - Interactive dispatch triggers exist on `buyer_users`, `buyers`, `estimates`, `invoices`, `orders`, `order_items`, `tenant_inventory`, `tenant_brands`, and `tenant_products`.
  - `trg_integration_sync_jobs_post_rebuild` remains active on `integration_sync_jobs`.
  - `trg_order_buyer_cohort_refresh` remains active on `orders` and is separate from the aggregate dispatch trigger.



### Phase 0A decision

Status: Required before Phase 1B and later phases.

Evidence:

- Remote migration history confirms the repository migration sequence is applied through `20260714114957`.
- Live `pg_get_functiondef` checks confirm tenant-wide aggregate refresh is still attached to interactive or event-driven paths:
  - `dispatch_from_orders`, `dispatch_from_invoices`, and `dispatch_from_estimates` call tenant-scoped `refresh_buyers_snapshot(v_tenant)` and/or `refresh_buyer_current_snapshot(v_tenant)`.
  - `refresh_buyers_snapshot(p_tenant_id)` deletes/reinserts buyer snapshot rows at tenant scope.
  - `refresh_buyer_current_snapshot(p_tenant_id)` upserts buyer current rows at tenant scope.
  - `record_buyer_app_activity` / Buyer App paths call `refresh_buyer_app_snapshot` at tenant scope.
  - `post_sync_rebuild` refreshes all snapshot families and recent KPI families after sync.
- Live function-body boolean scan showed:
  - `dispatch_from_estimates` calls `refresh_buyers_snapshot` and `refresh_buyer_app_snapshot`;
  - `dispatch_from_invoices` calls `refresh_buyers_snapshot`, `refresh_buyer_current_snapshot`, and `refresh_buyer_app_snapshot`;
  - `dispatch_from_orders` calls `refresh_buyers_snapshot`, `refresh_buyer_current_snapshot`, and `refresh_buyer_app_snapshot`;
  - `dispatch_from_buyers` calls all three buyer refresh families;
  - `post_sync_rebuild` calls all three buyer refresh families and other snapshot/KPI refreshes.
- Live `pg_stat_user_tables` counters confirm ongoing write-amplification shape:
  - `buyers_snapshot`: 15,839 live rows, 1,468,439 cumulative inserts, 712,584 cumulative deletes, 20 autovacuum runs.
  - `buyer_current_snapshot`: 10,660 live rows, 364,709 cumulative inserts, 382,331 cumulative updates, 17 autovacuum runs.
  - `buyer_app_snapshot`: 2 live rows and 1,269 cumulative updates.
- [db-change-guidance-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/db-change-guidance-2026-07.md) records production write-amplification evidence for this exact issue: `buyers_snapshot` had 1,405,362 cumulative inserts and 681,065 deletes for roughly five live rows, and `buyer_current_snapshot` had 343,449 inserts plus 371,719 updates.

Decision: Run Phase 0A legacy containment next. Do not begin Phase 1B or later work until the offending tenant-wide interactive/event refresh paths are contained and the write/resource baseline is rerun. Phase 1A may build only the remote acceptance harness needed to produce that evidence.

### Consumer graph disposition


| Surface / family               | Current consumers                                                                                         | Current source                                                                                         | Metrics V2 disposition                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seller dashboard               | `app/api/tenant/dashboard/route.ts`, `src/lib/server/seller-dashboard.ts`                                 | `kpi_tenant_daily`, `kpi_product_daily`, raw documents/inventory                                       | Migrate to joined tenant domain snapshots plus bounded Actions. Retain tenant/location daily only for shipped dashboard charts.                                |
| Transaction landings           | `app/api/tenant/estimates/route.ts`, `app/api/tenant/orders/route.ts`, `app/api/tenant/invoices/route.ts` | `kpi_estimates_daily`, `kpi_orders_daily`, `kpi_invoices_daily`                                        | Migrate Pulse to commercial snapshot; lists remain canonical raw documents. Temporarily retain V1 daily facts until cutover, then retire/reshape.              |
| Invoice/product summaries      | `app/api/tenant/invoices/summary/route.ts`, `app/api/tenant/products/summary/route.ts`                    | `invoices_snapshot`, `products_snapshot`                                                               | Migrate to commercial/setup/inventory/product snapshots. Temporarily retain V1 snapshots until callers are replaced.                                           |
| Customers                      | customer landing, summary, detail routes                                                                  | `buyers_snapshot`, `kpi_buyers_daily`                                                                  | Migrate to `metrics_buyer_snapshot` and optional sparse location grain. Retire `kpi_buyers_daily`.                                                             |
| Cohorts/customer groups        | `src/lib/server/cohort-composer.ts`, `app/api/cohorts/route.ts`                                           | `buyers_snapshot`, `kpi_buyers_daily`, cohort aggregate RPC                                            | Migrate to buyer snapshot/group summary contract. Temporarily retain bounded RPC, then replace buyer-daily dependency.                                         |
| Pricelists                     | `app/api/price-lists/route.ts`                                                                            | price-list aggregate RPC                                                                               | Migrate to current Pricelist snapshot/raw validity exceptions. Temporarily retain only if bounded and independent of prohibited facts.                         |
| Buyer App seller analytics     | `app/api/tenant/buyer-app/route.ts`                                                                       | `buyer_app_snapshot`, `kpi_buyer_app_daily`, `buyers_snapshot`, refresh-on-read                        | Migrate to `metrics_tenant_buyer_app_snapshot` plus buyer snapshot/action queries. Retire refresh-on-read and stored ranked/top lists.                         |
| Buyer home                     | `app/api/buyer/home/route.ts`, `get_buyer_home_summary`                                                   | `kpi_buyers_daily`, `buyer_current_snapshot`, reco RPCs                                                | Migrate to buyer snapshot/current commercial facts and Buyer App domain snapshot. Merge/retire `buyer_current_snapshot`.                                       |
| Products                       | product landing/detail, catalog composer/product metrics                                                  | `products_snapshot`, `kpi_product_daily`, catalog composer metric RPC                                  | Migrate to `metrics_product_snapshot`; detail Explore becomes bounded on-open RPC. Retire `kpi_product_daily`.                                                 |
| Brands/categories              | brand/category landing and detail routes/RPCs                                                             | `brands_snapshot`, `categories_snapshot`, `kpi_brand_daily`, `kpi_category_daily`, `kpi_product_daily` | Migrate. Reshape/retain low-cardinality scalar snapshots; retire daily brand/category/product facts unless a shipped chart proves need.                        |
| Locations/warehouses           | location/warehouse landing/detail routes and warehouse data helper                                        | `locations_snapshot`, `warehouses_snapshot`, `kpi_location_daily`, `kpi_warehouse_daily`               | Migrate. Target retains `metrics_location_snapshot` and sparse location daily only as needed. Reshape warehouse snapshot; retire warehouse daily trend copies. |
| Catalogs/campaigns             | catalog landing route and related campaign/read-model RPCs                                                | compact catalog/campaign aggregate RPCs                                                                | Migrate to scalar campaign snapshot or bounded campaign summary plus raw indexed callouts. Retire stored result membership.                                    |
| Recommendations                | buyer home/recommendation and seller reco refresh routes                                                  | recommender profiles, suggestions, stored top JSON                                                     | Temporarily retain as recommender read models. Retire/replace if used as Metrics V2 callout membership.                                                        |
| Sync/repair/freshness settings | integration server/settings components                                                                    | V1 freshness, analysis, repair RPCs/jobs                                                               | Temporarily retain during expand/validate/cutover. Migrate to V2 refresh state/runtime control/dirty history.                                                  |
| Tests                          | `tests/metrics_aggregation_*.sql`, `tests/buyer_app_activity_tracking.sql`, API/UI mocks                  | V1 table/RPC assertions                                                                                | Migrate with each surface. Retire V1 phase tests after V2 reconciliation replaces them.                                                                        |




### Expected raw-value fixtures

All future reconciliation fixtures use fixed `as_of = 2026-07-15 12:00:00 Asia/Kolkata`, current month `2026-07-01..2026-07-15`, trailing 90 days `2026-04-16..2026-07-15`, and prior inactive window `2025-07-16..2026-04-15`.

Required fixtures and assertions:

- WineYard real baseline: capture raw canonical document, line, buyer, product, location, inventory, source, and integration values; use the captured raw oracle, not V1 aggregate tables, for reconciliation.
- Estimates-only: primary demand is Estimates; open includes `draft` and `sent`; converted/void/expired facts are stored but not open; null `estimate_date` falls back to `created_at`.
- Orders-only: primary demand is Orders; `draft` and operational non-terminal statuses are flow/open as defined by shared helpers; cancelled/rejected/archived excluded from flow; null `order_date` falls back to `created_at`.
- Both-enabled: Orders are primary demand; converted estimate plus linked order is counted once on shared demand surfaces.
- Invoice status edges: use `app.invoice_status_has_receivable` and `app.invoice_is_overdue`; paid/void/cancelled stale balances do not create receivables.
- Multi-location: explicit document `location_id`; tenant unique buyers computed independently from location uniques; moving a document repairs old and new date/location buckets.
- Source/channel: Buyer App demand follows primary-demand documents; Buyer App invoiced sales uses invoice source/lineage and invoice denominator.
- Null-vs-zero/sparse: verified no activity is zero; insufficient velocity/provenance is null/unavailable; sparse empty KPI tables are not stale solely for zero rows.
- Multi-line joins: header totals count each document once; product/brand/category metrics sum invoice lines only at dimension grain.
- Canonical date fallback: explicit canonical date wins over `created_at`; fallback applies only when the canonical date is null.
- Large tenant: deterministic generator with closed-form totals; no V2 materialized zero rows for untouched buyer/product/location combinations.



### Commands and results

```bash
git status --short --branch
```

- Passed; showed pre-existing dirty workspace noted above.

```bash
npx supabase --version
```

- Initially blocked by sandboxed write to `~/.supabase/telemetry.json`.
- Passed after approved escalation; version `2.109.1`.

```bash
npx supabase projects list
npx supabase migration list
```

- Passed after approved escalation.
- Project is linked and healthy; migration history local/remote matched through `20260714114957`.

```bash
npx supabase db dump --linked --schema extensions --file /tmp/metrics-v2-live-extensions-schema.sql
npx supabase db dump --linked --schema app --file /tmp/metrics-v2-live-app-schema.sql
npx supabase db dump --linked --schema cron --data-only --file /tmp/metrics-v2-live-cron-data.sql
```

- Re-run after `SUPABASE_DB_PASSWORD` was added.
- Still unusable in this environment because Supabase CLI schema dumps require Docker; Docker was not running at `/Users/phanikrovvidi/.docker/run/docker.sock`.
- Replaced by read-only `npx supabase db query --linked ...` inspection below.

```bash
psql "host=db.hcpzbnmumbykdqveyjhr.supabase.co port=5432 dbname=postgres user=postgres sslmode=require" -c "select current_database(), current_user, version();"
```

- Blocked by DNS resolution for the direct database host in this environment.
- Replaced by Supabase Management API query path.

```bash
npx supabase db query --linked "select current_database() as db, current_user as user, version() as version;"
npx supabase db query --linked "select extname, extnamespace::regnamespace::text as schema, extversion from pg_extension order by extname;"
npx supabase db query --linked "select jobid, jobname, schedule, command, active from cron.job order by jobname;"
```

- Passed.
- Confirmed remote PostgreSQL 17.6, extension inventory, and active cron rows.

```bash
npx supabase db query --linked "select schemaname, tablename, rowsecurity from pg_tables where schemaname = 'app' and (tablename like '%snapshot%' or tablename like 'kpi_%' or tablename in ('buyer_app_activity')) order by tablename;"
npx supabase db query --linked "select table_name, count(*) as column_count, string_agg(column_name || ':' || data_type, ', ' order by ordinal_position) as columns from information_schema.columns where table_schema = 'app' and (table_name like '%snapshot%' or table_name like 'kpi_%' or table_name = 'buyer_app_activity') group by table_name order by table_name;"
npx supabase db query --linked "select tablename, count(*) as policy_count, string_agg(policyname || ':' || cmd, ', ' order by policyname, cmd) as policies from pg_policies where schemaname = 'app' and (tablename like '%snapshot%' or tablename like 'kpi_%' or tablename = 'buyer_app_activity') group by tablename order by tablename;"
npx supabase db query --linked "select tablename, count(*) as index_count, string_agg(indexname, ', ' order by indexname) as indexes from pg_indexes where schemaname = 'app' and (tablename like '%snapshot%' or tablename like 'kpi_%' or tablename = 'buyer_app_activity') group by tablename order by tablename;"
```

- Passed.
- Confirmed table, column, RLS, policy, and index inventories for all current aggregate families.

```bash
npx supabase db query --linked "select c.relname as table_name, t.tgname as trigger_name, pg_get_triggerdef(t.oid, true) as trigger_def from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname = 'app' and (t.tgname ilike '%dispatch%' or t.tgname ilike '%snapshot%' or t.tgname ilike '%kpi%' or t.tgname ilike '%rebuild%' or t.tgname ilike '%cohort%') order by c.relname, t.tgname;"
npx supabase db query --linked "select p.oid::regprocedure::text as signature, p.proname, md5(pg_get_functiondef(p.oid)) as def_md5, position('refresh_buyers_snapshot' in pg_get_functiondef(p.oid)) > 0 as calls_refresh_buyers, position('refresh_buyer_current_snapshot' in pg_get_functiondef(p.oid)) > 0 as calls_refresh_buyer_current, position('refresh_buyer_app_snapshot' in pg_get_functiondef(p.oid)) > 0 as calls_refresh_buyer_app, position('post_sync_rebuild' in pg_get_functiondef(p.oid)) > 0 as calls_post_sync_rebuild from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and (p.proname like 'dispatch_from_%' or p.proname in ('refresh_buyers_snapshot','refresh_buyer_current_snapshot','refresh_buyer_app_snapshot','post_sync_rebuild','trg_post_sync_rebuild')) order by signature;"
npx supabase db query --linked "select p.oid::regprocedure::text as signature, md5(pg_get_functiondef(p.oid)) as def_md5 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and (p.proname like 'refresh_%snapshot' or p.proname like 'refresh_kpi_%' or p.proname like 'rebuild_kpi_%' or p.proname like 'dispatch_from_%' or p.proname in ('post_sync_rebuild','trg_post_sync_rebuild','get_tenant_aggregate_freshness','run_metrics_analysis_for_tenant','_run_metrics_analysis_for_tenant_range','get_buyer_home_summary','rebuild_metrics_for_tenant_range','get_catalog_composer_product_metrics') or p.proname like 'get_seller_%landing%' or p.proname like 'get_seller_%landing_%' or p.proname in ('get_seller_cohort_landing_aggregates','get_seller_price_list_landing_aggregates')) order by signature;"
```

- Passed.
- Confirmed live triggers and aggregate function inventory.
- Confirmed Phase 0A-required tenant-wide buyer refresh calls in live function bodies.

```bash
npx supabase db query --linked "select relname, n_live_tup, n_dead_tup, n_tup_ins, n_tup_upd, n_tup_del, last_autovacuum, autovacuum_count from pg_stat_user_tables where schemaname = 'app' and relname in ('buyers_snapshot','buyer_current_snapshot','buyer_app_snapshot') order by relname;"
npx supabase db query --linked "select version from supabase_migrations.schema_migrations order by version desc limit 10;"
```

- Passed.
- Confirmed live write-amplification counters and latest migration versions.

```bash
rg -n "CREATE TABLE.*(snapshot|kpi_|buyer_app_activity)|CREATE TABLE IF NOT EXISTS.*(snapshot|kpi_|buyer_app_activity)" supabase/migrations/*.sql
rg -n "CREATE (OR REPLACE )?FUNCTION app\\.(refresh_.*snapshot|refresh_kpi_|rebuild_kpi_|rebuild_metrics_for_tenant_range|post_sync_rebuild|dispatch_from_|get_tenant_aggregate_freshness|run_metrics_analysis_for_tenant|_run_metrics_analysis_for_tenant_range|get_buyer_home_summary|get_seller_.*landing|get_catalog_landing|get_catalog_composer_product_metrics|get_seller_cohort_landing_aggregates|get_seller_price_list_landing_aggregates)" supabase/migrations/*.sql
rg -n "CREATE TRIGGER .*dispatch|trg_.*dispatch|post_sync_rebuild|cron\\.schedule|CREATE EXTENSION" supabase/migrations/*.sql
rg -l "\\b(kpi_[a-z_]+|[a-z_]+_snapshot|refresh_[a-z_]+_snapshot|get_.*summary|get_.*landing|buyer_current_snapshot|buyer_app_snapshot|run_metrics_analysis|rebuild_metrics_for_tenant_range)\\b" app src supabase/migrations tests
rg -n "df_metrics_v2|read_model_version|metrics_v2" app src supabase/migrations
```

- Passed. The runtime flag/version selector search found no app/runtime `df_metrics_v2`, `read_model_version`, or metrics-routing branch.



### Exit gate

- Every live/repository difference found in Phase 0 is recorded above.
- Every existing snapshot/KPI consumer family has a `migrate`, `temporarily retain`, or `retire` disposition.
- Operational dirty/lease/run-table retention conventions are explicitly approved and reflected in [AGENTS.md](/Users/phanikrovvidi/projects/deal-flow/AGENTS.md).
- Expected raw values cover status edges, canonical date fallback, source, location, null/zero, and multi-line joins.
- No implementation edits were made beyond documentation: no migration, no app route behavior change, no production mutation, no `supabase db push`, and no destructive cleanup.



## Metrics V2 Phase 0A: Legacy Containment

Date: 2026-07-15
Status: Implementation complete; SQL/Vitest/type gates passed; exit gate blocked pending identical before/after write/resource baseline
Coordinator: primary Codex session
Reviewer:

- Anscombe: bounded diff review of Phase 0A migration, pgTAP/Vitest coverage, and ledger entry.



### Scope and guardrails

- Executed only Phase 0A containment. No Metrics V2 schema, dirty-work tables, capture triggers, runtime `df_metrics_v2` flag, `read_model_version`, tenant metrics-routing branch, UI fallback path, application consumer replacement, production push, deploy, branch push, or PR creation was added.
- Reconfirmed pre-launch assumption from Phase 0 ledger for this implementation. If that assumption changes before applying this migration, stop and add a live-migration amendment.
- Preserved V1 tables, V1 response contracts, and manual repair entrypoints. `app.post_sync_rebuild(...)` and `app.retry_post_sync_rebuild_for_sync_job(...)` remain available for explicit repair.
- Accepted temporary freshness trade-off: high-volume Buyer App route/document activity no longer refreshes the tenant-wide `buyer_app_snapshot` inline. Daily Buyer App facts and the activity ledger still update; stored ranked/top-list JSON in `buyer_app_snapshot` can lag until explicit refresh/sync/manual repair. This is acceptable for Phase 0A because Metrics V2 already plans to retire stored ranked/list JSON membership.



### Changed files and objects

- [20260715112649_metrics_v2_phase_0a_legacy_containment.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/migrations/20260715112649_metrics_v2_phase_0a_legacy_containment.sql)
  - Added `app.refresh_buyers_snapshot_for_buyer(p_tenant_id uuid, p_buyer_id uuid)`.
  - Added `app.refresh_buyer_current_snapshot_for_buyer(p_tenant_id uuid, p_buyer_id uuid)`.
  - Rewrote `app.dispatch_from_buyers`, `app.dispatch_from_estimates`, `app.dispatch_from_invoices`, and `app.dispatch_from_orders`.
  - Rewrote `app.record_buyer_app_activity(...)` to keep `buyer_app_activity` and `kpi_buyer_app_daily` updates while removing inline `refresh_buyer_app_snapshot`.
  - Rewrote `app.trg_post_sync_rebuild()` to record deferred rebuild metadata instead of synchronously calling `app.post_sync_rebuild(...)` inside the sync-job completion update.
- [metrics_v2_phase_0a_legacy_containment.sql](/Users/phanikrovvidi/projects/deal-flow/tests/metrics_v2_phase_0a_legacy_containment.sql)
  - Added pgTAP coverage for scoped-vs-tenant refresh parity, old/new buyer repair, soft-delete cleanup, Buyer App activity containment, and deferred post-sync metadata.
- [buyer_app_activity_tracking.sql](/Users/phanikrovvidi/projects/deal-flow/tests/buyer_app_activity_tracking.sql)
  - Added explicit `app.refresh_buyer_app_snapshot(...)` before assertions that intentionally inspect the tenant-wide Buyer App snapshot.
  - Aligned fixtures with live constraints: phone format, JWT `sub` as seeded auth user, and seller-sourced flagged estimate for the existing retire-path assertion.
- [metrics-phase0a-legacy-containment-migration.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/settings/metrics-phase0a-legacy-containment-migration.test.ts)
  - Added migration-contract tests for scoped helper creation, dispatcher rewiring, activity containment, and deferred post-sync rebuild.



### Review findings and fixes

- Reviewer finding P1: nested `jsonb_set(..., '{meta,...}', ..., true)` would not create missing intermediate `meta` objects when `progress = '{}'::jsonb`, so deferred rebuild metadata would not be recorded for empty progress rows.
- Fix: replaced nested `jsonb_set` with explicit `COALESCE(progress, '{}'::jsonb) || jsonb_build_object('meta', COALESCE(progress->'meta', '{}'::jsonb) || jsonb_build_object(...))` in both skipped and deferred trigger branches.



### Commands and results

```bash
npx supabase migration new metrics_v2_phase_0a_legacy_containment
```

- Initially blocked by sandboxed write to `~/.supabase/telemetry.json`.
- Passed after approved escalation and created [20260715112649_metrics_v2_phase_0a_legacy_containment.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/migrations/20260715112649_metrics_v2_phase_0a_legacy_containment.sql).

```bash
git diff --check
```

- Passed.

```bash
rg -n "df_metrics_v2|read_model_version|metrics_v2" app src supabase/migrations/20260715112649_metrics_v2_phase_0a_legacy_containment.sql
```

- Passed for runtime guardrails. The only match was the new migration filename referenced from its Vitest contract test.

```bash
rg -n "jsonb_set\(|PERFORM app\.post_sync_rebuild|refresh_buyers_snapshot\(v_tenant\)|refresh_buyer_current_snapshot\(v_tenant\)" supabase/migrations/20260715112649_metrics_v2_phase_0a_legacy_containment.sql
```

- Passed after reviewer fix; no matches.

```bash
npm run test:unit -- src/tests/settings/metrics-phase0a-legacy-containment-migration.test.ts
```

- Passed; 1 file, 4 tests.

```bash
npm run type-check
```

- Passed.

```bash
npm run test:unit -- src/tests/settings
```

- Failed due pre-existing settings-suite issues outside Phase 0A:
  - Missing historical migration files referenced by existing tests, including `20260612101152_integrations_hardening_and_runtime.sql`, `20260706164421_sync_orchestrator_v2.sql`, `20260705102428_transaction_line_item_backfill_phase.sql`, `20260624102000_zoho_daily_sync_cron.sql`, and `20260701045110_seed_integration_types.sql`.
  - Existing Jest globals in a Vitest suite: `src/tests/settings/team.test.ts`.
  - Existing mock drift in `src/tests/settings/integrations-sync-route.test.ts` for `createRepairAggregateJob`.
  - Existing expectation drift in `src/tests/settings/metrics-phase7-migration.test.ts`.

```bash
npx supabase test db --file tests/metrics_v2_phase_0a_legacy_containment.sql
```

- Failed because current Supabase CLI no longer accepts `--file`; paths are positional.

```bash
npx supabase test db --local tests/metrics_v2_phase_0a_legacy_containment.sql
```

- Blocked: local Postgres test database was not running.

```bash
npx supabase status
```

- Blocked: Docker daemon unavailable at `/Users/phanikrovvidi/.docker/run/docker.sock`.

```bash
npx supabase test db --linked tests/metrics_v2_phase_0a_legacy_containment.sql
```

- Blocked: Supabase CLI pgTAP runner still requires Docker even with `--linked`.
- Replacement evidence used `npx supabase db query --linked --file ...` with `SUPABASE_DB_PASSWORD` available in `.env.local`, applying the Phase 0A migration and pgTAP tests inside `BEGIN` and ending with `ROLLBACK`.
- No remote migration history row or persistent data change was created by these validation runs.

```bash
npx supabase db query --linked --file /tmp/phase0a_remote_quiet.sql
npx supabase db query --linked --file /tmp/buyer_app_activity_remote_quiet.sql
npx supabase db query --linked --file /tmp/phase7_remote_quiet.sql
npx supabase db query --linked --file /tmp/phase8_remote_quiet.sql
```

- Passed against the linked remote database in rolled-back migrated transactions.
- `tests/metrics_v2_phase_0a_legacy_containment.sql`: `1..10`, no `not ok`.
- `tests/buyer_app_activity_tracking.sql`: `1..8`, no `not ok`.
- `tests/metrics_aggregation_phase7_reconciliation.sql`: `1..11`, no `not ok`.
- `tests/metrics_aggregation_phase8_cleanup.sql`: `1..11`, no `not ok`.

```bash
npx supabase db query --linked --file /tmp/phase0a_function_scan_precise.sql
```

- Passed in a rolled-back migrated transaction.
- `dispatch_from_estimates`, `dispatch_from_orders`, `dispatch_from_invoices`, and `record_buyer_app_activity` do not `PERFORM app.refresh_buyer_app_snapshot(...)`.
- `dispatch_from_estimates`, `dispatch_from_orders`, and `dispatch_from_invoices` do not `PERFORM app.refresh_buyers_snapshot(...)` or `PERFORM app.refresh_buyer_current_snapshot(...)`.
- Interactive document dispatchers call buyer-scoped helpers where applicable.
- `trg_post_sync_rebuild` does not `PERFORM app.post_sync_rebuild(...)` inline and does record `post_sync_rebuild_deferred` metadata.
- `dispatch_from_buyers` still performs `app.refresh_buyer_app_snapshot(...)` for buyer setup/access changes, which is outside the high-volume document/activity paths targeted by Phase 0A.

```bash
npx supabase db query --linked --file /tmp/phase0a_pg_stat.sql
```

- Read-only `pg_stat_user_tables` counters captured for legacy snapshot churn:
  - `buyer_app_snapshot`: `n_live_tup=2`, `n_dead_tup=45`, `n_tup_ins=15`, `n_tup_upd=1301`, `n_tup_del=0`, `n_tup_hot_upd=1116`.
  - `buyer_current_snapshot`: `n_live_tup=10660`, `n_dead_tup=53`, `n_tup_ins=364730`, `n_tup_upd=382363`, `n_tup_del=7`, `n_tup_hot_upd=806`.
  - `buyers_snapshot`: `n_live_tup=15839`, `n_dead_tup=100`, `n_tup_ins=1468539`, `n_tup_upd=0`, `n_tup_del=712664`, `n_tup_hot_upd=0`.
  - These are cumulative remote counters, not a controlled before/after workload delta.



### Exit gate

- Implementation diff is complete and independently reviewed.
- Phase-specific pgTAP and required legacy pgTAP files passed against the linked remote schema using rolled-back migrated transactions.
- Targeted Vitest migration-contract test, type-check, and diff whitespace checks passed.
- Function-body scan and read-only snapshot churn counters are captured.
- Full `npm run test:unit -- src/tests/settings` remains red due unrelated pre-existing suite issues listed above.
- Required identical before/after write workload baseline, p50/p95/p99 latency, CPU headroom, locks, deadlocks/timeouts, and controlled `pg_stat_user_tables` before/after deltas are not captured.
- Phase 0A remains blocked for final acceptance/rollout until the controlled write/resource baseline passes. Phase 1A may build and run only the acceptance harness; the Phase 1B entry gate is not satisfied until that evidence is recorded.



## Coordinator review — Phase 0A acceptance path (2026-07-15)



### Decision

- Do **not** bypass Phase 0A. Its implementation tests establish functional correctness, but they do not establish the write/resource safety required before adding new metrics capture and refresh work.
- Do **not** install or run local Supabase/Docker. The acceptance environment is an isolated hosted Supabase development/staging branch or project.
- The earlier plan contained a sequencing loop: Phase 0A required controlled performance evidence while the executable write/load harness was scheduled in Phase 1. Phase 1 is therefore split into:
  - **Phase 1A:** remote validation harness and Phase 0A acceptance evidence; this is allowed while the Phase 0A gate is provisional.
  - **Phase 1B:** operational-control contracts and shared UI foundation; this remains blocked until Phase 0A is complete.
- This split is a gate-enabling prerequisite, not permission to proceed around a failed gate.



### Shortest safe route

The V1 baseline migration cutoff for this acceptance run is `20260714114957_search_landing_document_indexes.sql`; `20260715112649_metrics_v2_phase_0a_legacy_containment.sql` is the candidate applied only after the baseline is recorded.

1. Provision the recorded pre-Phase-0A migration cutoff on `yukti-dev` and seed the deterministic scale fixture. Do not create the V1 baseline from a checkout that already includes the Phase 0A migration. The production `yukti` project is not an acceptance fallback; this replaces the earlier generic pre-launch fallback rule.
2. Restore the deterministic data checkpoint before every trial and capture at least three identical pre-Phase-0A V1 runs with run-unique request IDs.
3. Verify that the currently linked project/branch ref exactly matches the validation ref recorded here, then inspect linked migration history and `supabase db push --linked --dry-run`; obtain explicit user approval for the persistent remote push.
4. Apply only the reviewed pending migration set, restore the same data checkpoint before every trial, and rerun the exact workload at least three times through the normal API/connection pool with one concurrent sync.
5. Record p50/p95/p99, CPU, pool utilization, lock waits, errors/deadlocks/timeouts, WAL/rows written, and controlled `pg_stat_user_tables` deltas.
6. Compare median-of-three baseline and candidate latency, require every run to pass the absolute safety gates, and investigate/repeat the entire set for any latency outlier beyond threshold. Accept only if all Phase 1A rules in the implementation plan pass; otherwise repair containment and rerun. Update this ledger before starting Phase 1B.

The CLI credential for this repository is `SUPABASE_DB_PASSWORD` in `.env.local`, not `SUPABASE_PASSWORD`. Its value must never appear in logs, commands, fixtures, or commits.

## Metrics V2 Phase 1A: Remote Acceptance Harness

Date: 2026-07-15
Status: Harness prepared; one invalid bearer-only baseline artifact recorded, one authenticated cookie-backed baseline attempt manually stopped after failure observations; acceptance evidence still not captured
Coordinator: primary Codex session

### Validation environment

- Approved isolated hosted validation project: `yukti-dev`.
- Validation project ref: `euhzgherjvjopjrpoqjr`.
- Current workspace remains linked to pre-launch `yukti` (`hcpzbnmumbykdqveyjhr`); the harness uses temporary Supabase project directories so the main checkout link is not silently changed.
- Baseline migration cutoff: `20260714114957_search_landing_document_indexes.sql`.
- Candidate migration: `20260715112649_metrics_v2_phase_0a_legacy_containment.sql`.
- Persistent candidate push remains gated by explicit approval plus `PHASE1A_ALLOW_PERSISTENT_PUSH=1`.
- Deterministic seed hash from `npm run metrics:v2:phase1a:doctor`: `8b01d754a6d8d4775620eb3f4196fb5a3ba985ed002982f20d5074d73884d223`.



### Harness files

- [scripts/metrics-v2-phase1a-acceptance.mjs](/Users/phanikrovvidi/projects/deal-flow/scripts/metrics-v2-phase1a-acceptance.mjs)
  - Commands: `doctor`, `prepare-baseline`, `baseline`, `candidate-dry-run`, `prepare-candidate`, `candidate`, and `compare`.
  - Verifies the linked project ref in the temp project before each linked operation.
  - Creates temporary baseline/candidate Supabase project directories under `/tmp` and copies only migrations through the selected cutoff.
  - Requires `PHASE1A_COOKIE`/`PERF_COOKIE` so write/read traffic uses normal authenticated Next.js API routes.
  - Candidate preparation refuses to run unless `PHASE1A_ALLOW_PERSISTENT_PUSH=1`.
- [scripts/sql/metrics-v2-phase1a/seed.sql](/Users/phanikrovvidi/projects/deal-flow/scripts/sql/metrics-v2-phase1a/seed.sql)
  - Deterministic scale fixture: one tenant, one seller admin, 10,000 buyers, 500 products, 9 locations, 9 warehouses, 100,000 commercial documents, and 250,000 lines.
  - Uses a validation-only helper schema `metrics_v2_phase1a` and deterministic UUIDs from stable keys.
  - Uses bulk-sync trigger bypass for fixture load, then refreshes current V1 snapshots once to establish the checkpoint.
- [scripts/sql/metrics-v2-phase1a/preflight-fresh-project.sql](/Users/phanikrovvidi/projects/deal-flow/scripts/sql/metrics-v2-phase1a/preflight-fresh-project.sql)
  - Adds a validation-only no-op `supabase_functions.http_request()` shim for fresh hosted projects whose Database Webhooks helper is not initialized. This keeps baseline migration application reproducible without adding outbound Zoho HTTP side effects to the metrics workload.
- [scripts/sql/metrics-v2-phase1a/reset.sql](/Users/phanikrovvidi/projects/deal-flow/scripts/sql/metrics-v2-phase1a/reset.sql)
  - Restores deterministic buyer/product/inventory/document state before each trial.
- [scripts/sql/metrics-v2-phase1a/sample-before.sql](/Users/phanikrovvidi/projects/deal-flow/scripts/sql/metrics-v2-phase1a/sample-before.sql) and [scripts/sql/metrics-v2-phase1a/sample-after.sql](/Users/phanikrovvidi/projects/deal-flow/scripts/sql/metrics-v2-phase1a/sample-after.sql)
  - Capture controlled `pg_stat_user_tables` and lock snapshots into `metrics_v2_phase1a.run_samples`.
- [scripts/sql/metrics-v2-phase1a/verify-candidate.sql](/Users/phanikrovvidi/projects/deal-flow/scripts/sql/metrics-v2-phase1a/verify-candidate.sql)
  - Inspects candidate function bodies for tenant-wide versus buyer-scoped refresh calls and deferred post-sync rebuild metadata.
- [scripts/sql/metrics-v2-phase1a/counts.sql](/Users/phanikrovvidi/projects/deal-flow/scripts/sql/metrics-v2-phase1a/counts.sql)
  - Verifies seeded fixture cardinalities.
- [package.json](/Users/phanikrovvidi/projects/deal-flow/package.json)
  - Added `metrics:v2:phase1a:*` scripts for repeatable execution.



### Frozen workload profile

- 1,000 virtual users available.
- Constant-arrival cap: 50 API requests/second.
- Duration: two-minute ramp, eight-minute sustain, two-minute ramp-down.
- Operation mix implemented in the harness:
  - 40% landing/detail reads;
  - 30% document header mutations across orders, estimates, and invoices;
  - 15% inventory mutations;
  - 10% dashboard/callout reads;
  - 5% buyer/product mutations.
- Each workload trial also starts one concurrent sync through the normal app route `POST /api/settings/integrations/sync`, using the seeded `zoho_books` tenant integration and `page_limit: 25000`. The harness records this in each trial artifact and fails the trial if the normal sync-start path fails.
- Request IDs are run-unique via `x-phase1a-request-id`.
- Trial artifacts are written to `artifacts/metrics-v2-phase1a/` unless `PHASE1A_ARTIFACT_DIR` overrides it.



### Authentication and remote harness notes

- Seller-admin login enablement was completed on `yukti-dev` for Phase 1A harness use:
  - the seeded seller admin phone/auth shape in [scripts/sql/metrics-v2-phase1a/seed.sql](/Users/phanikrovvidi/projects/deal-flow/scripts/sql/metrics-v2-phase1a/seed.sql) was corrected to include a valid `auth.users` row plus `auth.identities` for email and phone;
  - the same auth repair was applied on the hosted validation project so OTP verification could mint a seller session;
  - edge functions were deployed to `yukti-dev`, and missing isolated-project WhatsApp pricing seed rows were added so OTP dispatch could complete.
- The harness now supports either bearer or cookie input, but normal Next.js middleware enforcement means Phase 1A remote runs must use a real Supabase auth cookie for authenticated API traffic. Bearer-only input is not sufficient for this app's middleware path.



### Pending remote evidence

- Baseline migrations through `20260714114957` were applied to `yukti-dev`.
- Baseline seed initially exposed two fresh-project/fixture issues and both were fixed:
  - fresh `yukti-dev` lacked `supabase_functions.http_request`, fixed with validation-only preflight shim;
  - fixture insert assumed `app.tenant_inventory.location_id`, corrected to current `warehouse_id` grain.
- Full deterministic fixture was seeded successfully after the harness switched from one long transaction to 36 bounded seed chunks.
- Count verification passed:
  - buyers: `10000`;
  - tenant products: `500`;
  - orders: `40000`;
  - estimates: `30000`;
  - invoices: `30000`;
  - order lines: `100000`;
  - estimate lines: `75000`;
  - invoice lines: `75000`.
- Candidate dry-run passed and showed exactly one pending migration:
  - `20260715112649_metrics_v2_phase_0a_legacy_containment.sql`.
- Seller-admin OTP login now works against `yukti-dev`, and a real Supabase session cookie was obtained for authenticated Phase 1A traffic.
- Invalid baseline artifact captured:
  - `artifacts/metrics-v2-phase1a/baseline-trial-1.json` records the first bearer-only baseline attempt;
  - every API and sync request redirected with `307 Temporary Redirect`, so this artifact is not valid acceptance evidence and must not be compared against candidate results.
- Authenticated cookie-backed baseline attempt was started and then manually stopped at user request before completion.
- Live server observations from the stopped authenticated attempt showed the workload was genuinely exercising the app, but it was not acceptance-grade:
  - repeated `200` responses mixed with many application-level `403` and `409` responses;
  - `500` responses on several mutation routes;
  - Supabase pool-acquisition timeouts `PGRST003`;
  - PostgreSQL statement timeouts `57014`;
  - request latencies stretching into tens or hundreds of seconds on some routes.
- Because the stopped authenticated run violated the zero-error/zero-timeout acceptance gate and did not complete all three baseline trials, no valid baseline summary is recorded yet.
- Persistent candidate push has not yet been executed; it still requires explicit approval plus `PHASE1A_ALLOW_PERSISTENT_PUSH=1`.
- Three candidate runs have not yet been captured.
- CPU/connection utilization and WAL/rows-written evidence still require either Supabase platform telemetry export or an additional approved telemetry query path.
- Phase 0A remains not accepted for performance/resource safety until these runs pass. Phase 1B remains blocked.


### Next Steps

**DECISION** - Proceed to phase 1B

Phase 1A harness infrastructure complete. Performance acceptance is deferred—not waived—and merged into the Phase 4 capture-only staging gate. Phases 1B–3 are authorized; Phase 4 activation and all consumer cutover remain blocked.

## Metrics V2 Phase 1B: Operational-Control Contracts and Shared UI Foundation

Date: 2026-07-16
Status: Implementation complete; Phase 4 activation and all consumer cutover remain blocked by deferred Phase 0A/Phase 1A performance acceptance
Coordinator: primary Codex session

### Scope and guardrails

- Implemented Phase 1B only: harness/profile extensions, rollback-only SQL contract fixtures, shared R12 analytics primitives, focused tests, and this ledger entry.
- No Metrics V2 runtime flag, `read_model_version`, tenant metrics-routing branch, consumer read cutover, runtime-control table, dirty-work table, lease table, refresh-state table, execution-history table, persistent remote migration, or `supabase db push --linked` was added.
- Current metrics data consumers remain unchanged. Shared component refactor is intentionally compatibility-preserving through existing `MetaStrip4`, `InsightStrip4`, and `V3CalloutPanel` imports.
- UX density decision accepted for shared primitives: collapsed KPI cards show title and number only by default; collapsed callouts show avatar, name/entity title, and trailing number/status only. Supporting callout `reason` data remains typed for future overlay/detail presentation but is not rendered in collapsed rows.

### Changed files and objects

- [scripts/metrics-v2-phase1a-acceptance.mjs](/Users/phanikrovvidi/projects/deal-flow/scripts/metrics-v2-phase1a-acceptance.mjs)
  - Preserved Phase 1A commands and added Phase 1B profiles/commands for normal load, read surfaces, and rollback-only reconciliation.
  - Added normal-load defaults: 100 VUs, 10 req/s, 30-minute sustain, two-minute ramp up/down, one routine sync.
  - Added read-surface profile for dashboard, summaries, landing callouts, and detail endpoints.
  - Phase 1B artifacts include workload profile metadata and instrumentation-only `I/C/B` placeholders. Real `I/C/B` capacity thresholds remain Phase 4-only.
- [package.json](/Users/phanikrovvidi/projects/deal-flow/package.json)
  - Added `metrics:v2:phase1b:doctor`, `metrics:v2:phase1b:normal-load`, `metrics:v2:phase1b:read-surfaces`, `metrics:v2:phase1b:reconcile`, and `metrics:v2:phase1b:compare`.
- [scripts/sql/metrics-v2-phase1b/contracts.sql](/Users/phanikrovvidi/projects/deal-flow/scripts/sql/metrics-v2-phase1b/contracts.sql)
  - Rollback-only SQL contract fixture for expected Phase 2/3 dispatch-control and routine-control objects.
  - Verifies Phase 1B has not created runtime-control objects.
- [scripts/sql/metrics-v2-phase1b/reconcile-current-reads.sql](/Users/phanikrovvidi/projects/deal-flow/scripts/sql/metrics-v2-phase1b/reconcile-current-reads.sql)
  - Rollback-only current-read contract fixture confirming V1 read families remain present and current consumers are retained.
- [MetricCard.tsx](/Users/phanikrovvidi/projects/deal-flow/src/components/seller/detail/MetricCard.tsx) and [MetricGrid.tsx](/Users/phanikrovvidi/projects/deal-flow/src/components/seller/detail/MetricGrid.tsx)
  - Added adaptive 1/2/3/4 KPI primitive and exported `MetricTile`.
  - Supporting text is opt-in via `showSupportingText`; default collapsed KPI cards render only label and value.
- [MetaStrip4.tsx](/Users/phanikrovvidi/projects/deal-flow/src/components/seller/detail/MetaStrip4.tsx) and [InsightStrip4.tsx](/Users/phanikrovvidi/projects/deal-flow/src/components/seller/layout/InsightStrip4.tsx)
  - Converted to compatibility shims over `MetricGrid`; removed fixed-four warning.
- [V3CalloutPanel.tsx](/Users/phanikrovvidi/projects/deal-flow/src/components/seller/layout/V3CalloutPanel.tsx)
  - Made row `reason` optional/supporting detail and removed it from collapsed row rendering.
- [DetailHeader.tsx](/Users/phanikrovvidi/projects/deal-flow/src/components/seller/detail/DetailHeader.tsx)
  - Expanded avatar kinds for customer, warehouse, location, category, cohort, price list, campaign, and generic entities.
- [DetailTabs.tsx](/Users/phanikrovvidi/projects/deal-flow/src/components/seller/detail/DetailTabs.tsx)
  - Added `tablist`/`tab` semantics and R12 ember active styling.
- [components.test.tsx](/Users/phanikrovvidi/projects/deal-flow/src/__tests__/seller/detail/components.test.tsx), [layout components.test.tsx](/Users/phanikrovvidi/projects/deal-flow/src/__tests__/seller/layout/components.test.tsx), and [metrics-phase1b-harness.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/settings/metrics-phase1b-harness.test.ts)
  - Added focused contract coverage for adaptive metrics, quiet collapsed KPI/callout states, tab semantics, and Phase 1B harness profile/artifact/help behavior.

### Commands and results

```bash
node scripts/metrics-v2-phase1a-acceptance.mjs doctor
```

- Passed.
- Current workspace link remains `hcpzbnmumbykdqveyjhr`.
- Validation ref remains `euhzgherjvjopjrpoqjr`.
- Current deterministic seed hash reported by the harness: `3a1f4e872985d7ce72515ffeac55ee0a0f8e8bfeb99357490c0b868a1e4154be`.
- Phase 1B profile metadata printed as expected.

```bash
npm run test:unit -- src/__tests__/seller/detail/components.test.tsx src/__tests__/seller/layout/components.test.tsx src/tests/settings/metrics-phase1b-harness.test.ts
```

- Passed: 3 files, 18 tests.

```bash
npm run type-check
```

- Passed.

```bash
git diff --check
```

- Passed.

```bash
npx supabase db query --linked --file scripts/sql/metrics-v2-phase1b/contracts.sql
npx supabase db query --linked --file scripts/sql/metrics-v2-phase1b/reconcile-current-reads.sql
```

- Initial sandboxed run failed because the Supabase CLI could not write `~/.supabase/telemetry.json`.
- Re-run with approved escalation passed.
- Both fixtures are wrapped in `BEGIN`/`ROLLBACK`; no persistent object or data change was created.
- Contract fixture returned the expected Phase 2/3 object contract rows and verified no runtime-control object exists.
- Current-read fixture returned retained-consumer contract rows for seller dashboard, transaction landings, customers, products, Buyer App, low-cardinality entity pages, cohorts/pricelists/campaigns.

```bash
rg -n "df_metrics_v2|read_model_version" app src scripts --glob '!src/tests/settings/metrics-phase1b-harness.test.ts'
```

- Passed for runtime app code. Matches are limited to the Phase 1B SQL self-check strings in `scripts/sql/metrics-v2-phase1b/contracts.sql`.

```bash
rg -n "metrics_(dirty_work|runtime_control|refresh_state|refresh_leases|execution_history)" supabase/migrations app src --glob '!src/tests/settings/metrics-phase1b-harness.test.ts'
```

- Passed; no runtime-control database object creation or app dependency found.

### Exit gate

- Current metrics data consumers remain unchanged.
- No runtime Metrics V2 flag/version selector or tenant metrics-routing branch exists in app code.
- SQL fixtures execute database behavior in rolled-back linked-remote transactions.
- Workload seed/profile metadata and Phase 1B read/normal-load scenarios are reproducible; real refresh completion capacity and `I/C/B` acceptance remain a Phase 4 gate.
- No runtime-control database object was created in Phase 1B.
- Shared component contracts for 1/2/3/4 KPI states, quiet collapsed KPI/callout rows, expanded avatar kinds, and accessible tabs have focused tests.
- Phase 4 activation, consumer replacement, and cutover remain blocked until deferred Phase 0A/Phase 1A performance/resource acceptance is satisfied.

## Metrics V2 Phase 2: Additive Schema Foundation

Date: 2026-07-16
Status: Implementation complete; persistent remote push not performed; Phase 4 activation and all consumer cutover remain blocked
Coordinator: primary Codex session

### Scope and guardrails

- Implemented Phase 2 only: additive schema foundation, default-off runtime-control helper, focused schema/RLS tests, Phase 1B fixture updates, and this ledger entry.
- No capture triggers, dirty-mark functions, claim/refresh/acknowledge/tick functions, dispatcher cron, Realtime publication, API/UI consumer replacement, `df_metrics_v2`, `read_model_version`, tenant metrics-routing branch, persistent remote push, deploy, branch push, or PR creation was added.
- Correct validation target for linked checks is `yukti-dev`, ref `euhzgherjvjopjrpoqjr`. The main workspace remains linked to `yukti`/production ref `hcpzbnmumbykdqveyjhr`; Phase 2 linked validation used the existing temp project at `/tmp/deal-flow-metrics-v2-phase1a-candidate` so the main checkout link was not changed.
- One rollback-only validation was initially run against the main workspace link before the correction. It passed and rolled back, but it is not the accepted Phase 2 environment evidence. Accepted linked evidence below is from `yukti-dev`.

### Changed files and objects

- [20260716041516_metrics_v2_phase_2_additive_schema_foundation.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/migrations/20260716041516_metrics_v2_phase_2_additive_schema_foundation.sql)
  - Added business-facing scalar snapshot/read-model tables: tenant commercial, tenant inventory, tenant Buyer App, tenant setup, location, buyer, buyer-location, product, product-location, tenant daily, and location daily.
  - Added operational coordination tables: `metrics_dirty_work`, `metrics_runtime_control`, `metrics_refresh_state`, `metrics_refresh_leases`, and `metrics_execution_history`.
  - Added tenant-leading natural grain/external-ref indexes, claim/read indexes, RLS policies, explicit grants, and `app.metrics_dispatch_enabled(uuid)`.
  - `metrics_dispatch_enabled` defaults off unless a global runtime-control row explicitly enables dispatch; tenant rows can disable a tenant/domain without enabling capture or reads.
- [tests/metrics_v2_phase_2_additive_schema_foundation.sql](/Users/phanikrovvidi/projects/deal-flow/tests/metrics_v2_phase_2_additive_schema_foundation.sql)
  - Added rollback-wrapped SQL checks for object existence, RLS, grants, Realtime exclusion, unique grains, no prohibited daily facts/arrays/JSON membership columns, operational-table exception compliance, cross-tenant RLS, and dispatch helper behavior.
- [metrics-phase2-additive-schema-migration.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/settings/metrics-phase2-additive-schema-migration.test.ts)
  - Added migration-contract tests for required objects and guardrails against flags, selectors, triggers, cron, dispatcher functions, prohibited daily grains, and stored membership payloads.
- [scripts/sql/metrics-v2-phase1b/contracts.sql](/Users/phanikrovvidi/projects/deal-flow/scripts/sql/metrics-v2-phase1b/contracts.sql) and [reconcile-current-reads.sql](/Users/phanikrovvidi/projects/deal-flow/scripts/sql/metrics-v2-phase1b/reconcile-current-reads.sql)
  - Updated the rollback-only fixtures to expect Phase 2 coordination objects/helper to exist while still rejecting Phase 3 runtime functions.

### Commands and results

```bash
npx supabase migration new metrics_v2_phase_2_additive_schema_foundation
```

- Initial sandboxed run failed because Supabase CLI could not write `~/.supabase/telemetry.json`.
- Re-run with approved escalation passed and created the Phase 2 migration.

```bash
npm run test:unit -- src/tests/settings/metrics-phase2-additive-schema-migration.test.ts
npm run test:unit -- src/tests/settings/metrics-phase1b-harness.test.ts src/tests/settings/metrics-phase2-additive-schema-migration.test.ts
```

- Passed: Phase 2 guard alone, then Phase 1B+Phase 2 focused settings tests; combined run was 2 files, 9 tests.

```bash
npm run type-check
git diff --check
```

- Passed.

```bash
npx supabase db query --linked --file /tmp/metrics_v2_phase2_remote_rollback.sql
```

- Passed against `yukti-dev` via `/tmp/deal-flow-metrics-v2-phase1a-candidate`.
- The wrapper applied the Phase 2 migration and SQL contract checks inside one transaction ending with `ROLLBACK`.
- Result: `metrics_v2_phase_2_additive_schema_foundation checks passed`.
- No persistent schema object, migration-history row, or business data change was created.

```bash
npx supabase migration list --linked
```

- Passed against `yukti-dev` from the temp project after loading `SUPABASE_DB_PASSWORD` from `.env.local`.
- Remote history is present through `20260714114957`; local temp stack shows `20260715112649` pending.

```bash
npx supabase db push --linked --dry-run
```

- Passed against `yukti-dev` from the temp project after copying the new Phase 2 migration into that temp project.
- Dry-run showed exactly:
  - `20260715112649_metrics_v2_phase_0a_legacy_containment.sql`
  - `20260716041516_metrics_v2_phase_2_additive_schema_foundation.sql`
- No migration was pushed.

```bash
npx supabase db query --linked --file /tmp/metrics_v2_phase2_phase1b_fixtures_rollback.sql
```

- Passed against `yukti-dev` via the temp project.
- The wrapper applied the Phase 2 migration plus updated Phase 1B fixtures inside one transaction ending with `ROLLBACK`.
- Current consumers remained contract-only; Phase 3 runtime functions were absent.

```bash
rg -n "df_metrics_v2|read_model_version" app src scripts supabase/migrations/20260716041516_metrics_v2_phase_2_additive_schema_foundation.sql
rg -n "CREATE\s+(OR\s+REPLACE\s+)?TRIGGER|cron\.schedule|supabase_realtime|metrics_mark_dirty|metrics_claim_dirty_work|metrics_refresh_tick" supabase/migrations/20260716041516_metrics_v2_phase_2_additive_schema_foundation.sql scripts/sql/metrics-v2-phase1b
rg -n "metrics_.*(buyer|buyers|product|brand|category|warehouse|campaign|group|price_list|pricelist)_daily|\bjsonb\b|\bjson\b|\buuid\[\]|\btext\[\]" supabase/migrations/20260716041516_metrics_v2_phase_2_additive_schema_foundation.sql tests/metrics_v2_phase_2_additive_schema_foundation.sql
```

- Passed for runtime code and the Phase 2 migration.
- Matches are limited to intentional contract/test guard strings in Phase 1B SQL fixtures and Phase 2 tests.

### Exit gate

- Additive schema-contract, RLS, grant, unique-grain, no-array/no-JSON-membership, no-high-cardinality-daily, Realtime-exclusion, cross-tenant RLS, and default-off dispatch-helper checks passed in rollback mode against `yukti-dev`.
- Migration list and dry-run passed against `yukti-dev`; no persistent remote push was performed.
- New objects are unused and default off. Rollback before a persistent push is to leave the migration unapplied; after a future approved push, rollback remains leaving the additive objects disabled.
- Phase 3 may build manual dirty/claim/refresh functions on top of these objects. Phase 4 activation, capture enablement, dispatcher cron, consumer replacement, and cutover remain blocked until the deferred Phase 0A/Phase 1A performance/resource acceptance is satisfied.

## Coordinator review — Phase 3 entry and development project lock (2026-07-16)

### Decision

- **GO for Phase 3.** Phase 0 contract/audit work, Phase 0A functional containment, Phase 1B contracts/shared UI foundation, and Phase 2 additive schema checks provide the required foundation for manual dirty/claim/refresh implementation.
- Phase 2 passed schema, grants, RLS, cross-tenant isolation, grain, Realtime-exclusion, prohibited-storage-shape, default-off dispatch, migration-list, and dry-run checks against `yukti-dev` in rollback mode.
- Phase 2 has not been persistently pushed. This does not block Phase 3 implementation: Phase 3 may build and rollback-test the ordered Phase 0A → Phase 2 → Phase 3 migration chain. Any persistent remote push still requires a reviewed dry-run and explicit user approval.
- Deferred Phase 0A/1A load/resource evidence is not a Phase 3 blocker. It remains a hard Phase 4 activation gate.

### Environment lock

- All development and validation target hosted Supabase project **`yukti-dev`**, ref **`euhzgherjvjopjrpoqjr`**.
- Production project **`yukti`**, ref **`hcpzbnmumbykdqveyjhr`**, must not receive development SQL, tests, migrations, seeds, Edge Function/config/auth/storage changes, or linked CLI commands.
- Before every `--linked` command, verify the project ref is exactly `euhzgherjvjopjrpoqjr`. The main checkout may still be linked to production; use a verified temporary Supabase directory/workdir linked to `yukti-dev` and stop on any mismatch.
- At this review, `supabase/.temp/project-ref` was read-only verified as `euhzgherjvjopjrpoqjr`; future sessions must still re-verify before every linked command.
- Production work requires a new explicit user authorization naming the exact production operation. Development approval never carries over.

### Phase 3 boundary

- Implement manual dirty claim/version/lease/idempotence, bounded refresh functions, sync-completion marking, retry/dead-letter/reconciliation/freshness/kill-switch behavior, and a manually invoked sequential tick.
- Do not add interactive capture triggers, enable Cron, replace application consumers, or cut over reads. Those remain Phase 4+ work.

## Phase 3 — Manual refresh kernel (2026-07-16)

### Result

- **PASS and applied to `yukti-dev` only** (`euhzgherjvjopjrpoqjr`).
- Applied migration chain, in order:
  - `20260715112649_metrics_v2_phase_0a_legacy_containment.sql`
  - `20260716041516_metrics_v2_phase_2_additive_schema_foundation.sql`
  - `20260716050114_metrics_v2_phase_3_manual_refresh_kernel.sql`
- Production was not accessed. No Edge Function was deployed, no Cron was registered, no interactive capture trigger or feature flag was added, and no consumer was cut over.

### Implemented objects and behavior

- Added fencing epochs to all V2 snapshot/daily tables and scalar dirty-work cursors, including composite continuation for product/location and location/day range work.
- Added service-role-only dirty marking, fair `SKIP LOCKED` claim, global plus tenant/domain fenced leases, staged compute/ack/fail/release, version-scoped retry/dead-letter behavior, recovery, dispatch controls, freshness, inspection, reconciliation, rollover, age-out, and bounded pruning helpers.
- Added set-based commercial, inventory, Buyer App, setup, tenant daily, location daily, buyer-location, and product-location refreshes. Daily facts remain limited to tenant/location grain; no buyer/product/brand/category/warehouse daily table, array membership, or ranked JSON storage was introduced.
- Exact entity/location work uses same-source old/old and new/new scalar pairs. Sparse buyer-location and daily rows are not materialized as active zero rows; removed activity is soft-deleted.
- Extended sync completion marking without changing the V1 deferred-rebuild contract. `sync_run` and `analysis` remain excluded; transaction line items mark both commercial and inventory work.
- Added `supabase/functions/metrics-refresh-tick/index.ts`: authenticated by a dedicated 32+ character secret, strictly sequential claim → compute → acknowledge, 5-second request budget, and best-effort fail/release. It remains undeployed and unscheduled.

### Verification evidence

- Static contracts: `21/21` focused Vitest checks passed across Phase 1B, Phase 2, and Phase 3.
- `npm run type-check`, `git diff --check`, and concurrency-harness syntax/preflight passed.
- Ordered Phase 0A → Phase 2 → Phase 3 SQL compilation passed inside a remote transaction ending in `ROLLBACK`.
- Rollback SQL behavior fixture passed before and after push. It covers validation/coalescing, setup refresh, replay without unchanged rewrites, dirty-version reset, three-failure dead letter, expiry recovery, dispatcher-off behavior, inspection/pruning, and a large composite reconciliation with 101 products across two locations (202 product/location pairs) completed through bounded cursor pages.
- Hosted multi-connection harness passed: simultaneous claims returned one `claimed` and one `busy`; stale compute and stale acknowledgement were rejected; deterministic cleanup completed (`runId 80761819-5931-46c4-a734-a6755af773b9`).
- Final dry-run listed exactly the three migrations above. Final migration history shows all three local/remote versions aligned.
- `supabase db lint --linked --schema app` reported no Phase 3 semantic error. It reports expected false positives for functions that create session-local `pg_temp` tables, plus pre-existing unrelated application-function errors (`estimate_convert_to_order`, `estimate_duplicate`, recommendation runners, and `tick_repair_jobs`). Those are outside Metrics V2 scope.

### Performance and safety notes

- Claims are capped at 100 source rows / 100 distinct keys; range markers consume the full key budget and therefore cannot co-claim with entity work.
- Range progression is scalar and lossless: commercial `buyer → location → day → location_day`, inventory `product → product_location → location`; composite fan-outs never advance a parent cursor past unprocessed pairs.
- Database stages enforce 100 ms lock timeout and 3 s statement timeout; the Edge wrapper enforces a 5 s wall deadline and never has more than one RPC active.
- Snapshot/daily upserts use distinctness predicates. The rollback fixture verifies unchanged replay does not advance generation or timestamps. Exact multiples of 100 may require one empty continuation tick; this is bounded overhead and not a correctness risk.

### Rollback and Phase 4 gates

- Immediate operational rollback is `app.metrics_set_dispatch_enabled(false, NULL, NULL, <reason>)`; dispatch remains off by default and application reads are unchanged.
- Because the migrations are now recorded on hosted development, do not use migration repair or reset. Any schema removal must be a reviewed forward migration that first disables dispatch, revokes Phase 3 execution grants, removes the sync marker call, and only then drops Phase 3 functions/columns or the additive Phase 2 tables after confirming no consumers.
- Phase 4 remains blocked on the deferred Phase 0A/1A load/resource acceptance, interactive-capture design/review, Cron activation review, feature-flag/read-selector work, and consumer reconciliation. No production authorization exists.
