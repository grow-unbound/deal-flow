# Metrics Data Architecture Proposal — July 2026

**Status:** Proposed target architecture; no migration is authorized by this document.

**Product contract:** [Metrics product strategy](./metrics-product-strategy-proposal-2026-07.md)
**Metric semantics:** [Metrics definitions](./metrics-definitions-2026-07.md)
**Execution plan:** [Metrics V2 implementation plan](./metrics-v2-implementation-plan-2026-07.md)
**Prior performance work:** [Performance upgrade](./performance-upgrade-2026-07.md) · [DB change guidance](./db-change-guidance-2026-07.md)

## 1. Decision summary

The target is not a warehouse. It is a small operational read model over canonical documents.

1. **Invoices are the sales truth.** Estimates or Orders provide the tenant's primary demand signal; they are never added together.
2. **Landing Pulse uses compact scalar snapshots.** A header should be one bounded read, not an aggregation over the visible table page.
3. **No entity-ID arrays or ranked JSON lists live in metric tables.** Snapshots store facts about one scope/entity. Ranked membership is selected at read time.
4. **No daily rows for buyers or products.** Buyer/product history and Explore cards are computed on opening the detail page from bounded raw data.
5. **Callouts are saved query definitions, not saved result sets.** Each card fetches three rows using an indexed filter and stable sort. “See all” runs the same query with cursor pagination.
6. **Daily facts exist only for low-cardinality reporting scopes.** Keep a sparse tenant/location series for dashboard charts. Do not create brand/category/warehouse daily series unless production profiling later proves it necessary.
7. **Writes only mark dirty source keys; a budgeted micro-batch refreshes them.** There is no continuously computing worker. One low-cadence dispatcher exits immediately when no work exists and never increases concurrency to catch up.
8. **Details are deliberately on-open.** One entity, one fixed window, bounded top lists, and monthly buckets are acceptable runtime work and avoid permanent storage multiplication.

This makes landing-header retrieval effectively constant with tenant size. Landing tables and callouts remain bounded indexed reads: `O(page_size)` and approximately `O(log n + k)`, where `k` is 3 for a collapsed callout.

## 2. Primary demand contract

Resolve one value through a shared server/database helper from the persisted module configuration:

- If Sales Orders are enabled, return `orders`.
- If Sales Orders are disabled and Estimates are enabled, return `estimates`.
- If both are enabled, Orders remain the headline demand signal and Estimates are a separate upstream pipeline.
- Do not infer the choice from recent activity and do not combine Estimates and Orders: the same commercial intent can pass through both.
- Module configuration and the resolved choice change in the same transaction. Snapshots keep separate Estimate and Order facts, so changing the choice changes presentation without rewriting historical facts.
- Do not add a separate override in V1. A future override would need `effective_at`, validation against enabled modules, and an explicit rebuild/version policy.

The metric RPC should return the chosen document type so the UI can render plain labels such as “Open enquiry value” or “Open order value.”

### Period ownership

V2 snapshots support only the product contract's fixed horizons: NOW, current calendar month, trailing 90 days, and the limited prior-year fields explicitly selected. They do not materialize arbitrary Today/Week/Quarter/Year variants.

- Estimates, Sales Orders, and Invoices keep a document-table-only period filter. The raw paginated list/count uses that filter; snapshot Pulse and Actions do not.
- Seller Dashboard uses fixed This-month flow, trailing-90-day context, and NOW posture with no selector.
- Every other landing uses fixed trailing 90 days and/or NOW with no selector, as enumerated in the product strategy.
- Explore may lazily fetch at most 12 months once and slice it locally for a card-level 3M/12M/YTD choice.
- Read RPCs return `as_of`, `commercial_horizon_days`, `calendar_month`, `table_period`, and source watermark metadata as applicable. APIs do not accept a period parameter where the product surface has no period control.

## 3. What the current code does

The current implementation contains useful optimization work, but its data model still carries the high-cardinality failure mode this proposal removes.

### Improvements worth preserving

