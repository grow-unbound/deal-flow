# Metrics Aggregation Execution Log

Date: 2026-07-07
Source of truth: [metrics-aggregation-standardization-plan-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-aggregation-standardization-plan-2026-07.md)
Owner: Master session
Status: Phases 0-3 complete; later-phase frontend/read-model work intentionally deferred

## Working Rules

- This file is the shared execution log for all phases of the metrics aggregation standardization effort.
- Every subagent and implementation task must append findings, decisions, risks, and follow-ups here.
- Every implementation subtask must begin by reading:
  - [metrics-definitions-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-definitions-2026-07.md)
  - [metrics-aggregation-standardization-plan-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-aggregation-standardization-plan-2026-07.md)
  - [metrics-aggregation-execution-log-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-aggregation-execution-log-2026-07.md)
- The Master session owns coordination, standards, phase boundaries, and final review.
- No implementation phase should begin until the prior phase's findings and decisions are recorded here.



## Subagent Protocol



### Role split

- Master session:
  - Owns sequencing, standards enforcement, and final acceptance.
  - Decides whether a phase is complete.
  - Consolidates cross-phase drift, open questions, and follow-up work.
- Investigator subagent:
  - Locates code paths, SQL objects, triggers, and call sites.
  - Produces inventory and mismatch findings.
- Builder subagent:
  - Executes narrow implementation tasks, ideally one small aggregate contract or one route family at a time.
  - Updates this file with what changed and what still needs review.
- Reviewer subagent:
  - Reviews diffs for contract mismatches, page-scoped KPI regressions, and drift from the metric dictionary.



### Phase execution rule

- Each phase should have one clearly named section in this file with:
  - goal
  - subagent owner(s)
  - tasks
  - decisions
  - open questions
  - exit criteria



### Logging rule

- Every subagent entry should be additive.
- Do not erase prior findings; supersede them with a dated note if a conclusion changes.



## Phase 0



### Goal

Verify the live/local schema, migrations, RPCs, triggers, cron jobs, and frontend data paths for snapshot, KPI, and summary tables before implementation.

### Verification method

- Live schema/function inspection via Supabase MCP.
- Local migration review under `supabase/migrations`.
- Frontend and API route tracing under `app/` and `src/`.
- No code changes made during Phase 0.



### Confirmed live aggregate tables

- Snapshots:
  - `app.brands_snapshot`
  - `app.buyer_app_snapshot`
  - `app.categories_snapshot`
  - `app.customers_snapshot`
  - `app.estimates_snapshot`
  - `app.invoices_snapshot`
  - `app.locations_snapshot`
  - `app.products_snapshot`
  - `app.warehouses_snapshot`
- Daily KPI tables:
  - `app.kpi_brand_daily`
  - `app.kpi_buyer_app_daily`
  - `app.kpi_category_daily`
  - `app.kpi_location_daily`
  - `app.kpi_product_daily`
  - `app.kpi_tenant_daily`
  - `app.kpi_warehouse_daily`



### Confirmed missing aggregate tables vs target spec

- `app.orders_snapshot`
- `app.kpi_estimates_daily`
- `app.kpi_orders_daily`
- `app.kpi_invoices_daily`
- `app.kpi_buyers_daily`
- buyer-scoped current snapshot table aligned to the spec target, such as `app.buyer_current_snapshot`

Naming note:

- `app.customers_snapshot` is the current live name, but `app.buyers_snapshot` is the preferred long-term name for consistency with the domain model and table naming.
- Future migrations should either rename `customers_snapshot` to `buyers_snapshot` with compatibility handling, or introduce a stable read view/function so frontend code no longer depends on the inconsistent customer/buyer naming.



### Aggregate ownership summary



#### Snapshot ownership

- `brands_snapshot`
  - refresh: `app.refresh_brands_snapshot`
  - write triggers/dispatchers: `dispatch_from_tenant_brands`, `dispatch_from_tenant_products`
  - rebuild path: `app.post_sync_rebuild`
- `buyer_app_snapshot`
  - refresh: `app.refresh_buyer_app_snapshot`
  - write triggers/dispatchers: `dispatch_from_buyers`, `dispatch_from_buyer_users`, `dispatch_from_orders`, `dispatch_from_estimates`, `dispatch_from_invoices`
  - rebuild path: `app.post_sync_rebuild`
- `categories_snapshot`
  - refresh: `app.refresh_categories_snapshot`
  - write triggers/dispatchers: `dispatch_from_tenant_products`, `dispatch_from_inventory`
  - rebuild path: `app.post_sync_rebuild`
- `customers_snapshot`
  - refresh: `app.refresh_customers_snapshot`
  - write triggers/dispatchers: `dispatch_from_buyers`
  - rebuild path: `app.post_sync_rebuild`
- `estimates_snapshot`
  - refresh: `app.refresh_estimates_snapshot`
  - write triggers/dispatchers: `dispatch_from_estimates`
  - rebuild path: `app.post_sync_rebuild`
- `invoices_snapshot`
  - refresh: `app.refresh_invoices_snapshot`
  - write triggers/dispatchers: `dispatch_from_invoices`
  - rebuild path: `app.post_sync_rebuild`
- `locations_snapshot`
  - refresh: `app.refresh_locations_snapshot`
  - write triggers/dispatchers: `dispatch_from_inventory`, `dispatch_from_invoices`
  - rebuild path: `app.post_sync_rebuild`
- `products_snapshot`
  - refresh: `app.refresh_products_snapshot`
  - write triggers/dispatchers: `dispatch_from_tenant_products`, `dispatch_from_inventory`
  - rebuild path: `app.post_sync_rebuild`
- `warehouses_snapshot`
  - refresh: `app.refresh_warehouses_snapshot`
  - write triggers/dispatchers: `dispatch_from_inventory`
  - rebuild path: `app.post_sync_rebuild`



#### KPI ownership

- `kpi_brand_daily`
  - refresh: `app.refresh_kpi_brand_daily`
  - write triggers/dispatchers: `dispatch_from_order_items`
  - rebuild path: `app.rebuild_kpi_brand_daily_for_tenant`, `app.post_sync_rebuild`
- `kpi_buyer_app_daily`
  - refresh: `app.refresh_buyer_app_daily`
  - write triggers/dispatchers: `dispatch_from_orders`, `dispatch_from_estimates`, `dispatch_from_invoices`
  - rebuild path: `app.rebuild_buyer_app_daily_for_tenant`, `app.post_sync_rebuild`
- `kpi_category_daily`
  - refresh: `app.refresh_kpi_category_daily`
  - write triggers/dispatchers: `dispatch_from_order_items`
  - rebuild path: `app.rebuild_kpi_category_daily_for_tenant`, `app.post_sync_rebuild`
- `kpi_location_daily`
  - refresh: `app.refresh_kpi_location_daily`
  - write triggers/dispatchers: `dispatch_from_orders`
  - rebuild path: `app.rebuild_kpi_location_daily_for_tenant`, `app.post_sync_rebuild`
- `kpi_product_daily`
  - refresh: `app.refresh_kpi_product_daily`
  - write triggers/dispatchers: `dispatch_from_order_items`, `dispatch_from_inventory`
  - rebuild path: `app.rebuild_kpi_product_daily_for_tenant`, `app.post_sync_rebuild`
- `kpi_tenant_daily`
  - refresh: `app.refresh_kpi_tenant_daily`
  - write triggers/dispatchers: `dispatch_from_orders`, `dispatch_from_order_items`
  - rebuild path: `app.rebuild_kpi_tenant_daily_for_tenant`, `app.post_sync_rebuild`
- `kpi_warehouse_daily`
  - refresh: `app.refresh_kpi_warehouse_daily`
  - write triggers/dispatchers: `dispatch_from_inventory`
  - rebuild path: `app.rebuild_kpi_warehouse_daily_for_tenant`, `app.post_sync_rebuild`



### Live cron observation

- Live `cron.job` inventory is empty.
- Conclusion:
  - no live cron-owned aggregate refresh jobs are currently active
  - no live retention/prune schedule is currently active
  - local migration intent and live scheduling state are not aligned



### Frontend and API consumers by aggregate



#### `brands_snapshot`

- Seller brands landing:
  - [app/api/tenant/brands/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/brands/route.ts)



#### `buyer_app_snapshot`

- Seller buyer app landing:
  - [app/api/tenant/buyer-app/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/buyer-app/route.ts)



#### `categories_snapshot`

- Seller categories landing:
  - [app/api/tenant/categories/landing/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/categories/landing/route.ts)



#### `customers_snapshot`

- Seller customers landing:
  - [app/api/tenant/customers/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/customers/route.ts)
- Seller customers summary:
  - [app/api/tenant/customers/summary/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/customers/summary/route.ts)
- Seller brands landing also reads active customer count:
  - [app/api/tenant/brands/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/brands/route.ts)



#### `estimates_snapshot`

- Seller estimates landing:
  - [app/api/tenant/estimates/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/estimates/route.ts)
- Seller estimates summary:
  - [app/api/tenant/estimates/summary/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/estimates/summary/route.ts)



#### `invoices_snapshot`

- Seller invoices landing:
  - [app/api/tenant/invoices/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/invoices/route.ts)
- Seller invoices summary:
- [app/api/tenant/invoices/summary/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/invoices/summary/route.ts)



#### `locations_snapshot`

## Phase 1 Tranche 1

### Goal

Create the first document-scoped aggregate contract for seller landings so order, estimate, and invoice KPI cards stop depending on paginated row slices and seller assistants can read location-scoped document metrics directly.

### Owner

- Builder subtask in master session

### Completed

- Added a new migration:
  - `app.orders_snapshot`
  - `app.kpi_estimates_daily`
  - `app.kpi_orders_daily`
  - `app.kpi_invoices_daily`
- Standardized document aggregate day bucketing to IST with canonical precedence:
  - estimates: `estimate_date`, fallback `created_at`
  - orders: `order_date`, fallback `created_at`
  - invoices: `invoice_date`, fallback `created_at`
- Wired dispatch/rebuild ownership for the new document aggregates:
  - `dispatch_from_estimates`
  - `dispatch_from_orders`
  - `dispatch_from_invoices`
  - `post_sync_rebuild`
- Added `orders_snapshot` current-state buckets for total/open/status/source counts.
- Added `customers_snapshot.total_count` compatibility support in both schema and route reads.
- Removed the bad KPI-table `deleted_at` assumption in the in-scope order landing by switching reads to the new document KPI tables.
- Migrated seller landing KPI reads in scope:
  - [app/api/tenant/orders/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/orders/route.ts)
  - [app/api/tenant/estimates/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/estimates/route.ts)
  - [app/api/tenant/invoices/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/invoices/route.ts)
- Filled missing canonical order-date writes in [app/api/tenant/orders/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/orders/route.ts) draft creation by writing `order_date`.

### Compatibility Shims

- `app.customers_snapshot` remains the live table name; this tranche adds `total_count` instead of renaming the table.
- [app/api/tenant/customers/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/customers/route.ts) now reads `customers_snapshot` with `select('*')` so it tolerates pre-migration rows that do not yet expose `total_count`.
- Document daily tables intentionally retain history in this tranche; they are excluded from the existing 90-day prune path so current-state counts can be reconstructed from aggregate rows without falling back to raw documents.

### Pending

