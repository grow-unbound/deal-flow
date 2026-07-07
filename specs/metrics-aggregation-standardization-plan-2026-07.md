# Metrics Aggregation Standardization Plan

Date: 2026-07-07  
Scope: Seller app landing pages, seller detail pages, buyer app home page, snapshot tables, KPI daily tables, and aggregate functions.

## Executive Summary

DealFlow's operational numbers are now important enough that the current mixed implementation is too risky. The app has useful aggregate primitives, but the read/write contract is inconsistent:

- Some KPIs come from snapshot tables.
- Some KPIs come from `kpi_*_daily` tables.
- Some KPIs are computed from raw transactional tables on every request.
- Some KPIs are computed from only the currently loaded page of rows.
- Some functions use different status filters and date bucketing for the same metric name.

This creates a real risk that distributors see different GMV, order, stock, dues, conversion, or activity numbers depending on which page they open.

The target direction is simple:

- Raw transactional tables are the write-source truth.
- Snapshot and KPI tables are the read-source truth for dashboards and KPI cards.
- Landing page KPIs and callouts are tenant-wide for seller admins and assigned-location-scoped for seller assistants; they are never page-scoped.
- Table rows are server-paginated, searched, filtered, and sorted, with row-level metrics scoped to the selected period.
- Detail pages use entity-scoped aggregate tables for header KPIs and trend tabs.
- Buyer home financial cards come from buyer-scoped snapshot/KPI tables, not ad hoc scans.

## Current Observations

### Aggregate Table Families

The app currently has these aggregate patterns:

- Tenant snapshots: `estimates_snapshot`, `invoices_snapshot`, `customers_snapshot`, `products_snapshot`, `brands_snapshot`, `categories_snapshot`, `buyer_app_snapshot`.
- Entity snapshots: `locations_snapshot`, `warehouses_snapshot`.
- Daily KPI facts: `kpi_tenant_daily`, `kpi_product_daily`, `kpi_brand_daily`, `kpi_category_daily`, `kpi_location_daily`, `kpi_warehouse_daily`, `kpi_buyer_app_daily`.
- Rebuild orchestration: `post_sync_rebuild`, `rebuild_kpi_*_for_tenant`, and trigger dispatchers.

Normal writes refresh aggregates through trigger dispatchers. Bulk syncs bypass per-row refreshes and rely on a completion-trigger rebuild.

Important missing aggregate coverage:

- `orders_snapshot` is missing. Order landing/detail and dashboard flows currently rely on raw order reads or `kpi_tenant_daily`.
- `kpi_estimates_daily`, `kpi_orders_daily`, and `kpi_invoices_daily` are missing as document-specific fact tables. `kpi_tenant_daily` is not enough because estimates, orders, and invoices need their own status, flow, and date semantics.
- These tables should be created and wired only after the metric dictionary is finalized, because the status/date rules define their columns and refresh functions.

### High-Risk Gaps Found

1. `customers_snapshot.total_count` is queried by the customers API but the local migration-defined table only contains `active_count` and tier counts.
2. Several `kpi_*_daily` queries filter on `deleted_at`, but the KPI migrations do not define a `deleted_at` column.
3. Products, customers, and invoices compute important KPIs from paginated row sets.
4. Status inclusion rules differ across aggregate functions. Example: tenant KPI can include non-cancelled draft orders while brand/category/location KPIs exclude draft and cancelled.
5. Date bucketing differs between SQL functions and app code. Most aggregate SQL uses IST day buckets; buyer home and some route code use JS server-local dates.
6. Product KPI historical rows store current `on_hand`, which is valid for current posture but misleading for historical stock trend semantics.
7. Incremental sync rebuilds only cover a short window. Historical imports or edits outside the rebuild window can leave stale daily KPI rows.
8. Buyer home queries financial cards live from raw invoices/orders instead of a buyer-scoped aggregate contract.
9. Some pages mix "tenant universe" numbers with filtered/page-scoped numbers without explicit product semantics.
10. `days_cover` for product stock is not yet a stable metric. It depends on inventory posture and demand velocity, and historical inventory trend semantics need deeper inventory movement tracking before they can be trusted.

## Standard Data Contract

### Metric Dictionary

Every operational metric must have a single definition:

- Metric name.
- Grain.
- Source table or function.
- Date column.
- Timezone.
- Included statuses.
- Excluded statuses.
- Tenant and role/location scope behavior.
- Whether search/filter state affects the number.
- Whether the metric is current-state, period-scoped, or historical-trend.