- Commit `f1038014` bounded buyer daily rebuilds to 90 days, bypassed heavy row work during bulk sync, and restricted manual repair loops to active entities.
- Commit `4393164f` added realtime pause/resume around sync, gated cohort recalculation, removed duplicate indexes, and consolidated RLS policies.
- [`20260714113035_locations_warehouses_landing_runtime_summaries.sql`](../supabase/migrations/20260714113035_locations_warehouses_landing_runtime_summaries.sql), [`20260714113113_seller_brand_category_landing_read_models.sql`](../supabase/migrations/20260714113113_seller_brand_category_landing_read_models.sql), and [`20260714113124_seller_cohort_price_list_landing_aggregates.sql`](../supabase/migrations/20260714113124_seller_cohort_price_list_landing_aggregates.sql) moved several landing reads toward bounded RPCs, summary-first-page behavior, and timeouts.
- Existing canonical document dates, status helper functions, sync trigger bypass, and location-scoping rules should remain part of the contract.

### Remaining structural risks

- `app.refresh_buyers_snapshot(tenant)` deletes and recreates every buyer/location row for a tenant. The production evidence in [`db-change-guidance-2026-07.md`](./db-change-guidance-2026-07.md) records 1,405,362 cumulative inserts and 681,065 deletes for roughly five live rows.
- `app.refresh_buyer_current_snapshot(tenant)` upserts every buyer after qualifying document writes.
- [`20260709055452_buyer_home_phase6_completion.sql`](../supabase/migrations/20260709055452_buyer_home_phase6_completion.sql) shows `app.post_sync_rebuild` refreshing every snapshot family and recent daily family after sync.
- [`20260709000001_prod_bootstrap.sql`](../supabase/migrations/20260709000001_prod_bootstrap.sql) shows `app.refresh_buyer_app_snapshot` performing multiple tenant-wide subqueries and storing ranked callout/top-buyer JSON lists. `app.record_buyer_app_activity` can invoke that full refresh from an event write.
- `app.kpi_buyer_daily` and `app.kpi_product_daily` multiply high-cardinality entities by days. `app.kpi_product_daily.on_hand` repeats current posture and is not genuine inventory history.
- Product, brand, category, location, customer, dashboard, and parts of Buyer App commercial metrics are currently order-led. They cannot be relabelled as invoiced sales without rebuilding their source logic.
- Some previously applied migration files were edited during the performance pass. Before relying on their repository definitions, compare live `pg_get_functiondef(...)`, triggers, indexes, and migration history with source control.

The target should preserve the bounded reads and sync controls, while replacing tenant-wide refreshes, high-cardinality daily tables, and stored ranked lists.

## 4. Target read model

Names below express the recommended grains. Final migration names can reuse existing tables where the grain and semantics match.

Business-facing snapshots follow the project conventions: UUID primary key, tenant-qualified deterministic `external_ref` for generated rows, audit columns, soft delete, `ON DELETE RESTRICT`, explicit `app` schema qualification, tenant RLS, and tenant-leading uniqueness/indexes. Snapshot rows also have a natural unique key for their stated grain. A snapshot's entity UUID is its row key; the prohibited pattern is storing collections of entity UUIDs inside arrays/JSON or multiplying them by day.

Dirty work, leases, run history, and scheduler state are operational coordination data—not business records. For performance, the proposal is that they keep tenant ownership, timestamps, RLS/service-role controls, and explicit retention but are exempt from `external_ref`, business-audit, and soft-delete requirements; completed coordination rows are hard-deleted by bounded retention jobs. This is a narrow proposed exception to the current project-wide table convention and must be explicitly approved in Phase 0 and recorded in `AGENTS.md` before any migration is written. Without that approval, implementation stops for a compliant alternative; it must not silently violate the convention or soft-delete an ever-growing queue.

### 4.1 Tenant domain snapshots, joined by one read RPC

Do not put every tenant metric on one hot row. Keep one typed row per tenant in each independently refreshed domain:

- `app.metrics_tenant_commercial_snapshot`: separate Estimate, Order, Invoice, receivable, overdue, and purchasing-customer scalars;
- `app.metrics_tenant_inventory_snapshot`: current in/low/out posture and invoice-qualified stock actions;
- `app.metrics_tenant_buyer_app_snapshot`: access/activity, separate Estimate/Order demand facts, repeat facts, and app/assisted invoiced-sales numerator and denominator from one watermark;
- `app.metrics_tenant_setup_snapshot`: active entity totals used in subtitles and configuration coverage.

One landing/dashboard RPC joins the required one-row domains. Each domain has its own `source_watermark`, `generation_id`, `computed_at`, and `calculation_version`; the response returns freshness per domain. A card never silently combines generations for a ratio: numerator and denominator are computed together in the owning domain.