- `kpi_buyers_daily`, buyer-home aggregates, days-cover, and buyer current snapshot work remain out of scope for this tranche.
- Any non-tranche seller dashboard or detail-page consumers still reading raw document tables or old aggregate paths remain for later phases.
- Invoice status taxonomy beyond the currently implemented flow remains pending final product confirmation.

### Risks / Follow-up

- Order list queries in the seller landing still use the existing row fetch path while KPI cards use canonical-date aggregates. This tranche fixes KPI correctness first; full row/list canonical-date alignment is follow-up work.
- Estimate and invoice callout sections still derive from fetched rows, by design for this tranche. KPI cards no longer do.

- Seller locations landing:
  - [app/api/tenant/locations/landing/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/locations/landing/route.ts)



#### `products_snapshot`

- Seller products landing:
  - [app/api/tenant/products/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/products/route.ts)
- Seller products summary:
  - [app/api/tenant/products/summary/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/products/summary/route.ts)



#### `warehouses_snapshot`

- Seller warehouses landing:
  - [app/api/tenant/warehouses/landing/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/warehouses/landing/route.ts)
- Warehouse detail helper:
  - [src/lib/server/warehouse-data.ts](/Users/phanikrovvidi/projects/deal-flow/src/lib/server/warehouse-data.ts:305)



#### `kpi_brand_daily`

- Seller brands landing:
  - [app/api/tenant/brands/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/brands/route.ts)



#### `kpi_buyer_app_daily`

- Seller buyer app landing:
  - [app/api/tenant/buyer-app/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/buyer-app/route.ts)



#### `kpi_category_daily`

- Seller categories landing:
  - [app/api/tenant/categories/landing/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/categories/landing/route.ts)
- Seller category detail:
  - [app/api/tenant/categories/[id]/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/categories/[id]/route.ts)



#### `kpi_location_daily`

- Seller location detail trend:
  - [app/api/tenant/locations/[id]/detail/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/locations/[id]/detail/route.ts:142)



#### `kpi_product_daily`

- Seller products landing:
  - [app/api/tenant/products/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/products/route.ts)
- Seller categories landing:
  - [app/api/tenant/categories/landing/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/categories/landing/route.ts)
- Seller category detail:
  - [app/api/tenant/categories/[id]/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/categories/[id]/route.ts)
- Seller dashboard top-brand computation:
  - [src/lib/server/seller-dashboard.ts](/Users/phanikrovvidi/projects/deal-flow/src/lib/server/seller-dashboard.ts:239)



#### `kpi_tenant_daily`

- Seller sales orders landing:
  - [app/api/tenant/orders/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/orders/route.ts:193)
- Seller dashboard:
  - [src/lib/server/seller-dashboard.ts](/Users/phanikrovvidi/projects/deal-flow/src/lib/server/seller-dashboard.ts:396)



#### `kpi_warehouse_daily`

- Warehouse detail trend:
  - [src/lib/server/warehouse-data.ts](/Users/phanikrovvidi/projects/deal-flow/src/lib/server/warehouse-data.ts:334)



### Phase 0 observations



#### 1. Real schema drift exists

- The customers landing route reads `customers_snapshot.total_count`, but the live table does not have that column.
- This is a confirmed contract mismatch between live schema and application code.



#### 2. Aggregate coverage is incomplete for document flows

- Orders still lack a snapshot table.
- Estimates, orders, and invoices still lack document-specific daily fact tables.
- `kpi_tenant_daily` is currently being used as a partial order summary stand-in.



#### 2a. Buyer/customer aggregate coverage is also incomplete

- Seller customers/buyers landing and detail are the only major entity family missing the equivalent daily buyer KPI table.
- Target coverage must include:
  - `app.buyers_snapshot`, or a compatibility-safe replacement for `app.customers_snapshot`.
  - `app.kpi_buyers_daily`.
- Buyer/customer pages should use these aggregates for selected-period row metrics and current-state KPI/callout values instead of rebuilding buyer metrics from raw orders, estimates, and invoices per request.



#### 3. Some pages still compute KPI-like values from raw rows

- Buyer home reads raw invoices and orders, plus `loadBuyerCreditSnapshot`, instead of using buyer-scoped aggregate read models:
  - [app/api/buyer/home/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/buyer/home/route.ts:69)
- Locations landing mixes `locations_snapshot` with raw `orders`, `estimates`, and `invoices` queries:
  - [app/api/tenant/locations/landing/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/locations/landing/route.ts:52)
- Brand detail still derives its metrics from raw products, inventory, catalogs, orders, and order items instead of entity-scoped aggregate reads:
  - [app/api/tenant/brands/[id]/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/brands/[id]/route.ts:115)



#### 4. Buyer app access page still uses page-scoped counts for some KPIs

- The route explicitly documents that suggested/inactive totals are page-scoped until the aggregate is extended:
  - [app/api/tenant/buyer-app/access/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/buyer-app/access/route.ts:12)
  - [app/api/tenant/buyer-app/access/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/buyer-app/access/route.ts:166)



#### 5. Metric semantics are still inconsistent

- Orders:
  - `kpi_tenant_daily` includes non-cancelled drafts because it filters only `status <> 'cancelled'`.
  - `kpi_brand_daily`, `kpi_category_daily`, and `kpi_location_daily` exclude both `cancelled` and `draft`.
- Buyer app estimates:
  - `refresh_buyer_app_daily` uses `created_at` for estimate-day bucketing.
  - The source-of-truth spec requires `estimate_date`, with fallback to `created_at`.
- Product KPI trend semantics:
  - `kpi_product_daily.on_hand` stores current on-hand posture into historical rows, which is acceptable for current posture cards but misleading for true historical stock trend semantics.



#### 6. Live cron state weakens retention and rebuild assumptions

- Local migrations define prune/schedule behavior.
- Live DB currently has no scheduled jobs.
- Any Phase 1 design that assumes live cron pruning already exists would be incorrect.



## Recommended Phase 1 Sequence



### Phase 1.1: Metric Dictionary Freeze

Superseded note:

- The embedded Phase 1.1 metric dictionary below is retained as audit history.
- Do not implement from the embedded draft definitions where they conflict with [metrics-definitions-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-definitions-2026-07.md) or the "Phase 1.1 Superseding Product Decisions" section below.
- Known superseded items include order date semantics, active-buyer semantics, campaign conversion semantics, seller-assistant campaign access, and days-cover treatment.

Goal:

- Freeze exact definitions for seller landing KPIs, seller detail KPIs, buyer home cards, and buyer app metrics before any DDL or route rewrite.

Subagent shape:

- investigator for current metric use sites
- reviewer for definition conflicts
- master for final sign-off

Deliverables:

- metric-by-metric dictionary
- status inclusion/exclusion matrix
- date column matrix
- timezone rule
- role/scope behavior
- filter behavior rule

Phase 1.1 execution note:

- Date: 2026-07-07
- Timezone: Asia/Kolkata
- Scope boundary:
  - This phase freezes metric semantics only.
  - No schema, route, function, trigger, cron, or migration changes are in scope.
  - Any unresolved metric behavior is recorded as an open question instead of inferred into implementation work.

Decisions:

- The metric dictionary is frozen before any new aggregate table, refresh function, or route contract is changed.
- Seller landing KPI cards and callouts are full-universe summary numbers for the selected period, never page-scoped reductions.
- Seller detail header KPIs and trend tabs must inherit the same metric semantics as the landing-page dictionary, narrowed only by entity grain.
- Buyer home financial cards must use the same document/date/status rules as seller metrics, but at buyer scope rather than tenant/entity scope.
- Current-stock posture and historical activity metrics remain distinct concepts and must not be merged under one label.
- `days_cover` is not part of the frozen critical KPI set until demand-velocity and stock-reservation semantics are explicitly approved.

Metric dictionary freeze:

- GMV:
  - Meaning: value of commercial flow for the selected period.
  - Type: period-scoped additive metric.
  - Scope: tenant-wide for `seller_admin`; assigned-location-only for `seller_assistant`.
  - Filter behavior: unaffected by search/filter/sort state on landing tables.
- Orders count:
  - Meaning: count of orders in the selected period using the approved order status rules.
  - Type: period-scoped additive metric.
  - Scope: tenant-wide for `seller_admin`; assigned-location-only for `seller_assistant`.
  - Filter behavior: unaffected by search/filter/sort state on landing tables.
- AOV:
  - Meaning: GMV divided by orders count for the same scope, date window, and status set.
  - Type: derived period-scoped metric.
  - Scope: tenant-wide for `seller_admin`; assigned-location-only for `seller_assistant`.
  - Filter behavior: unaffected by search/filter/sort state on landing tables.
- Active buyers:
  - Meaning: currently active/enabled buyers in the visible role scope.
  - Type: current-state metric.
  - Scope: tenant-wide for `seller_admin`; assigned-location-only for `seller_assistant`.
  - Filter behavior: unaffected by search/filter/sort state on landing tables.
- Open orders:
  - Meaning: current count of non-terminal orders still operationally open.
  - Type: current-state metric.
  - Scope: tenant-wide for `seller_admin`; assigned-location-only for `seller_assistant`.
  - Filter behavior: unaffected by search/filter/sort state on landing tables.
- Outstanding dues:
  - Meaning: unpaid buyer receivables outstanding as of now.
  - Type: current-state metric.
  - Scope: tenant-wide for `seller_admin`; assigned-location-only for `seller_assistant`; buyer-only on buyer home.
  - Filter behavior: unaffected by search/filter/sort state on landing tables.
- Overdue amount/count:
  - Meaning: overdue receivables past due as of now, expressed as amount and document/count breakdown where needed.
  - Type: current-state metric.
  - Scope: tenant-wide for `seller_admin`; assigned-location-only for `seller_assistant`; buyer-only on buyer home.
  - Filter behavior: unaffected by search/filter/sort state on landing tables.
- Credit used and available credit:
  - Meaning: current credit exposure and remaining headroom.
  - Type: current-state metric.
  - Scope: tenant-wide for `seller_admin`; assigned-location-only for `seller_assistant`; buyer-only on buyer home.
  - Filter behavior: unaffected by search/filter/sort state on landing tables.
- Low stock and stockout:
  - Meaning: current posture counts for inventory risk states.
  - Type: current-state metric.
  - Scope: tenant-wide for `seller_admin`; assigned-location-only for `seller_assistant`.
  - Filter behavior: unaffected by search/filter/sort state on landing tables.
- Inventory on hand and sellable units:
  - Meaning: current inventory posture, not historical daily stock trend.
  - Type: current-state metric.
  - Scope: tenant-wide for `seller_admin`; assigned-location-only for `seller_assistant`.
  - Filter behavior: unaffected by search/filter/sort state on landing tables.
- Catalog/campaign views:
  - Meaning: period-scoped buyer engagement counts attributed to the selected catalog/campaign.
  - Type: period-scoped additive metric.
  - Scope: tenant-wide for `seller_admin`; assigned-location-only for `seller_assistant` where access is location-scoped.
  - Filter behavior: unaffected by search/filter/sort state on landing tables.
- Conversion count and conversion rate:
  - Meaning: downstream conversion from campaign/catalog engagement into estimates/orders/GMV using the approved attribution contract.
  - Type: period-scoped additive plus derived metric.
  - Scope: tenant-wide for `seller_admin`; assigned-location-only for `seller_assistant` where access is location-scoped.
  - Filter behavior: unaffected by search/filter/sort state on landing tables.