Initial required metrics:

- GMV.
- Orders count.
- AOV.
- Active buyers.
- Open orders.
- Outstanding dues.
- Overdue amount/count.
- Credit used and available credit.
- Low stock and stockout.
- Inventory on hand and sellable units.
- Catalog/campaign views.
- Conversion count and conversion rate.
- Buyer app GMV/orders/estimates/invoices.
- Days cover, if retained.

Decisions already made:

- Seller admins see tenant-wide KPIs, callouts, lists, and entities.
- Seller assistants see only assigned-location-scoped KPIs, callouts, lists, and entities.
- Draft estimates, orders, and invoices count toward total flow metrics and GMV where the metric is intended to show business flow and buyer engagement. Converted/confirmed/paid metrics are separate and should show downstream quality/completion.
- Estimate KPIs use `estimate_date`; if missing, fall back to `created_at`.
- Buyer app "opened app MTD" means login/session or activity-level app usage, not merely account enablement.
- Campaign conversion includes order count, estimate count, unique buyers who purchased through the campaign, and attributed GMV.
- Inventory trends are out of scope for now. Current stock posture is the priority.

### Seller Landing Page Contract

For every seller landing page:

- KPI cards come from snapshot or `kpi_*_daily` tables.
- Callouts come from snapshot or `kpi_*_daily` tables plus bounded entity lookup.
- KPI and callout numbers represent the full tenant universe for the selected period.
- Seller assistant KPI and callout numbers represent only their assigned-location scope.
- Search, filters, and sort affect table rows only. No page supports filtered-KPI mode.
- Table rows are server-side paginated, searched, filtered, and sorted.
- Row-level metrics are scoped to the selected period and fetched for the visible row IDs.
- UI should retain the previous table results while the next server fetch is in flight where practical, and show loading skeletons only for slower/initial fetches. Avoid flashing full-page loaders on every search/filter/sort change.

Recommended API shape:

```ts
type SellerLandingResponse<Row, Kpis, Callouts> = {
  period: SellerLandingPeriodMeta;
  kpis: Kpis;
  callouts: Callouts;
  rows: Row[];
  filters: LandingFilterMeta;
  nextCursor: string | null;
  total: number;
  refreshed_at?: string;
};
```

### Seller Detail Page Contract

For every seller detail page:

- Header KPIs come from entity-scoped snapshot or `kpi_*_daily` tables.
- Default period is usually MTD unless the page explicitly says otherwise.
- Performance tabs use explicit ranges: MTD, 3M, 12M, YTD.
- Related tables show full related entities, paginated, searched, filtered, and sorted server-side where those controls exist.
- Related row metrics are period-scoped and should not be computed from only loaded records unless the table is explicitly a bounded preview.

### Buyer Home Contract

Buyer home financial cards should come from buyer-scoped aggregates:

- YTD spend and trend: buyer daily KPI table or buyer summary function.
- Outstanding dues: buyer current snapshot.
- Credit limit/used/available: buyer current snapshot.
- Open orders: buyer current snapshot.
- Order-again/recommendations can remain RPC-backed and non-critical.

## Target Aggregate Model

### Current-State Snapshots

Use for values that are true "now":

- Tenant entity counts.
- Active/enabled buyer counts.
- Outstanding dues.
- Credit exposure.
- Current inventory posture.
- Current low-stock/stockout posture.
- Current buyer app enablement/adoption state.

Suggested naming for new or revised tables:

- `app.tenant_entity_snapshot`: optional tenant-grain current-state rollup for cross-entity counts and status totals that are reused across multiple seller pages. This should only be introduced if it materially reduces repeated snapshot reads or prevents duplicated trigger work. Otherwise, keep entity-specific snapshots.
- `app.orders_snapshot`: current-state order counts and status buckets per tenant/location scope. This fills the current order summary gap.
- `app.buyer_current_snapshot`: current buyer state for home and credit cards, covering credit limit, outstanding dues, credit used, available credit, open invoice count, earliest due date, open order count, and last activity/opened-app markers. Prefer this single table over separate `buyer_credit_snapshot` and `buyer_home_snapshot` unless profiling proves separate tables create a meaningful performance win.
- Keep existing entity-specific snapshot tables where useful, but align columns and naming.

Avoid unnecessary tables. Every new snapshot table must justify:

- Which pages consume it.
- Which raw scans it removes.
- Which trigger or rebuild function owns it.
- Whether it replaces an existing snapshot instead of adding another write path.

### Daily KPI Facts