Snapshots store Estimate and Order facts separately. The read RPC applies the shared primary-demand resolver and labels/selects one series. A module-setting change therefore does not create mixed historical daily rows or require rewriting document facts.

Use real numeric/timestamp columns for fields used in filtering, sorting, and validation. Do not use a generic key/value metric table or a JSON metrics blob.

### 4.2 `app.metrics_location_snapshot`

**Grain:** one row per tenant/location.
**Purpose:** location landing rows, location Pulse, location-scoped dashboard Pulse, and seller-assistant scope correctness.

Keep only scalar location facts: invoice sales, purchasing-customer count, separate open Estimate and Order facts, receivables/overdue, linked-warehouse count, and current stock posture where the location-to-warehouse mapping is authoritative. The read RPC resolves the displayed primary demand. No customer/product arrays.

### 4.3 `app.metrics_buyer_snapshot`

**Grain:** one row per tenant/buyer.
**Purpose:** customer table row aggregates and customer/action callout ranking.

Merge the useful responsibilities of the current buyer snapshots into buyer-scoped rows. Suggested scalars:

- invoice sales/count plus separate Estimate and Order count/value for fixed 90-day and prior-year windows;
- last invoice, last Estimate, last Order, and last Buyer App activity timestamps; the read chooses last primary demand;
- current receivable, overdue amount, oldest due date, credit used/available;
- current group/Pricelist/access flags and compact health reason enum;
- app/assisted demand and invoiced-sales values needed for channel segmentation;
- `computed_at` and `calculation_version`.

Do not store bought-product IDs, invoice IDs, campaign IDs, ranked neighbours, or trend arrays. Do not materialize zero buyer/location combinations. Refresh a buyer row by buyer ID, not all buyers in the tenant.

If seller-assistant customer rows demonstrably require location-scoped aggregates, use a separate `app.metrics_buyer_location_snapshot` with unique `(tenant_id, location_id, buyer_id)` and only rows backed by documents at that location. Never sum its location rows to obtain tenant-unique buyers; the tenant buyer snapshot is independently computed.

### 4.4 `app.metrics_product_snapshot`

**Grain:** one row per tenant/product.
**Purpose:** product table aggregates, availability callouts, and product landing Pulse.

Suggested scalars:

- current available/on-hand/reserved posture across inventory scope;
- trailing-90-day invoiced units, sales, and purchasing-customer count;
- last invoice date, no-sale-since date, and optional simple days-of-cover when the rule is accepted;
- active/published/price-completeness flags;
- `computed_at` and `calculation_version`.

This is current/fixed-window posture, not history. Refresh only products affected by invoice lines, inventory updates, or master-data changes.

If a seller-assistant product landing needs location-scoped rows, use a separate sparse `app.metrics_product_location_snapshot` with unique `(tenant_id, location_id, tenant_product_id)` and only products stocked or invoiced at that location. Do not materialize every product × location pair.

### 4.5 Low-cardinality dimension snapshots

Retain or reshape one scalar row per tenant dimension:

- `app.brands_snapshot`
- `app.categories_snapshot`
- `app.warehouses_snapshot`
- current campaign/group/Pricelist summaries where their landing table needs sortable aggregates

Invoice-led sales and current inventory should replace order-led commercial columns. These tables remain acceptable because a tenant usually has tens—not thousands—of these entities. They still must not contain member/entity ID arrays or card result JSON.

Campaign delivery/open/click counts are valid only when immutable recipient/delivery events exist. Current campaign audience membership is not historical delivery proof. Campaign demand can use directly linked Estimates/Orders; campaign-attributed invoiced sales are conditional on durable Estimate/Order-to-Invoice lineage because invoices do not carry a direct campaign ID. Group metrics describe current membership; historical group performance remains unavailable until membership-at-document-time provenance exists.

Where seller-assistant pages require location scope, a sparse location-scoped dimension row is acceptable for a proven hot landing read. Otherwise compute the dimension detail on open. Never serve a tenant-wide scalar under a location label merely to avoid the additional grain.

### 4.6 Low-cardinality daily facts

Use separate tables so tenant and location facts cannot be accidentally mixed:

- `app.metrics_tenant_daily`: unique `(tenant_id, day)`;
- `app.metrics_location_daily`: unique `(tenant_id, location_id, day)`.