- Buyer app GMV/orders/estimates/invoices:
  - Meaning: buyer-app-attributed commercial flow for the selected period.
  - Type: period-scoped additive metrics.
  - Scope: tenant-wide for `seller_admin`; assigned-location-only for `seller_assistant`; buyer-only on buyer home where applicable.
  - Filter behavior: unaffected by search/filter/sort state on landing tables.

Status/date/timezone rules:

- Tenant-facing period metrics use `Asia/Kolkata` day boundaries everywhere.
- Orders use `placed_at` as the primary period date.
- Estimates use `estimate_date`, falling back to `created_at` when `estimate_date` is missing.
- Invoices use `invoice_date` as the primary period date.
- Draft estimates, draft orders, and draft invoices are included in total flow metrics when the product intent is to show business flow and buyer engagement.
- Cancelled documents are excluded from flow metrics unless a page explicitly exposes cancelled-state counts as a separate metric.
- Converted/confirmed/paid/completed quality metrics remain separate from total flow metrics and must not silently replace them.
- Current-state metrics such as dues, credit exposure, stock posture, and open-order counts are evaluated as "now" values, not by period bucketing.

Scope rules for `seller_admin` vs `seller_assistant`:

- `seller_admin` summary numbers represent the full tenant universe inside the selected period or current-state scope.
- `seller_assistant` summary numbers represent only the assistant's assigned-location universe for both rows and KPIs.
- The role scope rule applies consistently to KPI cards, callouts, detail-page headers, trend tabs, and exported summary payloads.
- No page may show tenant-wide KPI cards to `seller_assistant` while showing location-scoped rows beneath them.

Filter behavior rules:

- Search, filters, sort, cursor, and page size affect table rows only.
- KPI cards and callouts do not switch into filtered mode on seller landing pages.
- Row-level metrics for visible rows may reflect the selected period, but not a page-level reduction over only the loaded result slice.
- Detail-page related tables may be filtered and paginated, but the page header KPI contract remains entity-scoped rather than table-slice-scoped.



Open questions:

- Exact terminal and open-status membership for order current-state metrics needs explicit product confirmation:
  - whether `draft` belongs in current open-order counts, not just flow metrics
  - whether `cancelled` and any future archived/rejected states require separate visible buckets
- Exact estimate and invoice status taxonomies need confirmation before document-specific daily fact tables are designed.
- "Active buyers" needs a final product definition:
  - enabled buyers only
  - buyers with recent activity
  - buyers with transactions in the selected period
- Buyer app "opened app MTD" is decided as activity-based usage, but the exact qualifying activity event still needs one canonical definition.
- Campaign/catalog conversion attribution window and tie-break rules need explicit product confirmation before implementation.
- Whether seller-assistant access for campaign/catalog metrics is always reducible to assigned locations remains unresolved for tenants where campaigns are not location-bound.
- Buyer home YTD retention strategy is intentionally not decided in Phase 1.1; it belongs to later schema/read-model work.

Exit criteria:

- The execution log contains the frozen metric dictionary, status rules, date rules, timezone rule, role-scope rule, and filter behavior rule for Phase 1.1.
- Any metric still lacking a single product definition is listed under open questions rather than left implicit.
- Later phases may not introduce conflicting status/date/filter semantics without first superseding this Phase 1.1 section in the execution log.



### Phase 1.1 Superseding Product Decisions

Date: 2026-07-07

This section supersedes the unresolved open questions from Phase 1.1. Future implementation work should use [metrics-definitions-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-definitions-2026-07.md) as the golden source, not the embedded Phase 1.1 draft dictionary above.

Decisions:

- Terminal/open memberships:
  - Draft documents are included in open estimates, open orders, and open invoices.
  - Cancelled, archived, rejected, void, and expired states should be stored in KPI/snapshot status buckets for auditability and future use, but not exposed in standard KPI cards yet.
- Estimate status taxonomy:
  - `draft -> sent -> accepted -> converted/invoiced/void/expired/declined`
- Invoice status taxonomy:
  - `draft -> sent -> viewed -> partially_paid/overdue/unpaid -> paid/void`
  - Still needs final confirmation before implementation. Use [metrics-definitions-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-definitions-2026-07.md) for the provisional receivables/accounting rule.
- Order status taxonomy:
  - `draft -> open/accepted -> converted/invoiced -> closed/void`
- Active buyers:
  - Seller context means buyers with at least one estimate, order, or invoice in the selected period.
  - Buyer-app context means `buyers.is_buyer_app_enabled = true` and buyer does at leas tone tracked app event or buyer-app API GET/POST in selected period.
- Buyer app usage:
  - `opened_app_mtd` means successful login or existing-session app access with at least one tracked app event or buyer-app API GET/POST.
  - Repeat users have at least two qualifying events.
  - At-least-one-order means a buyer-app estimate or order exists in the selected period.
- Campaign funnel:
  - `notified`: message sent.
  - `delivered`: WhatsApp delivery webhook.
  - `viewed`: buyer opened the campaign in the app, including campaign/list GET.
  - `ordered`: at least one estimate or order contains at least one campaign SKU.
  - Campaign conversion tracks estimate count, order count, unique buyers, and attributed GMV.
- Seller assistant access:
  - Seller assistants do not access campaigns or any GROW-navbar page.

Metric definition changes:

- GMV should be document-specific:
  - estimates GMV for estimates
  - orders GMV for orders
  - invoices GMV for invoices, using standard receivables/accounting treatment
- Counts should be document-specific:
  - `estimates_count`
  - `orders_count`
  - `invoices_count`
- AOV applies to estimates, orders, and invoices separately.
- Outstanding dues come from sent/issued and partially-paid invoice receivables.
- Overdue amount/count use outstanding invoice amount past `due_date`.
- Campaign views mean a buyer opened the campaign in the app.

Schema/read-model implications:

- Add `app.kpi_buyers_daily` to the target aggregate family and use it like how other `app.kpi_*_daily` tables are used.
- Prefer renaming `app.customers_snapshot` to `app.buyers_snapshot` for consistency, with compatibility handling.
- Ignore `tier_counts` for distributor operations.
- Buyer/current snapshot should include active, dormant, due, overdue counts, due amount, and overdue amount.
- Days cover should be revisited as an invoice-velocity metric:
  - `days_cover = current_stock / recent_invoice_velocity`
  - support location-level and aggregate product-level views if the query can stay reliable and affordable
  - return null/insufficient-data when velocity is zero or unavailable
- Transaction date standard:
  - estimates use `estimate_date`, fallback `created_at`
  - orders use `order_date`, fallback `created_at`
  - invoices use `invoice_date`, fallback `created_at`
- CREATE and conversion flows must be reviewed so `estimate_date`, `order_date`, and `invoice_date` are populated consistently alongside legacy fields such as `placed_at`.

Review of Phase 1.2 through Phase 1.7 recommendations:

- Keep the substance, but treat them as Phase 2+ execution tracks rather than more Phase 1 work.
- Phase 1.2 becomes Phase 2 aggregate schema contract design.
- Phase 1.3 becomes Phase 2/3 refresh and rebuild ownership design.
- Phase 1.4 becomes the first implementation candidate for document aggregates.
- Phase 1.5 becomes the buyer/customer aggregate implementation candidate.
- Phase 1.6 becomes frontend read-model cleanup after aggregate foundations exist.
- Phase 1.7 becomes a required verification pass after every implementation candidate, plus a final drift pass.

Recommended next implementation order:

1. Create/freeze [metrics-definitions-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-definitions-2026-07.md) as the implementation dependency.
2. First implementation candidate A: document aggregates:
  - `app.orders_snapshot`
  - `app.kpi_estimates_daily`
  - `app.kpi_orders_daily`
  - `app.kpi_invoices_daily`
  - date/status alignment and CREATE-flow date review
3. First implementation candidate B: buyer/customer aggregates:
  - `app.buyers_snapshot` or compatibility-safe replacement for `app.customers_snapshot`
  - `app.kpi_buyers_daily`
  - seller customers/buyers landing and detail read-model migration
4. First implementation candidate C: buyer home/current snapshot:
  - `app.buyer_current_snapshot`
  - buyer home financial cards and buyer-app usage counters
5. First implementation candidate D: product inventory posture and days cover:
  - current stock posture first
  - invoice-velocity days cover only if it can be made deterministic at location and aggregate levels
6. Frontend standardization:
  - landing/detail page summary, rows, and row-metrics split
  - filters/search/sort affect only table rows
  - seller assistant scope enforced across KPIs, callouts, rows, details, and navigation access



### Phase 1.2: Aggregate Target Schema Design

Goal:

- Design the missing tables and align naming/column contracts before implementation.

Subagent shape:

- investigator for current source columns and joins
- builder for schema proposal doc or migration draft
- reviewer for contract completeness

Primary targets:

- `app.orders_snapshot`
- `app.buyer_current_snapshot`
- `app.buyers_snapshot`, or a compatibility-safe successor to `app.customers_snapshot`
- `app.kpi_buyers_daily`
- `app.kpi_estimates_daily`
- `app.kpi_orders_daily`
- `app.kpi_invoices_daily`

Required checks:

- sparse row rules
- index strategy
- retention strategy
- whether `deleted_at` belongs on KPI tables at all
- compatibility strategy for renaming `customers_snapshot` to `buyers_snapshot`
- removal of irrelevant `tier_counts` from customer/buyer summary contracts
- due/dormant/overdue count and amount columns for buyer/customer snapshots



### Phase 1.3: Refresh and Rebuild Ownership Design

Goal:

- Define the one write-path contract for each new or revised aggregate.

Subagent shape:

- investigator for dispatch and rebuild entry points
- builder for trigger/function changes
- reviewer for duplicate write-path and drift risk

Required outputs:

- trigger ownership map
- `post_sync_rebuild` additions
- backfill/rebuild window rules
- live cron or alternate scheduling decision for pruning and maintenance



### Phase 1.4: Orders Aggregate Migration

Goal:

- Replace `kpi_tenant_daily` as the implicit order-summary contract.

Subagent shape:

- builder for `orders_snapshot` and `kpi_orders_daily`
- reviewer for seller dashboard and sales-orders landing parity

Consumers to migrate first:

- seller sales orders landing
- seller dashboard order KPIs and callouts



### Phase 1.5: Buyer Aggregate Migration

Goal:

- Move seller customers/buyers pages, buyer home financial cards, and buyer app access KPIs to buyer-scoped aggregate reads.

Subagent shape:

- builder for buyer snapshot/daily implementation
- reviewer for raw-scan removal and scope correctness

Consumers to migrate first:

- seller customers/buyers landing
- seller customer/buyer detail
- buyer home
- buyer app access



### Phase 1.6: Entity Landing and Detail Read Model Cleanup

Goal:

- Remove remaining raw/page-scoped KPI derivations from seller landing/detail pages.

Subagent shape:

- investigator for route-specific raw KPI logic
- builder for one entity family at a time
- reviewer for contract parity

Priority order:

- locations landing
- brand detail
- location detail
- any remaining products/customers/invoices page-scoped KPI paths



### Phase 1.7: Drift and Verification Pass

Goal:

- Lock in parity and prevent regressions.

Subagent shape:

- builder for tests and parity checks
- reviewer for failure modes and missing coverage

Required outputs:

- aggregate-vs-raw parity checks
- live schema drift checklist
- RLS and cross-tenant regression coverage
- feature-flag on/off validation for affected routes



## Phase 1 task sizing guidance