Use for additive or period-aggregatable metrics:

- Tenant daily GMV/orders/buyers/items.
- Buyer daily spend/orders/invoices.
- Product daily revenue/units.
- Brand/category/location/campaign/cohort daily metrics.
- Estimate/order/invoice daily document facts with document-specific status buckets.
- Buyer app daily contribution.

Daily facts should have:

- `tenant_id`.
- Grain ID where applicable, such as `buyer_id`, `tenant_product_id`, `tenant_brand_id`.
- `day date`.
- Additive metric columns.
- `created_at`, `updated_at`.
- No `deleted_at` unless we intentionally adopt soft-delete for KPI facts and update every query/function accordingly.

Scale rules:

- KPI tables should be sparse where zero rows do not carry business meaning.
- Do not write one daily row per buyer/product/category/location when all metrics are zero.
- Retain additive daily facts only for grains that need period rollups or trends.
- Use current-state snapshots for non-historical values instead of daily facts.
- Add composite indexes matching page access patterns, usually `(tenant_id, day)` and `(tenant_id, grain_id, day)`.
- Keep retention explicit. Existing 90-day retention is acceptable for short trend tables, but YTD buyer spend requires either longer retention, monthly rollups, or a separate year-to-date summary.
- For 10k+ buyer tenants, avoid buyer daily facts for inactive buyers. Write rows only when there is spend, order, invoice, login/session, or meaningful activity.
- Consider monthly rollups for high-cardinality grains if 12-month or YTD trends become frequent.

Days cover guidance:

- Current days cover can be computed as current sellable stock divided by recent demand velocity.
- Demand velocity should come from the business documents where stock is reserved or consumed, normally orders and invoices depending on the final inventory model.
- If stock reservation and movement semantics are unclear, scope days cover out of critical KPI cards and show simpler current stock posture: in stock, low stock, stockout.
- Historical days cover requires a `tenant_inventory` stock-change audit or movement ledger and is out of scope until tenant inventory change tracking is designed.

### Read Models

Prefer stable read functions or views for page payloads:

- `app.get_seller_products_landing_summary(...)`
- `app.get_seller_customers_landing_summary(...)`
- `app.get_seller_invoices_landing_summary(...)`
- `app.get_buyer_home_summary(...)`

These can be SQL functions, views, or route-level server helpers, but each page should have one obvious summary source.

## Phased Execution Plan

### Phase 0: Live Schema Verification

Goal: confirm the real Supabase schema/functions before implementation.

Owner: master session with one DB investigator subagent.

Tasks:

- Use Supabase MCP or CLI to inspect live columns for all snapshot and KPI tables.
- Dump function definitions for `refresh_*_snapshot`, `refresh_kpi_*_daily`, `rebuild_kpi_*_for_tenant`, `post_sync_rebuild`, and trigger dispatchers.
- Verify whether any live aggregate table exists that is missing from local migrations, especially order/document daily facts.
- Compare live schema to local migrations.
- Produce a mismatch report.

Exit criteria:

- A verified list of real aggregate tables, columns, functions, triggers, cron jobs, and known schema drift.
- No implementation begins until this is complete.

### Phase 1: Metric Dictionary and Product Semantics

Goal: freeze metric definitions before changing code.

Owner: master session with PM/analytics subagent and DB subagent.

Tasks:

- Create a metric dictionary for all critical numbers.
- Encode the decided status inclusion rules for estimates, orders, and invoices across the app.
- Decide date columns per document type:
  - Orders: `placed_at`.
  - Estimates: `estimate_date`, falling back to `created_at`.
  - Invoices: `invoice_date`.
- Standardize timezone to `Asia/Kolkata` for all tenant-facing period metrics.
- Apply the seller assistant decision: all data is assigned-location-scoped.
- Apply the filter decision: filters, search, and sort affect table rows only, never KPI cards or callouts.
- Define days-cover behavior: keep only current stock posture unless demand velocity and reservation semantics are clear.

Exit criteria:

- A reviewed metric dictionary committed as a spec.
- Any ambiguous metric has an explicit product decision.

### Phase 2: Aggregate Schema Contract Fixes

Goal: make aggregate tables structurally reliable.

Owner: master session with DB migration subagent.

Tasks:

- Fix `customers_snapshot` contract: either add `total_count` or stop querying it.
- Remove `deleted_at` filters from KPI table reads, or add a deliberate `deleted_at` column to all KPI tables and update refresh functions.
- Add missing indexes for common summary reads.
- Add or revise document aggregate coverage:
  - `orders_snapshot`.
  - `kpi_estimates_daily`.
  - `kpi_orders_daily`.
  - `kpi_invoices_daily`.