Create rows only for days with activity. Tenant facts are independently computed from canonical documents; they are not obtained by summing location rows, because missing locations and multi-location semantics can differ.
**Purpose:** Seller Dashboard and location-scoped monthly charts.

Keep additive facts only: invoice count/value, Estimate count/value, Order count/value, units, and app-sourced equivalents. Do not persist a resolved primary-demand column: select Estimate or Order at read time. Do not sum daily distinct-customer counts to produce period uniques. Period-unique customer counts belong in snapshots or bounded period queries.

No buyer, product, brand, category, campaign, group, Pricelist, or warehouse daily table is part of V1. Campaign landing outcomes are a fixed trailing 90 days and campaign detail is a bounded lifetime query. Other detail trends are also on-open queries. If the tenant/location daily series is not demonstrably useful for a shipped chart, omit it and query monthly raw documents at tenant scope.

### 4.7 Dirty-work coordination tables

`app.metrics_dirty_work` is an ephemeral, typed dirty-set—not a generic message bus and not an analytical table:

- interactive writes mark distributed source keys such as a document, line, inventory row, buyer, or product; never upsert one hot `(tenant, domain)` row for every tenant write;
- `tenant_id`, `domain`, non-null `source_type`/`source_id`, scalar old/new buyer/product/location/date keys, `dirty_from`, `dirty_to`, `dirty_version`, state, attempts, lease, and timestamps;
- no arrays, JSON membership lists, payload blobs, or result lists;
- repeated work for the same source key coalesces while incrementing `dirty_version` and merging date bounds with `LEAST/GREATEST`;
- bulk sync bypasses per-row dirty marking and emits one tenant/domain/range marker only after the phase succeeds;
- claim functions use `FOR UPDATE SKIP LOCKED`, stamp `claimed_version`/`lease_until`, and commit before computation;
- the worker deletes/completes a row only when `dirty_version = claimed_version`; a concurrent change leaves it pending for the next tick;
- retry ownership is version-scoped: when `dirty_version` advances, attempts/backoff reset for the new version; a failure may dead-letter only the exact `claimed_version`, never a newer change;
- completed rows are pruned quickly; three failures of the same version with exponential backoff/jitter move that version to an observable dead-letter state.

Do not use `app.audit_log` as CDC: its coverage and payload are not authoritative across every mutation/sync path. Do not introduce PGMQ in V1: the repo does not currently use it, and a generic queue does not solve dirty-key coalescing or old/new dependency capture. Watermark scans are a reconciliation safety net, not primary change capture.

`app.metrics_refresh_state` stores one row per tenant/domain with source watermark, last successful computation, version, duration, and error/freshness state. This powers honest “updated at” UI and repair targeting.

`app.metrics_runtime_control` provides a database-local global/tenant **dispatch** kill switch, batch budgets, pause reason, and a durable global dispatcher lease. Metrics computation must be pausable without disabling business writes, sync, dirty capture, or raw reads. Transactional capture is not an everyday kill-switch surface after shadow activation.

### 4.8 Selected-surface serving map

| Surface | Pulse/subtitle source | Table-row aggregates | Actions | Detail/Explore |
| --- | --- | --- | --- | --- |
| Estimates | Commercial snapshot for fixed This-month created value and current-open posture | None; canonical document fields only | Raw estimates with status/expiry/date indexes | No duplicate Performance surface |
| Sales Orders | Commercial snapshot for fixed This-month created value and current-open posture | None; canonical document fields only | Raw orders with status-age indexes | No duplicate Performance surface |
| Invoices | Commercial snapshot for fixed This-month sales and current receivables | None; canonical document fields only | Raw invoices for due/overdue lists; buyer snapshot for grouped balances | No duplicate Performance surface |
| Customers | Commercial + setup domain snapshots | Buyer snapshot | Buyer snapshot plus raw invoice/document drill-down | One bounded buyer RPC |
| Products | Commercial + inventory + setup domain snapshots | Product snapshot | Product snapshot | One bounded product RPC plus current inventory read |
| Buyer App | Buyer App domain snapshot joined to canonical activity/source facts | Not applicable | Buyer snapshot and raw activity | Tenant/location daily series or bounded runtime aggregates |
| Campaigns | Scalar campaign snapshot or bounded campaign summary | Scalar campaign summary | Raw campaign/open facts plus linked primary-demand existence query | One bounded campaign-lifetime RPC |
| Customer Groups | Scalar current group snapshot | Group snapshot | Group snapshot/current membership queries | Current-membership RPC; no historical membership claims |
| Pricelists | Scalar current Pricelist snapshot | Pricelist snapshot | Raw validity/config exceptions | Bounded assignment/price-check RPC; no adoption history |
| Brands | Commercial/inventory domain + brand snapshots | Brand snapshot | Brand snapshot | One bounded brand RPC |
| Locations | Commercial/inventory domain + location snapshots | Location snapshot | Location snapshot plus raw expiring documents | Location row plus bounded location RPC/daily scope series |
| Warehouses | Inventory domain + warehouse snapshots | Warehouse snapshot | Warehouse/product scope snapshots plus raw inventory | Current inventory composition RPC; no historical stock trend |
| Categories | Commercial/inventory domain + category snapshots | Category snapshot | Category snapshot | One bounded category RPC |
| Seller Dashboard | Joined tenant domain snapshots | Not applicable | Three independent named queries | Tenant/location daily series and snapshot distributions |