- Preferred unit of work:
  - one aggregate family
  - or one landing/detail route family
  - or one refresh ownership slice
- Avoid combining:
  - DDL for multiple unrelated entity families
  - route migrations plus retention scheduling plus buyer-home refactors in one task



## Exit criteria for leaving Phase 0

- Phase 0 observations are recorded in this file.
- Missing aggregate coverage is explicitly listed.
- Ownership paths are documented.
- Frontend/API consumers are mapped.
- Recommended Phase 1 sequence is defined.
- No implementation has started yet.


## Phase 1.1 Execution Update

Date: 2026-07-07
Owner: Builder subagent with master-session integration/review
Status: Tranche 1 implemented and verified

### Completed in this tranche

- Added migration [20260707122229_metrics_aggregation_phase1_tranche1.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/migrations/20260707122229_metrics_aggregation_phase1_tranche1.sql).
- Added `app.metric_day_ist(...)` as the canonical IST day-bucketing helper for document aggregates.
- Added compatibility column `app.customers_snapshot.total_count` and refreshed `app.refresh_customers_snapshot(...)` so existing customer reads no longer depend on a phantom column.
- Added `app.orders_snapshot` and `app.refresh_orders_snapshot(...)`.
- Added `app.kpi_estimates_daily`, `app.kpi_orders_daily`, and `app.kpi_invoices_daily`.
- Added rebuild functions for the new document KPI tables and wired them into `app.post_sync_rebuild(...)`.
- Updated `dispatch_from_estimates`, `dispatch_from_orders`, and `dispatch_from_invoices` so document writes refresh the new aggregates.
- Standardized document aggregate day precedence to:
  - estimates: `estimate_date`, fallback `created_at`
  - orders: `order_date`, fallback `created_at`
  - invoices: `invoice_date`, fallback `created_at`
- Updated seller landing routes so KPI cards no longer derive from paginated row slices:
  - [app/api/tenant/estimates/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/estimates/route.ts)
  - [app/api/tenant/orders/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/orders/route.ts)
  - [app/api/tenant/invoices/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/invoices/route.ts)
- Updated order draft creation to persist `order_date` alongside existing timestamps in [app/api/tenant/orders/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/orders/route.ts).
- Hardened the customers landing compatibility path in [app/api/tenant/customers/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/customers/route.ts) so legacy snapshot rows without `total_count` do not break the API before the migration is applied.

### Verification

- Passed targeted unit coverage:
  - `src/tests/estimates-landing-page.test.ts`
  - `src/tests/invoices-landing-page.test.ts`
  - `src/tests/sales-orders-landing-page.test.ts`
  - `src/tests/estimate-composer-api.test.ts`

### Compatibility shims introduced

- `customers_snapshot.total_count` is now backfilled and maintained, but the customers landing route still safely falls back to the buyer count query if a stale row exists before migration apply.
- The invoices route now reads period counts/GMV/dues from `kpi_invoices_daily`; row rendering and callout composition still use the visible current-period invoice rows, but the KPI cards no longer use paginated-row math.

### Known risks and follow-up

- `kpi_invoices_daily` overdue facts depend on the current evaluation date at refresh time. Because the live cron inventory is still empty, invoices can become overdue without a natural row mutation to refresh the stored overdue buckets. This is acceptable for Tranche 1 but should be addressed in a later scheduling/retention pass.
- `orders_snapshot` is created in this tranche but is not yet the sole read source for seller order surfaces.
- Buyer-scoped aggregates remain intentionally out of scope:
  - `app.kpi_buyers_daily`
  - `app.buyer_current_snapshot`
  - buyer home financial-card migration
- No days-cover or inventory-posture expansion was done in this tranche.


## Phase 1 Buyer-Home Aggregate Slice Update

Date: 2026-07-07
Owner: Buyer-home builder subtask
Status: Implemented and verified

### Goal

- Introduce the buyer-home current snapshot / aggregate read path for buyer financial cards without changing seller customer routes or product surfaces.

### Changed files and objects

- Migration:
  - [20260707132449_buyer_home_phase1_completion.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/migrations/20260707132449_buyer_home_phase1_completion.sql)
- Route:
  - [app/api/buyer/home/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/buyer/home/route.ts)
- Directly affected tests:
  - [src/tests/buyer-home-route.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/buyer-home-route.test.ts)
- Execution log:
  - [specs/metrics-aggregation-execution-log-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-aggregation-execution-log-2026-07.md)

### Done

- Added `app.buyer_current_snapshot` as the buyer-scoped current-state source for:
  - outstanding dues
  - open invoice count
  - earliest due date
  - overdue counts/amount
  - credit limit / used / available
  - open orders count
- Added `app.refresh_buyer_current_snapshot(p_tenant_id uuid)` and wired ownership into:
  - `app.dispatch_from_buyers`
  - `app.dispatch_from_orders`
  - `app.dispatch_from_invoices`
  - `app.post_sync_rebuild`
- Added `app.get_buyer_home_summary(...)` as the buyer-home read model:
  - MTD spend uses invoice GMV semantics with IST day boundaries.
  - YTD invoice count uses IST day boundaries and excludes only void/cancelled/archived/rejected-style terminal rows.
  - Trend comparison uses the current-day-aligned previous-month window in IST.
  - Dues / credit / open-order card values come from `app.buyer_current_snapshot`.
  - `days_until_earliest_due` is computed against the current IST date.
- Migrated [app/api/buyer/home/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/buyer/home/route.ts) so the buyer financial cards no longer scan raw invoices directly or use `loadBuyerCreditSnapshot(...)`.
- Kept recommendations, promotions, recent activity, and order-again preview on their existing paths so this slice stays bounded.

### Verification

- Passed targeted buyer-home coverage:
  - `src/tests/buyer-home-route.test.ts`
  - `src/tests/buyer-home-page.test.tsx`

### Pending for later tranches

- `app.kpi_buyers_daily` is still pending and remains the preferred longer-term period-fact source for buyer-scoped trends shared with seller customer surfaces.
- Buyer-app usage counters based on true app-event/API-access semantics are still pending a dedicated event-backed contract; this slice did not invent proxy counters beyond the current buyer-home card needs.
- Recommendation/order-again redesign is still out of scope.
- Any seller customer landing/detail migration to buyer-scoped aggregates remains for the buyer/customer aggregate tranche.

### Compatibility shims

- Buyer-home response shape stays unchanged; only the route’s data source changed.
- `app.get_buyer_home_summary(...)` acts as the compatibility-safe aggregate read model for period-scoped buyer-home metrics until a fuller buyer daily fact table is introduced.

### Risks

- `buyer_current_snapshot` current-state dues and overdue counts still refresh on document/buyer writes and `post_sync_rebuild`; because live cron scheduling is currently absent, a due date can age into overdue without an immediate refresh trigger.
- Trend and YTD card metrics are centralized in the DB read function, but they still roll up directly from invoices rather than a dedicated `kpi_buyers_daily` fact table. This is an intentional Phase 1 bridge, not the end-state aggregate design.


## Phase 1 Buyer-Customer Aggregate Slice Update

Date: 2026-07-07
Owner: Buyer/customer builder subtask
Status: Implemented and verified

### Goal

- Finish the remaining Phase 1 buyer/customer aggregate foundation without touching buyer-home or product surfaces.

### Changed files and objects

- Migration:
  - [20260707132509_metrics_aggregation_phase1_buyers_slice.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/migrations/20260707132509_metrics_aggregation_phase1_buyers_slice.sql)
- Seller customer routes:
  - [app/api/tenant/customers/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/customers/route.ts)
  - [app/api/tenant/customers/[id]/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/customers/[id]/route.ts)
- Directly affected tests:
  - [src/tests/customers-landing-api.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/customers-landing-api.test.ts)
  - [src/tests/customer-detail-page.test.tsx](/Users/phanikrovvidi/projects/deal-flow/src/tests/customer-detail-page.test.tsx)
- Execution log:
  - [specs/metrics-aggregation-execution-log-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-aggregation-execution-log-2026-07.md)

### Done

- Added `app.buyers_snapshot` as the buyer-grain current-state aggregate with tenant-scope and location-scope rows.
- Added `app.kpi_buyers_daily` as the buyer-grain daily fact table with IST day bucketing and tenant/location scope support.
- Added aggregate ownership/wiring for the new buyer objects:
  - `app.refresh_buyers_snapshot(...)`
  - `app.refresh_kpi_buyers_daily(...)`
  - `app.rebuild_kpi_buyers_daily_for_tenant(...)`
  - dispatch integration in `app.dispatch_from_buyers`, `app.dispatch_from_estimates`, `app.dispatch_from_orders`, and `app.dispatch_from_invoices`
  - rebuild integration in `app.post_sync_rebuild(...)`
  - retention integration in `app.prune_kpi_daily_old_rows(...)`
- Migrated seller customers landing summary/KPI reads to aggregate-backed buyer facts:
  - KPI cards now read from `buyers_snapshot` plus `kpi_buyers_daily`, not from the currently loaded row slice.
  - Callouts now read from the full accessible buyer universe, not the visible paginated rows.
  - Seller assistant visibility is now bounded to buyer IDs present in their assigned-location snapshot scope.
- Migrated seller customer detail meta-strip reads to aggregate-backed buyer facts:
  - MTD spend, previous-period comparison, order count, and AOV now come from `kpi_buyers_daily`.
  - credit used / outstanding dues now come from `buyers_snapshot`.
  - seller assistants are rejected when the buyer is outside their assigned-location buyer snapshot scope.
- Removed Phase 1 dependence on tier-count semantics inside the migrated landing/detail contracts; the active/dormant/due/overdue read path now comes from buyer-scoped aggregate state instead.

### Verification

- Passed targeted customer aggregate coverage:
  - `src/tests/customers-landing-api.test.ts`
  - `src/tests/customer-detail-page.test.tsx`

### Pending for later tranches

- `app.customers_snapshot` still exists as the compatibility bridge for unchanged readers such as legacy summary/brand surfaces; a full rename or consolidated read-model cleanup is still pending.
- Seller customers summary route and any non-migrated customer/brand compatibility readers still need a later pass if they should adopt the richer buyer-state semantics.
- Buyer-home aggregate consumers are intentionally out of scope for this slice.
- Product stock posture / days-cover work is intentionally out of scope for this slice.
- A cron-backed refresh path for due-to-overdue time drift is still pending.

### Compatibility shims

- `app.customers_snapshot` remains in place. Phase 1 uses `buyers_snapshot` for the migrated seller customer landing/detail routes while preserving `customers_snapshot` for unchanged consumers.
- The landing route still carries the existing response shape, including `buyers`, `kpis`, `callouts`, `nextCursor`, and `total`; only the KPI/callout sourcing changed.

### Risks

- `buyers_snapshot` overdue and dormancy state are refreshed on buyer/document writes and `post_sync_rebuild`; because there is still no live cron schedule, a purely time-based overdue transition can drift until the next refresh event.
- The seller customers landing table rows are still cursor-paginated from `app.buyers`; this slice fixed KPI/callout drift and assistant scope, but it did not redesign every row-filter/search edge case into a dedicated DB read model.


## Phase 1 Product Posture and Read-Model Cleanup Update

Date: 2026-07-07
Owner: Master session follow-through after product worker failure
Status: Implemented and verified

### Goal