- Add buyer-scoped aggregate coverage only if needed:
  - `kpi_buyer_daily` for spend/activity days only.
  - `buyer_current_snapshot` as the preferred single current-state buyer table.
- Ensure every new migration is created via Supabase CLI.

Exit criteria:

- Local tests and live schema inspection prove table/query contracts match.
- No app route queries missing/phantom columns.

### Phase 3: Aggregate Function Standardization

Goal: make aggregate writes correct and uniform.

Owner: master session with DB function subagents split by metric family.

Subagent slices:

- Tenant/order KPI functions.
- Estimate/order/invoice document daily functions.
- Product/brand/category KPI functions.
- Location/warehouse inventory functions.
- Customer/buyer/credit functions.
- Buyer app functions.
- Campaign/cohort functions, if included in this phase.

Tasks:

- Align status filters with the metric dictionary.
- Align date bucketing to IST.
- Make refresh functions idempotent.
- Make rebuild functions delete or zero stale sparse rows when source activity disappears.
- Revisit incremental sync windows and define when historical edits trigger broader rebuilds.
- Ensure bulk sync bypass plus completion rebuild is observable and recoverable.
- Ensure draft document handling matches the flow metric decision while separate converted/confirmed/paid metrics remain distinct.

Exit criteria:

- Function-level tests compare aggregate output to raw-table truth fixtures.
- Rebuild functions can repair deliberately stale aggregate rows.
- Status/date definitions match across all grain tables.

### Phase 4: Seller Landing Page Read Refactor

Goal: stop landing pages from computing KPI cards from visible rows.

Owner: master session with one subagent per page family.

Subagent slices:

- Products + brands + categories.
- Customers + cohorts.
- Estimates + sales orders + invoices.
- Campaigns + price lists.
- Locations + warehouses.
- Dashboard.
- Buyer app seller page.

Tasks:

- Split each route into summary query, rows query, and row-metrics query.
- Summary query reads aggregate tables for full universe and selected period.
- Rows query applies search/filter/sort/pagination on the server.
- Row-metrics query reads aggregate tables for visible row IDs and selected period.
- Remove page-scoped KPI reductions.
- Remove any dangling filtered-KPI behavior.
- Add route tests proving KPIs do not change when `limit`, cursor, search, filters, or sort change.
- Keep retained table data during refetches where practical, and use skeletons for initial or slow fetch states.

Exit criteria:

- Every seller landing API follows the same response contract.
- Tests prove KPI cards are full-universe and rows are server-filtered/paginated.

### Phase 5: Seller Detail Page Read Refactor

Goal: make detail pages use entity-scoped aggregate contracts.

Owner: master session with subagents by entity detail page.

Subagent slices:

- Brand detail.
- Product detail.
- Customer detail.
- Cohort detail.
- Category detail.
- Location detail.
- Warehouse detail.
- Campaign detail.
- Price list detail.
- Estimate/order/invoice detail, only where header KPI/performance metrics exist.

Tasks:

- Inventory detail-page KPI sources.
- Replace raw scans with snapshot/KPI reads where available.
- Add missing entity daily KPI grains where the product needs trends.
- Keep related tables paginated and server-filtered.
- Ensure performance tabs declare their range and use matching aggregate queries.

Exit criteria:

- Every detail header KPI and performance tab has a documented source.
- Tests cover at least one non-current period where applicable.

### Phase 6: Buyer Home Aggregate Refactor

Goal: make buyer home financial numbers deterministic and scalable.

Owner: master session with buyer-app subagent and DB subagent.

Tasks:

- Create or reuse buyer daily KPI aggregate for YTD spend and trend.
- Create or reuse `buyer_current_snapshot` for outstanding dues, credit usage, open order count, and opened-app activity markers.
- Replace live invoice/order scans for financial cards.
- Fix unbounded `order_items` query by scoping to visible/recent order IDs at SQL level.
- Standardize buyer home date boundaries to IST.
- Keep recommendations non-blocking.

Exit criteria:

- Buyer home financial cards come from aggregate tables/functions.
- Buyer home route has no unbounded cross-tenant service-role scans.
- Tests cover month boundary and YTD behavior.

### Phase 7: Reconciliation and Monitoring

Goal: catch future drift automatically.

Owner: master session with testing/observability subagent.

Tasks:

- Add SQL reconciliation tests comparing aggregate tables to raw source tables.
- Include high-cardinality scale fixtures for sparse daily facts, especially buyers and products.
- Add app route tests for representative pages.
- Add a manual/admin repair function to rebuild aggregates for tenant and date range.
- Add sync job warnings when post-sync rebuild fails.
- Add a lightweight aggregate freshness monitor using `refreshed_at` and `updated_at`.

Exit criteria:

- CI catches aggregate drift for core metrics.
- Operators can repair tenant aggregates without manual SQL surgery.

### Phase 8: Cleanup and Documentation

Goal: remove old patterns and make the standard hard to regress.

Owner: master session with cleanup subagent.

Tasks:

- Remove leftover debug instrumentation.
- Remove route-level ad hoc aggregation that duplicates aggregate functions.
- Document the standard in `AGENTS.md` or a linked architecture doc.
- Add code review checklist for metrics pages.
- Add fixtures for status/date edge cases.

Exit criteria:

- New seller/buyer pages have a clear template to follow.
- Reviewers can reject page-scoped KPI implementations quickly.

## Suggested Master Session Workflow

Use a master session as coordinator. Keep it focused on decisions, integration, and final review.

Recommended loop per phase:

1. Master session states the phase goal and assigns subagent scopes.
2. Investigator subagents read only their relevant files and return concise findings.
3. Builder subagents make narrow changes in one page or function family.
4. Master session reviews diffs for contract consistency.
5. Test subagent adds or updates targeted tests.
6. Master session runs verification and writes the phase summary.

Avoid assigning broad "fix all metrics" work to one subagent. The risk surface is too large.

## Suggested Subagent Scope Rules

Good subagent scopes:

- "Audit and fix products landing summary contract only."
- "Standardize `kpi_tenant_daily` status/date logic and tests only."
- "Move invoices landing KPIs off paginated rows only."
- "Create buyer home aggregate read contract only."
- "Add sparse `kpi_orders_daily` and wire only orders landing."
- "Define days-cover decision and remove it from critical cards if unsupported."

Bad subagent scopes:

- "Fix all dashboard metrics."
- "Refactor all seller pages."
- "Rewrite snapshot system."

## Execution Order

Recommended order:

1. Phase 0: Live schema verification.
2. Phase 1: Metric dictionary.
3. Phase 2: Schema contract fixes.
4. Phase 3: Function standardization.
5. Phase 4: Seller landing pages.
6. Phase 6: Buyer home.
7. Phase 5: Seller detail pages.
8. Phase 7: Reconciliation and monitoring.
9. Phase 8: Cleanup and documentation.

Buyer home can move before detail pages because it is high customer-facing risk and has a smaller surface area than all seller detail pages.

## First Implementation Candidates

After phases 0 and 1, fix these first:

1. Remove or resolve phantom aggregate columns:
   - `customers_snapshot.total_count`.
   - KPI table `deleted_at` filters.
2. Products landing:
   - Move KPI cards off paginated `pageProducts`.
3. Invoices landing:
   - Move KPI cards off paginated `invoiceRows`.
4. Customers landing:
   - Move spend/dues/dormancy cards off visible buyers only.
5. Buyer home:
   - Scope `order_items` query and move financial cards to aggregate contract.
6. Orders/documents:
   - Add missing order snapshot and document daily facts after metric dictionary approval.

These are the clearest correctness wins with the least product ambiguity.

## Non-Goals

- Do not introduce a separate analytics warehouse yet.
- Do not add Typesense or external OLAP tooling.
- Do not redesign the frontend UI.
- Do not remove existing snapshot/KPI tables wholesale.
- Do not make filters, search, or sort affect KPI cards or callouts.
- Do not add new aggregate tables unless they remove meaningful repeated raw scans or provide a required grain that existing tables cannot support.

## Product Decisions

- Seller assistants see only assigned-location-scoped KPIs, callouts, lists, and entities.
- Draft estimates, orders, and invoices count toward total flow metrics and GMV where the metric is intended to show business flow and buyer engagement.
- Converted/confirmed/paid metrics are separate downstream-quality metrics.
- Estimate KPIs use `estimate_date`; if unavailable, use `created_at`.
- Buyer app "opened app MTD" is a critical billing metric and is based on login/session or activity, not account enablement alone.
- Campaign conversion includes order count, estimate count, unique buyers who purchased through the campaign, and attributed GMV.
- Current stock posture is first priority. Historical inventory trends require deeper inventory movement tracking and are out of scope for this pass.