## 5. Callouts: runtime ranking without stored membership

The proposed `limit 3` approach is the right default. A callout endpoint is a named, server-owned query contract—not arbitrary client filters—and returns:

- the first 3 rows for the collapsed card;
- a stable cursor using the sort value plus entity ID;
- the same result shape with a bounded page size, such as 25–50, for “See all”;
- direct entity-detail navigation metadata;
- optionally a cheap precomputed count; otherwise label the action “See all” without forcing an exact count.

Never fetch the full result set merely because the overlay can show all results. The overlay is cursor-paginated.

### Query-source rule

| Callout type | Read from | Example |
| --- | --- | --- |
| Simple workflow exception | Canonical raw table | Expiring estimates, overdue invoices, old draft estimates, orders waiting in a status |
| Ranked buyer/product posture | Scalar entity snapshot | Valuable inactive customers, recent sellers now out of stock, valuable assisted customers without app access |
| Low-cardinality dimension exception | Dimension snapshot or bounded raw query | Declining brand, location with overdue balance, expiring Pricelist |
| Requires cross-stage lineage or history not captured | Do not ship yet | Estimate-to-order conversion attribution, fulfilled quantity, historical campaign/group performance |

`LIMIT 3` is efficient only when filtering and ordering happen before expensive aggregation. If the query must scan and group every invoice line on each landing load, first add the required scalar to the relevant entity snapshot—or leave the callout on-open. Never solve that problem by persisting the top three IDs.

### Candidate query/index pairs

Indexes should follow real `EXPLAIN (ANALYZE, BUFFERS)` evidence. Likely patterns include:

- open estimates: tenant/location + effective status + expiry/date + ID, partial on non-deleted unresolved rows;
- receivable invoices: tenant/location or buyer + due date + ID, partial using the canonical receivable-status predicate where PostgreSQL permits a stable expression;
- buyer callouts: tenant + overdue amount/last-demand/prior-period value + buyer ID on `metrics_buyer_snapshot`;
- product availability callouts: tenant + availability + trailing sales/units + product ID on `metrics_product_snapshot`;
- all raw fact joins: tenant first, canonical document date next, then entity FK; invoice/order/estimate line tables need their document and tenant-product join paths indexed.

Prefer partial, composite, and covering indexes only for demonstrated hot paths. Avoid adding every conceivable permutation: index write cost was already a production pain point.

## 6. Detail and Explore computation

Opening an entity detail page is a lower-frequency event and can perform bounded runtime aggregation. Use one RPC per selected Performance tab that:

- requires one tenant and one entity ID;
- applies the fixed product window (normally 90 days) and a hard maximum history (normally 12 months);
- returns monthly buckets plus bounded top lists, usually 10–20 rows;
- filters by tenant/location in SQL before joins and aggregation;
- uses canonical dates and shared status helpers;
- returns null/unavailable when provenance is missing rather than inventing zero;
- has a statement timeout and is profiled on WineYard-scale and synthetic large-tenant fixtures.

Examples: customer sales/demand history, product monthly invoiced units, brand/category mix, location sales history, and warehouse availability composition. No result needs permanent trend storage for every buyer or product.

Detail Pulse can combine the entity's scalar snapshot row with the on-open RPC. Transaction details—Estimate, Order, and Invoice—should show the canonical document fields already present in the header/body and do not need duplicate performance cards.