- Complete the remaining Phase 1 product landing cleanup so KPI cards stop drifting with row pagination/filters and `days_cover` uses deterministic invoice velocity semantics.

### Changed files and objects

- Products landing route:
  - [app/api/tenant/products/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/products/route.ts)
- Products landing client/types:
  - [src/components/seller/products/ProductsLandingClient.tsx](/Users/phanikrovvidi/projects/deal-flow/src/components/seller/products/ProductsLandingClient.tsx)
  - [src/hooks/useProducts.ts](/Users/phanikrovvidi/projects/deal-flow/src/hooks/useProducts.ts)
- Directly affected tests:
  - [src/tests/products-landing-api.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/products-landing-api.test.ts)
- Execution log:
  - [specs/metrics-aggregation-execution-log-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-aggregation-execution-log-2026-07.md)

### Done

- Migrated product landing KPI cards off the paginated row slice:
  - counts now come from `products_snapshot`
  - revenue and units roll up from tenant-wide `kpi_product_daily`
  - row filters/search/cursor no longer change KPI card totals
- Standardized product landing `days_cover` around current stock divided by recent invoice velocity:
  - current stock comes from current `tenant_inventory`
  - recent velocity comes from the last 30 IST days of invoice-item quantity
  - products with stock but no reliable invoice velocity now return `null` days cover instead of sentinel values
- Updated the seller products client to render nullable days cover as `—` instead of showing a fake duration.
- Added targeted regression coverage for:
  - stable KPI cards under row filtering
  - nullable `days_cover` when invoice velocity is unavailable

### Verification

- Passed targeted product landing coverage:
  - `src/tests/products-landing-api.test.ts`
  - `src/tests/products-landing-page.test.tsx`

### Pending for later tranches

- There is still no dedicated aggregate/read-model table for product current posture or product callouts; the Phase 1 route now computes a stable summary contract, but a more purpose-built snapshot/read model can replace this in Phase 2+ if profiling shows the route is too heavy.
- Product detail, brand detail, category detail, and location inventory surfaces still have follow-on opportunities to converge on the same invoice-velocity days-cover contract where they have not already done so.
- Cron-backed refresh remains pending for time-only state drift elsewhere in the aggregate family.

### Compatibility shims

- Product landing response shape stayed compatible; the route now returns `days_cover: null` for insufficient velocity, and the client/types were updated to render that state safely.
- Seller assistant volume card now prefers `kpis.units_mtd` so it is not derived from the limited summary row set.

### Risks

- Product landing summary still composes its stable read model inside the route rather than from a dedicated Phase 2 snapshot/read table; this is acceptable for Phase 1 correctness, but it is not yet the final ownership design.


## Phase 1 Completion Status

Date: 2026-07-07
Owner: Master session
Status: Phase 1 first-implementation-candidate set completed

### Complete

- Document aggregates from Phase 1.1:
  - `app.orders_snapshot`
  - `app.kpi_estimates_daily`
  - `app.kpi_orders_daily`
  - `app.kpi_invoices_daily`
- Buyer/customer aggregates:
  - `app.buyers_snapshot`
  - `app.kpi_buyers_daily`
  - seller customers landing/detail aggregate migration
- Buyer-home aggregate bridge:
  - `app.buyer_current_snapshot`
  - `app.get_buyer_home_summary(...)`
  - buyer-home financial card migration
- Product landing cleanup:
  - KPI cards detached from paginated rows
  - deterministic invoice-velocity `days_cover`
  - nullable insufficient-velocity handling in the client

### Deferred to Phase 2+

- Final naming consolidation from `customers_snapshot` to `buyers_snapshot`
- Dedicated product current-posture snapshot/read model if the route-level bridge needs to be replaced for performance/ownership clarity
- Broader days-cover convergence on every downstream surface
- Cron/live scheduling design for time-only overdue drift
- Any deeper buyer-app event counter redesign beyond the current buyer-home bridge

### Remaining compatibility bridges

- `app.customers_snapshot` remains in place for unchanged readers.
- Buyer-home period metrics currently use `app.get_buyer_home_summary(...)` as the Phase 1 bridge instead of a dedicated shared buyer daily fact read path.


## Phase 2 Tranche 1-3 Execution Update

Date: 2026-07-08
Owner: Master session with builder subagents
Status: Implemented and verified

### Goal

- Complete the Phase 2 buyer/customer contract cleanup, buyer-home aggregate bridge replacement, canonical document-date fixes, and the tenant-scope buyer-app access KPI cleanup without disturbing unrelated in-flight work in the dirty tree.

### Owners

- Investigator and orchestration:
  - Master session
- Builder subagents:
  - buyer/customer reader consolidation
  - buyer-app access KPI scope cleanup
  - canonical document-date fixes
- Master-session integration:
  - DB migration stitching
  - fixture/test alignment
  - verification
  - execution-log closeout

### Changed files and objects

- Migrations:
  - [20260707172905_metrics_aggregation_phase2_tranche1_4.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/migrations/20260707172905_metrics_aggregation_phase2_tranche1_4.sql)
  - [20260707173223_canonical_document_dates_phase2_tranche3.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/migrations/20260707173223_canonical_document_dates_phase2_tranche3.sql)
- Seller customer and brand readers:
  - [app/api/tenant/customers/summary/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/customers/summary/route.ts)
  - [app/api/tenant/customers/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/customers/route.ts)
  - [app/api/tenant/brands/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/brands/route.ts)
- Buyer-home and buyer-app access:
  - [app/api/tenant/buyer-app/access/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/buyer-app/access/route.ts)
- Canonical document-date flows:
  - [app/api/tenant/orders/[id]/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/orders/[id]/route.ts)
  - [app/api/tenant/estimates/[id]/actions/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/estimates/[id]/actions/route.ts)
  - [app/api/tenant/estimates/[id]/convert/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/estimates/[id]/convert/route.ts)
  - [src/lib/sales-orders/load-tenant-sales-order-composer.ts](/Users/phanikrovvidi/projects/deal-flow/src/lib/sales-orders/load-tenant-sales-order-composer.ts)
  - [supabase/functions/sync-transaction-line-items/index.ts](/Users/phanikrovvidi/projects/deal-flow/supabase/functions/sync-transaction-line-items/index.ts)
- Fixtures and tests:
  - [supabase/seed.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/seed.sql)
  - [supabase/seed_operational_data.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/seed_operational_data.sql)
  - [tests/rls_policies.sql](/Users/phanikrovvidi/projects/deal-flow/tests/rls_policies.sql)
  - [src/tests/buyer-app-access-route.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/buyer-app-access-route.test.ts)
  - [src/tests/customers-summary-api.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/customers-summary-api.test.ts)
  - [src/tests/customers-landing-api.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/customers-landing-api.test.ts)
  - [src/tests/brands-landing-api.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/brands-landing-api.test.ts)
  - [src/tests/estimate-detail-page.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/estimate-detail-page.test.ts)
  - [src/tests/estimate-convert-routes.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/estimate-convert-routes.test.ts)
  - [src/tests/sales-orders-update-route.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/sales-orders-update-route.test.ts)
  - [src/tests/lib/zoho-transaction-sync.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/lib/zoho-transaction-sync.test.ts)

### Done

- Finalized the active buyer/customer contract around `app.buyers_snapshot` ownership:
  - seller customer summary no longer serves tier-count semantics
  - seller customer summary now exposes buyer-state fields only: active, dormant, due, overdue counts and amount posture
  - seller customer landing and brands landing no longer depend on active `customers_snapshot` route reads
- Removed the remaining compatibility readers called out for this tranche:
  - [app/api/tenant/customers/summary/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/customers/summary/route.ts)
  - [app/api/tenant/customers/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/customers/route.ts)
  - [app/api/tenant/brands/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/brands/route.ts)
- Fixed the brands-landing buyer-count drift:
  - buyer totals now count the buyer universe instead of miscounting brand IDs or relying on customer compatibility state
- Replaced the buyer-home hybrid bridge ownership in the DB layer:
  - `app.get_buyer_home_summary(...)` period metrics now read from maintained buyer facts/read tables instead of rolling raw invoices directly
  - `buyer_current_snapshot` refresh ownership was restored in dispatcher and rebuild paths that had drifted during the buyers-slice rollout
- Added scheduled freshness ownership for time-only buyer status drift:
  - introduced `app.refresh_all_buyer_metric_snapshots()`
  - introduced `app.ensure_buyer_metric_snapshot_cron_scheduled()`
  - scheduled refresh bootstrap is now part of the migration so overdue/dormancy state is not write-event-only
- Cleaned up buyer-app access KPI scope correctness:
  - suggested and inactive totals are now tenant-scope counts instead of changing with `limit`, search, or page rows
  - current-state counts still prefer aggregate-backed snapshot values where present
- Completed canonical document-date fixes:
  - `app.orders.order_date` is backfilled, defaulted, and treated as first-class persisted state
  - estimate-to-order conversion now writes `order_date`, not only `placed_at`
  - order PATCH and confirm flows preserve/backfill canonical `order_date` together with the compatibility timestamp
  - estimate-to-invoice conversion now accepts/persists an explicit invoice date and no longer relies on a hardcoded `now()` conversion path
  - sync helpers and composer flows now treat `order_date` as the order business date
- Updated seeds and test fixtures so Phase 2 coverage no longer treats `customers_snapshot` or `placed_at` as the canonical source of truth for these surfaces
- Added the Phase 2 migration cleanup for internal ownership:
  - active rebuild/dispatch ownership now points at `refresh_buyers_snapshot(...)`
  - compatibility cleanup includes dropping `refresh_customers_snapshot(uuid)` and the old `app.customers_snapshot` table in the migration path

### Verification

- Passed targeted Phase 2 regression coverage with:

```bash
npx vitest run src/tests/buyer-app-access-route.test.ts src/tests/customers-landing-api.test.ts src/tests/customers-summary-api.test.ts src/tests/brands-landing-api.test.ts src/tests/estimate-detail-page.test.ts src/tests/estimate-convert-routes.test.ts src/tests/sales-orders-update-route.test.ts src/tests/lib/zoho-transaction-sync.test.ts
```

- Result:
  - 8 test files passed
  - 28 tests passed

### Compatibility notes

- Buyer-home API response shape stayed unchanged; the Phase 2 work is DB ownership and read-model consolidation behind the existing route contract.
- `app.estimate_convert_to_order(...)` keeps a compatibility-safe overload that accepts explicit `p_order_date` while the newer canonical-date migration rewrites the shared conversion implementation.

### Risks and follow-up

- This turn did not apply migrations against a live database; migration correctness is covered by code/test review only, so remote schema drift should be checked before `supabase db push`.
- Broader seller-shell read-model cleanup is still pending for the remaining Phase 2 surfaces:
  - seller dashboard
  - brand detail
  - locations landing/detail
  - catalogs and estimate/invoice callout cleanup
- If any external environment still depends on `app.customers_snapshot` outside the repository-covered routes and fixtures, that dependency must be surfaced before the rename/removal migration is applied.

### Remote push recovery

- Replay-safe policy guards were added to:
  - `20260707122229_metrics_aggregation_phase1_tranche1.sql`
  - `20260707132449_buyer_home_phase1_completion.sql`
  - `20260707132509_metrics_aggregation_phase1_buyers_slice.sql`
- Canonical invoice-day handling was normalized so the buyer-home and buyer-slice migrations use explicit IST date inputs instead of raw invoice timestamps when calling `app.metric_day_ist(...)`.
- The full remote `supabase db push --linked --include-all --yes` completed successfully after those fixes.