## 7. Refresh behavior

### Interactive mutations

1. Commit the business write and tiny typed dirty-source marks in the same transaction.
2. Do not aggregate invoice lines or rebuild tenant snapshots inside the row trigger.
3. An update marks both old and new dependencies dirty. Changing invoice date, buyer, location, status, or source invalidates both canonical days/scopes; changing an item product invalidates both old and new products. Dirty-work rows carry scalars, never an ID array.
4. Process the exact buyer/product/scope dimensions asynchronously in a short set-based job.
5. For a multi-line document, mark one transient product work row per distinct affected product. This is bounded change capture, not permanent analytical membership.
6. Refetch aggregates after completion; show per-domain snapshot freshness if a just-written document is not reflected yet.

### Budgeted dispatcher, not a continuous worker

One `pg_cron` entry runs every 60 seconds and invokes one short-lived scheduled function. Cron does not compute metrics itself. The function performs an indexed pending-exists check, atomically acquires a durable global lease, and exits immediately when there is no work or another tick owns the lease. It calls claim, compute, and acknowledge RPCs sequentially so the claim transaction commits before computation. There is no resident process, drain-until-empty loop, or connection fan-out; raw business triggers never make HTTP calls.

The durable lease—not a transaction-scoped advisory lock—enforces global concurrency across the claim/compute transaction boundary. It has an owner token, monotonically increasing fencing epoch, `lease_until`, heartbeat, and compare-and-release semantics. Each compute transaction locks the global lease row, verifies the current owner/epoch and unexpired lease, and holds that row lock through snapshot writes; every snapshot write also records the fencing epoch. A new owner skips on lock contention, and a stale owner can neither commit snapshot writes nor acknowledge newer work. The lease duration starts above the five-second tick budget (initially 15 seconds) and the worker aborts rather than extending work past its wall budget. At most one tick uses one database connection at a time on the current tier.

Initial production budgets for the current tier:

- global metrics refresh concurrency: **1**;
- active refreshes per tenant/domain: **1**, enforced by a durable tenant/domain lease so contention skips rather than waits;
- inspect at most **100 dirty source rows** and refresh at most **100 distinct entity/scope keys** per tick;
- compute at most **25 set-based refresh statements/groups** per tick; one group may update a bounded key set rather than issuing one query per entity;
- `lock_timeout`: **100 ms**; routine `statement_timeout`: **3 s**; whole tick wall budget: **5 s**;
- no recursive invocation and no same-tick catch-up loop;
- no automatic concurrency increase when backlog grows.

These are conservative starting caps, not performance targets to relax speculatively. Batch size may decrease automatically after a timeout; it may increase only through a reviewed configuration change after concurrency testing. Initial backfills and manual repairs use separate, explicitly invoked jobs with their own bounded ranges and never share the routine dispatcher budget.

The claim transaction ends before aggregate computation. The claim planner leases only source rows whose derived refresh-key set fits the same tick's entity/group budget; it leaves the rest pending rather than stranding them until lease expiry. Refreshes are set-based and idempotent, and upserts use a distinctness predicate so unchanged snapshot rows are not rewritten. Business writes, reads, and sync always have resource priority.

Capacity is measured rather than assumed. Let `I` be coalesced refresh keys arriving per minute, `C` sustainable keys completed per minute under these caps, and `B` the burst backlog. Two-minute freshness applies only inside the declared normal envelope `I ≤ 0.5C`; predicted drain is `B / (C - I)` while `I < C`. At overload, the invariant is business safety: the dispatcher does not scale out, the UI reports staleness, and backlog drains over later ticks.

### Backpressure and failure behavior