## Phase 3 Foundation Completion

Date: 2026-07-08

### Goal

- Finish the aggregate foundation boundary so Phases 0-3 end with no remaining writer drift, stale-bucket gaps, status-semantic drift, or buyer-app activity proxy reliance.

### Subagent owners

- Master session:
  - coordinated the Phase 3 closeout
  - reconciled plan/log/definitions drift
  - finalized the DB cleanup migration, route wiring review, tests, and this log update
- Builder subagent:
  - implemented the first-party buyer-app activity ledger slice
  - added route-compatible buyer-app event recording helpers and DB test coverage
- Investigator subagent:
  - isolated the remaining Phase 0-3 foundation gaps:
    - canonical `order_date` vs `placed_at` drift
    - stale old-bucket cleanup gaps on day/location/product/warehouse moves
    - sparse rebuilds that upserted survivors without clearing stale rows
    - missing document KPI retention coverage
    - sync rebuild failure state that only raised warnings

### Done

- Added first-party buyer-app activity tracking in the database:
  - introduced `app.buyer_app_activity` as the append-only buyer-app event ledger
  - added `app.record_buyer_app_activity(...)` for route-owned activity writes
  - added buyer-app document sync helpers so buyer-app estimates/orders also backfill the ledger safely
  - updated buyer-app aggregates so `opened_app_mtd`, repeat-user counts, and active-user counts now come from DB activity events instead of PostHog or `buyer_users.updated_at` proxies
- Wired qualifying buyer-app routes to emit DB-owned events without changing response shape:
  - [app/api/auth/phone-otp/verify/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/auth/phone-otp/verify/route.ts)
  - [app/api/auth/phone-otp/select-context/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/auth/phone-otp/select-context/route.ts)
  - [app/api/buyer/home/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/buyer/home/route.ts)
  - [app/api/buyer/catalog/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/buyer/catalog/route.ts)
  - [app/api/buyer/activity/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/buyer/activity/route.ts)
  - [app/api/buyer/estimates/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/buyer/estimates/route.ts)
  - [app/api/buyer/orders/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/buyer/orders/route.ts)
- Finalized the aggregate foundation cleanup in `20260708035639_metrics_aggregation_phase3_db_foundation_cleanup.sql`:
  - standardized order flow/open/downstream-quality helpers and applied them across snapshots, daily facts, buyer facts, buyer-app facts, rebuilds, and dispatchers
  - standardized invoice receivables/outstanding/overdue helpers and applied them across snapshot and daily writers
  - normalized all remaining order-derived KPI grains to use canonical `order_date` with `created_at` fallback instead of `placed_at`
  - removed remaining sparse-KPI stale-row assumptions by deleting rebuilt windows before repopulating them
  - added old-bucket and new-bucket refresh behavior for order, estimate, invoice, order-item, and inventory dispatchers so day/location/product/brand/category/warehouse moves clear stale rows instead of only refreshing the surviving bucket
  - extended retention to `kpi_estimates_daily`, `kpi_orders_daily`, and `kpi_invoices_daily`
  - made sync-triggered rebuild depth derive from `integration_sync_jobs.since_date` when present
  - made sync rebuild failures auditable on the sync-job row via `error_log` and `progress.meta.post_sync_rebuild_failed`, and added `app.retry_post_sync_rebuild_for_sync_job(...)` for explicit recovery
- Removed the remaining Phase 0-3 KPI-table soft-delete assumptions in a still-active consumer:
  - [src/lib/server/seller-dashboard.ts](/Users/phanikrovvidi/projects/deal-flow/src/lib/server/seller-dashboard.ts) no longer filters non-soft-deletable KPI tables by `deleted_at`

### Verification

- Added DB activity coverage:
  - [tests/buyer_app_activity_tracking.sql](/Users/phanikrovvidi/projects/deal-flow/tests/buyer_app_activity_tracking.sql)
- Added Phase 3 foundation truth coverage:
  - [tests/metrics_aggregation_phase3_foundation.sql](/Users/phanikrovvidi/projects/deal-flow/tests/metrics_aggregation_phase3_foundation.sql)
- Added/updated app regression coverage:
  - [src/tests/buyer-home-route.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/buyer-home-route.test.ts)
  - [src/tests/auth/buyer-phone-otp-routes.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/auth/buyer-phone-otp-routes.test.ts)

### Notes

- The Phase 0-3 foundation boundary is now treated as complete:
  - buyer-app opened/active counts are DB-backed
  - order status semantics are explicitly centralized and applied across all aggregate grains touched in Phases 0-3
  - stale row cleanup and sparse-window rebuild cleanup are explicit instead of depending on recent-window luck
  - later frontend/read-model migrations remain intentionally deferred and are not reclassified as Phase 3 scope
- Later-phase work remains intentionally out of scope:
  - broad seller landing API reshapes
  - detail-page aggregate migration sweeps
  - product posture snapshot redesign
  - broader buyer-app feature redesign beyond the new DB activity foundation

## Phase 4 Tranche 1 Progress Update

Date: 2026-07-08
Owner: Master session with builder subagent carry-over and local integration
Status: Partial Phase 4 seller-landing refactor implemented and verified

### Goal

- Start the Phase 4 seller-landing read refactor by landing the highest-signal access-rule, assistant-scope, and KPI-invariance fixes without reopening buyer-home work.

### Changed files

- Seller landing/API routes:
  - [app/api/tenant/orders/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/orders/route.ts)
  - [app/api/tenant/products/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/products/route.ts)
  - [app/api/tenant/brands/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/brands/route.ts)
  - [app/api/tenant/categories/landing/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/categories/landing/route.ts)
  - [app/api/tenant/locations/landing/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/locations/landing/route.ts)
  - [app/api/tenant/warehouses/landing/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/warehouses/landing/route.ts)
  - [app/api/tenant/buyer-app/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/buyer-app/route.ts)
  - [app/api/tenant/buyer-app/access/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/buyer-app/access/route.ts)
  - [app/api/tenant/catalogs/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/catalogs/route.ts)
  - [app/api/tenant/cohorts/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/cohorts/route.ts)
  - [app/api/cohorts/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/cohorts/route.ts)
  - [app/api/price-lists/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/price-lists/route.ts)
  - [src/lib/server/seller-dashboard.ts](/Users/phanikrovvidi/projects/deal-flow/src/lib/server/seller-dashboard.ts)
- Tests:
  - [src/tests/products-landing-api.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/products-landing-api.test.ts)
  - [src/tests/brands-landing-api.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/brands-landing-api.test.ts)
  - [src/tests/categories-landing-route.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/categories-landing-route.test.ts)
  - [src/tests/catalogs-landing-route.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/catalogs-landing-route.test.ts)
  - [src/tests/buyer-app-access-route.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/buyer-app-access-route.test.ts)
  - [src/tests/price-lists-route.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/price-lists-route.test.ts)
  - [src/tests/sales-orders-landing-page.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/sales-orders-landing-page.test.ts)
  - [src/tests/warehouses-landing-route.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/warehouses-landing-route.test.ts)

### Done

- Enforced Phase 1.1 GROW access restrictions on the seller landing surfaces already touched in this tranche:
  - seller assistants are now blocked from catalogs/campaigns, cohorts, and price lists at the route boundary
- Carried assistant location scope into the remaining landing surfaces touched in this tranche:
  - products
  - brands
  - categories
  - locations
  - warehouses
  - buyer-app access and buyer-app seller landing
- Started the Phase 4 document landing cleanup on sales orders:
  - moved row-period semantics to canonical `order_date` with `created_at` fallback
  - added a real cursor path aligned to server ordering
  - moved order callout sourcing off the visible table slice
  - removed the leftover unused previous-period raw query bridge
- Hardened entity landing KPI invariance where the route was previously page-slice-derived:
  - brands no longer derive KPI cards from the first limited brand page and now count `buyers_with_orders_mtd` from buyer ids, not brand ids
  - warehouses now compute KPI tiles and callouts from the full scoped warehouse universe, while still honoring row limits for the visible table
  - catalogs and price lists now keep KPI math invariant when the visible row limit changes
- Replaced the category landing’s `999` days-cover placeholder with null/insufficient-data semantics.
- Updated the seller dashboard helper to use canonical order/estimate date fields in the touched order-related flows instead of continuing to rely on `placed_at` everywhere.

### Verification

- Passed targeted Phase 4 regression coverage with:

```bash
npx vitest run src/tests/categories-landing-route.test.ts src/tests/products-landing-api.test.ts src/tests/brands-landing-api.test.ts src/tests/catalogs-landing-route.test.ts src/tests/buyer-app-access-route.test.ts src/tests/price-lists-route.test.ts src/tests/sales-orders-landing-page.test.ts src/tests/warehouses-landing-route.test.ts src/tests/cohorts-route-access.test.ts src/tests/dashboard-api.test.ts
```

- Result:
  - 10 test files passed
  - 20 tests passed

### Decisions

- This tranche treats products as a Phase 4 scope-correction surface, not a full landing-contract rewrite; the existing summary-vs-rows split remains in place, with assistant scope layered in.
- Warehouses are now seller-role accessible with assigned-location scoping for assistants in this tranche rather than remaining implicitly admin-only.
- Buyer-home remains explicitly deferred and is not reopened by this tranche.

### Risks / Follow-up

- Phase 4 is not complete yet:
  - estimate landing still needs the canonical `estimate_date` row/query/callout cleanup
  - invoice landing still needs the cursor/filter/callout refactor
  - category landing still lacks dedicated route-level regression coverage in this tranche
  - locations, buyer-app seller landing, and dashboard still need deeper read-model standardization beyond the first scope/invariance fixes landed here
- This tranche focused on route correctness and regression safety first; a later Phase 4 follow-up still needs to standardize every remaining landing onto the full `summary query + rows query + row metrics query` contract.

## Phase 4 Tranche 1 Addendum: Document Landing Completion

Date: 2026-07-08
Owner: Master session local integration
Status: Additive completion update for the document landing slice and dashboard parity checks

### Goal

- Finish the remaining document-route integration work inside the active Phase 4 tranche:
  - normalize estimates to canonical `estimate_date` semantics for period scoping, row ordering, and cursors
  - finish invoice cursor/filter/callout behavior on canonical `invoice_date` semantics
  - keep compatibility summary endpoints as thin wrappers over the landing contract
  - verify seller dashboard helper parity after the canonical document-date changes

### Changed files

- Routes:
  - [app/api/tenant/estimates/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/estimates/route.ts)
  - [app/api/tenant/estimates/summary/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/estimates/summary/route.ts)
  - [app/api/tenant/invoices/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/invoices/route.ts)
  - [app/api/tenant/invoices/summary/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/invoices/summary/route.ts)
  - [src/lib/server/seller-dashboard.ts](/Users/phanikrovvidi/projects/deal-flow/src/lib/server/seller-dashboard.ts)
- Tests:
  - [src/tests/estimates-landing-page.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/estimates-landing-page.test.ts)
  - [src/tests/invoices-landing-page.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/invoices-landing-page.test.ts)
  - [src/tests/lib/seller-dashboard.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/lib/seller-dashboard.test.ts)

### Done

- Estimates landing now uses canonical `estimate_date` semantics with `created_at` fallback across:
  - row-period scoping
  - cursor generation/decoding
  - visible-row ordering
  - total-count computation
  - callout sourcing