- During an active bulk sync for a tenant, defer its metric refresh. The sync completion marker supplies the bounded domain/range work.
- When work exceeds the tick budget, leave it pending for the next minute. Backpressure increases metric staleness; it must never increase worker count, connection use, or query duration.
- If Cron or the scheduled-function invocation fails, dirty work remains pending for the next tick. If the function dies after claim, its durable lease expires. If compute commits but acknowledgement fails, idempotent replay and distinctness-aware upserts make the retry safe.
- Expired leases return to pending. Retry the same dirty version three times with exponential backoff and jitter, then dead-letter that version and alert; a newer version resets retry ownership.
- The UI returns per-domain `computed_at`/`as_of` metadata and shows stale/unavailable rather than a false zero.
- A database-local kill switch pauses all or one tenant's refresh instantly. Raw documents remain authoritative and readable.
- A daily bounded reconciliation scans indexed canonical `updated_at` and durable integration staging/sync metadata with an overlap window. Normal integration staging retains scalar old/new dependency keys until repair dirty work commits; only then may its checkpoint advance.
- A raw `updated_at` scan cannot infer an old buyer/product/location/date after a move. Therefore capture stays transactionally enabled in normal operation. If operators must disable it, they must either block affected mutations for that tenant/module or mark target metrics unavailable and run a full affected tenant/domain fixed-window rebuild before target reads resume. A capture-gap timestamp, final raw rows, or the union of raw and snapshot rows is not sufficient evidence of old-scope correctness.
- Dirty work, run history, and cron logs have explicit retention and are excluded from Realtime.
- Queue age, run duration, rows claimed/refreshed/unchanged, retries, dead letters, lock timeouts, temp-file writes, and snapshot write amplification are monitored.
- Rollover, age-out, reconciliation, repair, and routine refresh schedules are staggered and acquire the same durable global lease. No two metric jobs run concurrently on the current tier.

### Integration sync

1. Keep the existing heavy-trigger bypass during bulk phases.
2. Record source watermark and changed domain while syncing.
3. On successful phase completion, mark one tenant/domain/range dirty—not one item per synced row and not an unconditional rebuild of every metric family.
4. The domain job derives the dirty date range and changed entities from durable sync watermarks/staging metadata. If the integration cannot supply old keys for a changed row, rebuild that bounded domain/date range set-wise rather than pretending the old aggregate is repaired.
5. Recompute only affected canonical days and entity rows, in bounded batches.
6. Pause/resume realtime and preserve existing sync locks where they have proven useful.

### Time-driven posture

Calendar-month rollover, expiry, overdue, inactivity, repeat-within-90-days, trailing sales/velocity, prior-year value, and no-sale classifications can change without a write. Month rollover marks only the tenant commercial domain needed for fixed This-month headlines. A scheduled age-out job must select only facts crossing the 30/90/365-day boundaries since its last watermark and mark affected buyer/product/scope rows dirty. Last-demand/last-invoice snapshot indexes can identify inactivity/no-sale crossings. Tenant/location rolling totals can be rebuilt from their additive daily facts. It must not rebuild every buyer or product each midnight.

### Dependency and invalidation matrix

| Canonical change | Refresh old + new dependencies |
| --- | --- |
| Estimate/Order/Invoice header date, status, amount, source, buyer, or location | Commercial domain; old/new tenant/location day; old/new buyer; Buyer App domain when source changes |
| Invoice/Order/Estimate line product or quantity/value | Old/new product; old/new brand/category; owning buyer/location/scope; affected canonical day |
| Product brand/category reassignment | Old/new brand/category current and 90-day snapshots; product/setup domain |
| Inventory product/warehouse/location change | Old/new product/location/warehouse; inventory domain; affected brand/category posture |
| Buyer Group/Pricelist/access change | Buyer, old/new Group/Pricelist setup summaries, Buyer App/setup domains |
| Campaign link/open/activity change | Campaign snapshot; linked primary-demand existence; Buyer App domain only when its direct source field changes |
| Module setting change | Setup domain and read-label cache; raw Estimate/Order facts remain separate and are not rewritten |

The refresh contract must encode these dependencies centrally. API routes and sync functions must not each maintain their own incomplete invalidation list.

Manual repair must accept tenant, domain, and bounded date/entity scope. Avoid delete-and-reinsert of an entire high-cardinality family. Keep jobs idempotent and observable.

## 8. Reuse and retirement plan