- Invoices landing now completes the Phase 4 contract shifts:
  - `nextCursor` is emitted from canonical document ordering and accepted by `GET`
  - location/source/status/due filters are applied before pagination
  - visible rows remain period-scoped on `invoice_date` with `created_at` fallback
  - callouts and top-riser math are sourced from scoped query sets instead of the page slice
  - `total` now reflects the scoped, filter-matching universe rather than the visible page length
- Compatibility summary endpoints remain retained only as thin wrappers over the landing response KPI contract.
- Seller dashboard helper now consistently uses canonical order/estimate dates in the touched seller-summary and activity/feed flows.
- Added route-level regression coverage for:
  - estimates landing canonical-period behavior
  - invoices landing KPI/callout invariance and assistant scoping
  - seller dashboard aggregate-vs-scoped parity on canonical document dates

### Verification

- Passed expanded Phase 4 tranche verification with:

```bash
npx vitest run src/tests/categories-landing-route.test.ts src/tests/products-landing-api.test.ts src/tests/brands-landing-api.test.ts src/tests/catalogs-landing-route.test.ts src/tests/buyer-app-access-route.test.ts src/tests/price-lists-route.test.ts src/tests/sales-orders-landing-page.test.ts src/tests/warehouses-landing-route.test.ts src/tests/cohorts-route-access.test.ts src/tests/dashboard-api.test.ts src/tests/estimates-landing-page.test.ts src/tests/invoices-landing-page.test.ts src/tests/lib/seller-dashboard.test.ts
```

- Result:
  - 13 test files passed
  - 28 tests passed

### Decisions

- Compatibility summary routes were kept because they are still present as public surfaces, but their logic is now intentionally reduced to thin wrappers over the landing contract instead of maintaining a second source of KPI truth.
- The document landing tests were updated to assert the Phase 4 server-filtered/server-paginated contract rather than the older page-slice-derived behavior.

### Risks / Follow-up

- Phase 4 remains open beyond this addendum:
  - locations, buyer-app seller landing, catalogs/cohorts/dashboard still need deeper normalization onto the full `summary + rows + row-metrics` pattern
  - categories currently have assistant scope and null days-cover semantics covered, but still need broader contract-standardization work if their landing payload is to fully match the newer document/entity pattern
- Buyer-home remains intentionally deferred.

## Phase 4 Full Scope Review Pass

Date: 2026-07-08
Owner: Master session with focused investigator subagents and local integration
Status: Full seller-app landing review completed; additional customer/dashboard correctness gaps fixed and all reviewed seller landing routes are now explicitly accounted for in the execution log

### Goal

- Close the documentation gap in the earlier Phase 4 entries by reviewing every in-scope seller-app landing page, recording its status explicitly, and landing the remaining high-signal correctness fixes discovered during that page-by-page pass.

### Changed files

- Routes/helpers:
  - [app/api/tenant/customers/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/tenant/customers/route.ts)
  - [src/lib/server/seller-dashboard.ts](/Users/phanikrovvidi/projects/deal-flow/src/lib/server/seller-dashboard.ts)
- Tests:
  - [src/tests/customers-landing-api.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/customers-landing-api.test.ts)
  - [src/tests/customers-summary-api.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/customers-summary-api.test.ts)
  - [src/tests/lib/seller-dashboard.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/lib/seller-dashboard.test.ts)

### Done

- Fixed the customers landing filtered-row contract bug:
  - `status` and `due` filters no longer compute row results and totals from an already-limited page slice
  - filtered buyer IDs are resolved against the scoped snapshot universe before row pagination
  - `total` now reflects the scoped filtered universe instead of the visible page
- Fixed the remaining assistant dashboard scope drift that was discovered during the full review:
  - assistant customer-facing dashboard metrics/callouts now use only buyers referenced by assistant-scoped orders/estimates/invoices instead of tenant-wide buyers
  - assistant “Recent activity” now uses the selected landing period rather than a last-sign-in window
- Completed the page-by-page review inventory for every seller landing currently in Phase 4 scope:
  - dashboard
  - brands
  - products
  - customers
  - customer groups / cohorts
  - campaigns / catalogs
  - price lists
  - sales orders
  - estimates
  - invoices
  - categories
  - locations
  - warehouses
  - buyer-app seller landing
  - buyer-app access

### Reviewed page status

- `dashboard`:
  - reviewed and updated in this pass
  - assistant scope and selected-period activity semantics corrected
- `customers`:
  - reviewed and updated in this pass
  - filtered row/count correctness corrected while keeping KPI/callout invariance
- `sales orders`:
  - reviewed; canonical `order_date`, server cursor, and non-page-slice callouts already landed in the earlier Phase 4 tranche
- `estimates`:
  - reviewed; canonical `estimate_date`, full-universe totals, and summary-wrapper behavior already landed in the earlier addendum
- `invoices`:
  - reviewed; canonical `invoice_date`, accepted cursor path, and non-page-slice callouts already landed in the earlier addendum
- `campaigns / catalogs`:
  - reviewed; assistant access blocking and KPI invariance behavior already landed in the earlier Phase 4 tranche
- `price lists`:
  - reviewed; seller-assistant access blocking and page-invariant KPI behavior already landed in the earlier Phase 4 tranche
- `customer groups / cohorts`:
  - reviewed; seller-assistant access blocking already landed in the earlier Phase 4 tranche
- `buyer-app access`:
  - reviewed; assistant/location behavior already covered by the earlier Phase 4 tranche
- `brands`, `products`, `categories`, `locations`, `warehouses`, `buyer-app seller landing`:
  - reviewed in this pass and retained in their current tranche state
  - the earlier Phase 4 scope/access/KPI-invariance fixes remain in place and verified by the current regression set

### Verification

- Passed the expanded reviewed-scope regression set:

```bash
npx vitest run src/tests/categories-landing-route.test.ts src/tests/products-landing-api.test.ts src/tests/brands-landing-api.test.ts src/tests/catalogs-landing-route.test.ts src/tests/buyer-app-access-route.test.ts src/tests/price-lists-route.test.ts src/tests/sales-orders-landing-page.test.ts src/tests/warehouses-landing-route.test.ts src/tests/cohorts-route-access.test.ts src/tests/dashboard-api.test.ts src/tests/estimates-landing-page.test.ts src/tests/invoices-landing-page.test.ts src/tests/lib/seller-dashboard.test.ts src/tests/customers-landing-api.test.ts src/tests/customers-summary-api.test.ts
```

- Result:
  - 15 test files passed
  - 35 tests passed

### Decisions

- The execution log now treats the full seller landing scope as explicitly reviewed, not implicitly covered by route-family summaries alone.
- This pass prioritized remaining correctness bugs that could materially change visible row sets or assistant-visible entities:
  - customers filtered totals/pagination
  - assistant dashboard buyer scope
  - assistant dashboard period semantics

### Risks / Follow-up

- Some seller landing surfaces still carry deeper read-model debt even after the reviewed-scope pass, especially where routes still compute row enrichment or selected-period metrics directly from raw reads:
  - brands
  - products
  - categories
  - locations
  - warehouses
  - buyer-app seller landing
- Those surfaces are now explicitly reviewed and inventoried, but follow-up normalization work would still be beneficial if the goal is to make every landing strictly conform to the ideal `summary query + rows query + row-metrics query` contract without any raw-read fallback.

## Phase 6 Buyer-Home Completion

Date: 2026-07-09
Owner: Master session with DB and buyer-home worker subagents
Status: Implemented and verified

### Goal

- Complete the buyer-home aggregate hardening pass on top of the new `prod_bootstrap.sql` baseline without replaying older metrics migrations.
- Preserve the existing buyer-home response contract while fixing status-helper drift, YTD retention/rebuild safety, explicit second-hop scoping, and IST current-day catalog visibility semantics.

### Subagent owners

- Explorer/orchestration:
  - Master session
- DB worker:
  - new migration on top of the bootstrap baseline
- Buyer-home worker:
  - buyer-home route, helper, and targeted tests
- Master-session integration:
  - migration reconciliation
  - execution-log closeout
  - targeted verification

### Reused from `prod_bootstrap.sql`

- Existing aggregate/read-model baseline retained:
  - `app.buyer_current_snapshot`
  - `app.kpi_buyers_daily`
  - `app.get_buyer_home_summary(...)`
  - `app.ensure_buyer_metric_snapshot_cron_scheduled()`
  - `app.refresh_all_buyer_metric_snapshots()`
- Buyer-home API response shape stayed unchanged.
- Buyer-home financial cards continue to read from the aggregate contract instead of raw invoice scans.

### Changed files and objects

- Migration:
  - [20260709055452_buyer_home_phase6_completion.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/migrations/20260709055452_buyer_home_phase6_completion.sql)
- Buyer-home route and helper:
  - [app/api/buyer/home/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/buyer/home/route.ts)
  - [src/lib/server/buyer-access.ts](/Users/phanikrovvidi/projects/deal-flow/src/lib/server/buyer-access.ts)
- Tests:
  - [src/tests/buyer-home-route.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/buyer-home-route.test.ts)
  - [src/tests/buyer-access.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/buyer-access.test.ts)
  - [src/tests/buyer-home-page.test.tsx](/Users/phanikrovvidi/projects/deal-flow/src/tests/buyer-home-page.test.tsx)
  - [src/tests/settings/buyer-home-phase6-migration.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/settings/buyer-home-phase6-migration.test.ts)

### Done

- Rewrote `app.refresh_buyer_current_snapshot(...)` to use shared helper predicates instead of hardcoded buyer-home status lists:
  - `app.invoice_status_has_receivable(...)`
  - `app.invoice_is_overdue(...)`
  - `app.order_status_is_open(...)`
- Made `app.prune_kpi_daily_old_rows(...)` preserve `app.kpi_buyers_daily` rows for at least the current IST calendar year so buyer-home YTD metrics are not truncated by the generic 90-day path.
- Widened buyer-specific rebuild coverage inside `app.post_sync_rebuild(...)` so buyer KPI rebuilds cover at least the current IST year-to-date window, without widening unrelated aggregate families.
- Added idempotent buyer-metric cron scheduling bootstrap via `SELECT app.ensure_buyer_metric_snapshot_cron_scheduled();` in the Phase 6 migration.
- Cleaned stale bootstrap residue around `trg_refresh_customers_snapshot()` only when `app.refresh_customers_snapshot(uuid)` is absent, instead of assuming the old compatibility path can be removed everywhere.
- Tightened buyer-home second-hop service-role reads:
  - `campaign_items` now scopes through `campaigns!inner(tenant_id)`
  - `order_items` now scopes through `orders!inner(tenant_id, buyer_id)`
- Kept the bounded recent-order preview explicit with local constants:
  - 20 recent orders
  - 5 preview products
  - 5 promotions
- Standardized buyer-visible catalog expiry to current IST calendar-day semantics in `getVisibleBuyerCatalogs(...)` so catalogs remain visible through the current `Asia/Kolkata` business day.

### Verification

- Passed targeted Phase 6 regression coverage with:

```bash
pnpm vitest run src/tests/buyer-home-route.test.ts src/tests/buyer-access.test.ts src/tests/buyer-home-page.test.tsx src/tests/settings/buyer-home-phase6-migration.test.ts
```

- Result:
  - 4 test files passed
  - 9 tests passed

### Remaining compatibility bridges

- `customers_snapshot` readers are still not assumed to be fully gone repo-wide; this phase only neutralizes the stale bootstrap trigger/function residue when the compatibility refresh function is absent.
- Buyer-home still intentionally keeps recommendations, promotions, and recent activity on their existing non-aggregate helper paths.
- Buyer-home financial cards remain aggregate-backed, but the app does not yet have full SQL-function verification of `get_buyer_home_summary(...)` against live fixtures in CI.

### Risks / assumptions

- Authoritative linked Supabase project remains `ytlusgmlqxuosifeapkz`.
- This turn did not apply or push the new migration against a live database; verification is code/test-based only.
- Final invoice taxonomy remains a product-level assumption; this phase only aligned buyer-home current-state reads to the existing shared helper predicates.
- The bootstrap cleanup assumes dropping the orphaned customers-snapshot trigger helper is safe when `refresh_customers_snapshot(uuid)` is absent, because the active buyer aggregate contract is owned by `buyers_snapshot`/`dispatch_from_buyers`.

## Phase 5 Detail Read-Model Completion

### Goal

Complete the seller detail-page aggregate sweep on top of `supabase/prod_bootstrap.sql`, while carrying forward only the already-landed Phase 6 buyer-home migration as dependency context rather than replaying it.

### Subagent owners

- Master session:
  - repo audit
  - phase integration
  - verification
  - execution-log closeout
- Detail surface investigator:
  - detail route inventory and carry-over audit
- Location/warehouse worker:
  - location detail and warehouse aggregate cleanup

### Migration baseline note

- No new Phase 5 migration was added in this pass.
- `supabase/prod_bootstrap.sql` remains the schema baseline for the new Supabase project.
- [20260709055452_buyer_home_phase6_completion.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/migrations/20260709055452_buyer_home_phase6_completion.sql) remains the authoritative Phase 6 buyer-home correction and was treated as existing prior work, not replayed.

### Completed surfaces

- Brand detail:
  - detail KPIs and performance now read from `kpi_brand_daily` / `kpi_product_daily` instead of page-scoped order reductions in the route.
- Product detail:
  - detail meta/performance now read from `kpi_product_daily` for period trends and preserve invoice-velocity `days_cover` semantics with `null` when velocity is insufficient.
- Category detail:
  - headline/trend metrics remain on `kpi_category_daily`
  - row-level product KPI enrichment is now bounded to category product IDs instead of broad unfiltered scans
- Location detail:
  - header/meta and tab badge metrics read from `locations_snapshot`, `buyers_snapshot`, `kpi_location_daily`, `kpi_orders_daily`, `kpi_estimates_daily`, and `kpi_invoices_daily`
  - relational detail rows remain server-bounded for orders, estimates, invoices, customers, and inventory
- Warehouse detail:
  - header posture stays on `warehouses_snapshot`
  - trend/fallback posture reads use `kpi_warehouse_daily`
- Customer detail:
  - header KPIs continue to use `buyers_snapshot` / `kpi_buyers_daily`
  - monthly performance trend now reads from `kpi_buyers_daily` rather than rebuilding from raw orders
- Cohort detail:
  - engagement metrics now use `app.campaign_views`
  - no PostHog dependency remains in the detail summary path
- Campaign/catalog detail:
  - detail metrics use `app.campaign_views` and canonical document dates
- Price-list detail:
  - kept on current header-stat scope only; no new trend model introduced

### Tests and verification

- Passed targeted verification:

```bash
npx vitest run src/__tests__/cohorts/[id]/route.test.ts src/__tests__/catalogs/[id]/route.test.ts src/__tests__/brands/[id]/route.test.ts src/tests/customers/[id].test.tsx src/tests/settings/buyer-home-phase6-migration.test.ts
git diff --check
```

- Result:
  - 5 test files passed
  - 18 tests passed

### Test maintenance landed with this phase

- Updated [src/__tests__/catalogs/[id]/route.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/__tests__/catalogs/[id]/route.test.ts) to provide a React `cache` mock required by the current catalog detail route imports.
- Updated [src/tests/customers/[id].test.tsx](/Users/phanikrovvidi/projects/deal-flow/src/tests/customers/[id].test.tsx) to match the current buyer-user row rendering (`Amit Sharma`) and current detail-tab action set.

### Deferred / intentionally out of scope

- Estimate, sales-order, and invoice detail pages still do not expose new KPI/performance strips; Phase 5 kept them out of scope.
- Price-list detail still uses relational header-stat derivation rather than a dedicated aggregate family because there is no performance surface yet.
- Customer detail still keeps brand-mix, top-SKU, and activity/event sections on bounded relational reads where there is no dedicated buyer-grain aggregate yet.

### Risks / follow-up

- Some detail tabs still use bounded relational reads for non-headline row content; this phase standardized KPI/meta/performance sources first.
- Invoice taxonomy remains dependent on the existing shared helper predicates and unresolved product semantics for any future invoice-detail KPI expansion.
- Repo verification in this turn was application-test based only; no live DB push or remote schema replay was performed.

## Phase 7: Metrics Reconciliation, Monitoring, And Ad Hoc Analysis

### Goal

Complete the Phase 7 operator layer on top of the Phase 1-6 aggregate baseline:

- add bounded tenant repair and ad hoc analysis RPCs
- expose one canonical aggregate freshness read model in seller settings/integrations
- surface post-sync rebuild failures as operator warnings even when sync jobs otherwise completed
- add seller-admin actions for `Repair Aggregates` and `Run Analysis`
- add reconciliation-oriented Phase 7 regression coverage

### Subagent owners

- Master session:
  - orchestration
  - diff review
  - verification
  - execution-log closeout
- Investigator:
  - audited existing aggregate rebuild hooks, sync warning flow, and integrations settings read path
- Builder A:
  - owned the Phase 7 SQL migration
- Builder B:
  - owned seller settings/integrations API + UI wiring
- Test worker:
  - owned Vitest and SQL reconciliation additions

### Migration baseline note

- `supabase/migrations/20260709000001_prod_bootstrap.sql` remained the schema baseline.
- Phase 7 was added as one forward migration:
  - [20260709112450_metrics_phase7_repair_and_freshness.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/migrations/20260709112450_metrics_phase7_repair_and_freshness.sql)
- Earlier archived migrations were treated as reference only.

### Completed changes

- Added new Phase 7 database primitives:
  - `app.rebuild_metrics_for_tenant_range(...)`
  - internal `app._run_metrics_analysis_for_tenant_range(...)`
  - public `app.run_metrics_analysis_for_tenant(...)`
  - `app.get_tenant_aggregate_freshness(p_tenant_id uuid)`
- Kept repair and analysis tenant-wide only for this phase, with bounded windows and compact result rows.
- Made repair selectively rebuild snapshots and/or KPI families based on operator input.
- Switched integrations freshness loading to the canonical database RPC instead of page-local table probing.
- Normalized `progress.meta.post_sync_rebuild_failed` into the existing `summary.warnings` contract so completed sync jobs still surface rebuild failures.
- Added seller-admin POST routes for:
  - [repair-aggregates/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/settings/integrations/repair-aggregates/route.ts)
  - [run-analysis/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/settings/integrations/run-analysis/route.ts)
- Ensured `Run Analysis` calls only the new ad hoc analysis RPC and does not synthesize sync-job orchestration.
- Added operator-facing aggregate freshness blocks on connected integration cards, including:
  - latest aggregate timestamps
  - stale/failed warnings
  - admin-only `Repair Aggregates`
  - admin-only `Run Analysis`
- Added compact maintenance dialogs with bounded inputs:
  - repair defaults to the last 90 days with snapshot/KPI toggles
  - analysis defaults to 90 days and explicitly states it runs independently of prior sync phases
- Added new SQL reconciliation coverage in:
  - [metrics_aggregation_phase7_reconciliation.sql](/Users/phanikrovvidi/projects/deal-flow/tests/metrics_aggregation_phase7_reconciliation.sql)
- Added/updated targeted Vitest coverage for:
  - migration regression
  - integrations settings rendering and warnings
  - admin-only analysis visibility
  - new repair/run-analysis routes

### Files changed

- Database:
  - [20260709112450_metrics_phase7_repair_and_freshness.sql](/Users/phanikrovvidi/projects/deal-flow/supabase/migrations/20260709112450_metrics_phase7_repair_and_freshness.sql)
  - [metrics_aggregation_phase7_reconciliation.sql](/Users/phanikrovvidi/projects/deal-flow/tests/metrics_aggregation_phase7_reconciliation.sql)
- Seller settings/integrations:
  - [repair-aggregates/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/settings/integrations/repair-aggregates/route.ts)
  - [run-analysis/route.ts](/Users/phanikrovvidi/projects/deal-flow/app/api/settings/integrations/run-analysis/route.ts)
  - [server.ts](/Users/phanikrovvidi/projects/deal-flow/src/lib/integrations/server.ts)
  - [types/integrations.ts](/Users/phanikrovvidi/projects/deal-flow/src/types/integrations.ts)
  - [useIntegrationsSettings.ts](/Users/phanikrovvidi/projects/deal-flow/src/hooks/useIntegrationsSettings.ts)
  - [IntegrationsSettingsClient.tsx](/Users/phanikrovvidi/projects/deal-flow/src/components/seller/settings/IntegrationsSettingsClient.tsx)
  - [ConnectedIntegrationCard.tsx](/Users/phanikrovvidi/projects/deal-flow/src/components/seller/settings/ConnectedIntegrationCard.tsx)
- Tests:
  - [metrics-phase7-migration.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/settings/metrics-phase7-migration.test.ts)
  - [integrations-sync-route.test.ts](/Users/phanikrovvidi/projects/deal-flow/src/tests/settings/integrations-sync-route.test.ts)
  - [integrations-page.test.tsx](/Users/phanikrovvidi/projects/deal-flow/src/tests/settings/integrations-page.test.tsx)

### Verification

- Passed targeted Phase 7 and representative aggregate-backed regression coverage:

```bash
pnpm vitest run src/tests/settings/integrations-page.test.tsx src/tests/settings/integrations-sync-route.test.ts src/tests/settings/metrics-phase7-migration.test.ts
pnpm vitest run src/tests/customers-landing-api.test.ts src/tests/products-landing-api.test.ts src/tests/buyer-home-route.test.ts
npm run type-check
git diff --check
```

- Result:
  - 6 test files passed
  - 38 tests passed
  - `type-check` passed
  - `git diff --check` passed

- SQL reconciliation suite authoring completed, but execution was blocked locally by the sandboxed Supabase CLI trying to write `~/.supabase/telemetry.json*` outside the workspace:

```bash
npx supabase test db --file tests/metrics_aggregation_phase7_reconciliation.sql
```

- The command failed with `EPERM` on `~/.supabase/telemetry.json.tmp...`, and the follow-up escalated retry could not be approved in this session because of an approval/usage limiter outside the repo.

### Remaining risks / assumptions

- Phase 7 code and Vitest coverage are verified locally, but the new SQL reconciliation suite still needs one successful `supabase test db` run in an environment where the CLI can write its home-directory state.
- Repair and ad hoc analysis remain tenant-wide only in this phase; narrower entity-scope maintenance was intentionally deferred.
- This phase does not add a second scheduler or standalone monitoring page; settings/integrations remains the only operator surface.
- Existing unrelated dirty-worktree files were left untouched outside the Phase 7 implementation slice.