| Current family | Decision | Reason |
| --- | --- | --- |
| `buyers_snapshot` + `buyer_current_snapshot` | Merge/reshape | One buyer-scoped scalar posture; eliminate tenant-wide refresh and redundant grains. |
| `products_snapshot` | Reuse shape, rewrite source/refresh | Product scalar posture is valuable; make sales invoice-led and refresh affected products only. |
| brand/category/location/warehouse snapshots | Reuse/reshape | Low-cardinality rows are appropriate; remove order-led sales and stored member lists. |
| estimate/order/invoice snapshots | Consolidate consumers, then retire if redundant | Transaction lists should read raw documents; tenant/location Pulse moves to scope snapshots. |
| `buyer_app_snapshot` | Replace | Keep scalar tenant contribution fields, remove JSON top/callout lists and event-triggered full refresh. |
| `kpi_buyer_daily` | Retire after consumer migration | Buyer × day is the largest avoidable multiplier. |
| `kpi_product_daily` | Retire after consumer migration | Product × day explodes and current stock copied daily is not history. |
| brand/category/warehouse daily tables | Retire by default | Details can aggregate on open; no shipped need justifies permanent daily multiplication. |
| estimate/order/invoice/tenant/location daily tables | Temporarily reuse, then consolidate selectively | Keep only the tenant/location additive series required by actual dashboard charts. |
| Buyer App raw activity/events | Keep | It is canonical behavioral evidence; aggregate it without treating events as submitted demand. |

Do not partition these metric tables now. Partitioning adds operational complexity and is appropriate only after a genuinely very large table and its access pattern justify it. The first fix is to stop creating unnecessary rows.

## 9. Feasibility and delivery bands

The product proposal's `NOW`, `90D`, and `12M` labels describe the metric's time meaning, not engineering duration. Its feasibility codes map to implementation work as follows:

| Code | Current codebase meaning | Typical work |
| --- | --- | --- |
| `READY` | Correct raw fields exist and an existing aggregate or simple bounded/indexable query can support the definition | Named read/route wiring, copy, status-edge and sparse-data tests |
| `REWORK` | Raw evidence exists but current API/aggregate uses the wrong source, grain, or definition | New scalar/read-model column or RPC, backfill, consumer switch, comparison tests |
| `ON-OPEN` | Safe for one bounded entity query; not worth permanent storage | Detail RPC, supporting indexes if evidence requires, lazy-loaded card |
| `CONDITIONAL` | Data exists only under an explicit configuration or reliable mapping | Add/validate the contract first; hide otherwise |
| `LATER` | Required provenance/history is absent | Do not approximate in V1 |

The authoritative phase sequence, subagent work packages, quantitative gates, and rollback procedure live in [Metrics V2 implementation plan](./metrics-v2-implementation-plan-2026-07.md). While the application remains pre-launch, run current and target reads side-by-side only through reconciliation tooling against an isolated hosted Supabase development/staging branch or project for at least one full sync, then replace consumers directly. The local Docker Supabase stack is not part of this program. Do not add a Metrics V2 runtime flag/version selector or dual-write indefinitely. If the app becomes live before cutover, stop and add a live-migration amendment first.

## 10. Validation gates

Before rollout:

- reconcile invoice sales to raw invoice totals for status edges, credit notes/voids, canonical date fallbacks, and location scope;
- verify primary-demand labels and values for Estimates-only, Orders-only, and both-enabled tenants;
- test multi-line joins do not multiply document totals;
- test sparse/no-data behavior as unavailable versus true zero;
- test cross-tenant and seller-assistant location isolation;
- run `EXPLAIN (ANALYZE, BUFFERS)` on every landing, callout collapsed/overlay, and detail RPC at realistic cardinalities;
- measure rows touched and job duration for one document write, a 2-day routine sync, and a 90-day initial sync;
- ensure no refresh function loops all buyers/products for a single entity change;
- move a document across date, status, buyer, location, and product dimensions and prove both old and new aggregates repair;
- advance the clock across 30/90/365-day boundaries and prove rolling buyer/product classifications age out without a source write;
- prove tenant daily facts are never summed together with location daily facts and location rows do not double-count tenant-unique customers;
- exercise dirty-range coalescing, same-domain concurrency, retry/dead-letter handling, and completed-work pruning;
- confirm no metric table contains entity-ID arrays, top-list JSON, or buyer/product daily rows;
- compare repository functions with live `pg_get_functiondef`, triggers, policies, indexes, and migration history before authoring follow-up migrations.

## 11. Explicit non-goals for V1

- historical inventory trends, ageing, true turns, or fill rate without an inventory/fulfilment ledger;
- historical gross margin without cost-at-sale provenance;
- estimate-to-order or order-to-invoice conversion without durable lineage;
- historical group/campaign audience attribution without membership/delivery history;
- daily trend storage for every buyer or product;
- exact callout result membership stored in snapshot, summary, KPI, cache, or JSON columns.
