# Metrics V2 Phase 7 Detail Cutover Plan

Date: 2026-07-16

Status: implementation/cutover plan, not validation evidence

Companion docs:

- [Metrics V2 execution log](./metrics-v2-execution-log-2026-07.md)
- [Metrics V2 implementation plan](./metrics-v2-implementation-plan-2026-07.md)
- [Metrics product strategy](./metrics-product-strategy-proposal-2026-07.md)

## Scope

This sweep completes implementation and direct read cutover for seller analytic detail pages. It intentionally excludes the deferred Phase 7 validation and stress-testing gates: `EXPLAIN`, p95/p99, staging activation, load/resource evidence, and the full visual matrix. Those gates remain required before Phase 7 can be called exit-gate complete, but they are not part of this implementation pass.

The target end state for this sweep is:

- every selected analytic detail page reads its Pulse and Explore cards from the Metrics V2 detail bootstrap RPC family;
- detail pages consume the normalized `metric_cards` and `performance_cards` contract through shared R12 primitives;
- V1 `*_snapshot` and `kpi_*_daily` tables are no longer read by analytic detail card APIs;
- Phase 6 landing-page fetches remain on V2 sources, with V1 leftovers clearly classified as non-landing, legacy, or out-of-scope operational surfaces.

Transaction document details remain exempt. Estimate, Sales Order, and Invoice details keep their document shells and must not receive duplicate KPI or Performance surfaces.

## Current Evidence

The execution log records Phase 7 as partially complete. Shared representation components and V2-only detail bootstrap RPCs exist, but route/page consumption is incomplete. The explicitly incomplete detail routes are:

- `app/api/tenant/customers/[id]/route.ts`
- `app/api/tenant/products/[id]/route.ts`
- `app/api/tenant/brands/[id]/route.ts`
- `app/api/tenant/categories/[id]/route.ts`
- `app/api/tenant/locations/[id]/detail/route.ts`

The existing V2 detail RPC foundation contains:

- `app.get_seller_customer_detail_v2`
- `app.get_seller_product_detail_v2`
- `app.get_seller_brand_detail_v2`
- `app.get_seller_category_detail_v2`
- `app.get_seller_location_detail_v2`
- `app.get_seller_warehouse_detail_v2`
- `app.get_seller_cohort_detail_v2`
- `app.get_seller_pricelist_detail_v2`
- `app.get_seller_campaign_detail_v2`

The current source scan found direct V1 detail-source reads in these implementation paths:

- Customer detail: `buyers_snapshot`, `kpi_buyers_daily`
- Product detail: `kpi_product_daily`
- Brand detail: `kpi_brand_daily`, `kpi_product_daily`
- Category detail: `kpi_category_daily`, `kpi_product_daily`
- Location detail: `locations_snapshot`, `kpi_location_daily`, `kpi_orders_daily`, `kpi_estimates_daily`, `kpi_invoices_daily`
- Warehouse detail helper: `warehouses_snapshot`, `kpi_warehouse_daily`

Adjacent V1 reads that should not block this detail cutover, but must remain classified, are:

- cohort composer facets: `src/lib/server/cohort-composer.ts`
- catalog composer bootstrap: `src/lib/server/catalog-composer.ts`
- legacy summary endpoints: `app/api/tenant/customers/summary/route.ts`, `app/api/tenant/products/summary/route.ts`
- integration/settings freshness and repair language
- retained dashboard fallback/legacy freshness reads until the dashboard cutover/retirement pass explicitly removes them

## Phase 6 Landing-Page Audit

The Phase 6 landing-page implementation is clean for active landing fetches based on the current route and hook scan:

- Transaction landings call `app.metrics_v2_transaction_landing(...)` while their paginated tables remain bounded raw document queries.
- Products landing calls `app.metrics_v2_products_landing(...)`; the active landing route no longer reads `products_snapshot`, `tenant_inventory`, or `kpi_product_daily`.
- Customers landing calls `app.metrics_v2_customers_landing(...)`; the active landing route no longer reads `buyers_snapshot` or `kpi_buyers_daily`.
- Buyer App landing calls `app.get_metrics_v2_buyer_app_dashboard(...)`; the legacy read-on-load Buyer App snapshot path is removed from the landing route.
- Brands, Categories, Locations, and Warehouses landing routes/helpers passed the V1 read retirement scan recorded in the execution log.
- Campaigns, Customer Groups, and Pricelists landing bootstraps use their current fixed-horizon routes. Any V1 reads in composer/detail helpers are not active landing-page fetches.

Follow-up guardrail for the cutover PR: keep a source-isolation test or scan that targets only active landing fetch files, so summary/composer/settings leftovers do not create false positives while real landing regressions still fail.

## Cutover Sequence

### 1. Freeze the Shared Detail Response Type

Add a shared TypeScript response type for the V2 detail bootstrap payload. It should cover header identity, period metadata, `metric_cards`, `performance_cards`, role visibility, unavailable cards, and any operational sections retained outside analytics.

Use the existing `DetailCardRenderer`, `MetricGrid`, `PerformanceCard`, `RankedList`, `DistributionList`, `TrendFrame`, and `CardEmptyState`. Do not introduce another page-local analytics card shell.

### 2. Replace API Analytics Payloads With V2 Bootstrap RPCs

For each analytic detail API, keep base ownership/security checks and mutation behavior, but replace analytics card calculation with the matching V2 RPC:

| Surface | Route/helper | Target RPC |
| --- | --- | --- |
| Customer | `app/api/tenant/customers/[id]/route.ts` | `app.get_seller_customer_detail_v2` |
| Product | `app/api/tenant/products/[id]/route.ts` | `app.get_seller_product_detail_v2` |
| Brand | `app/api/tenant/brands/[id]/route.ts` | `app.get_seller_brand_detail_v2` |
| Category | `app/api/tenant/categories/[id]/route.ts` | `app.get_seller_category_detail_v2` |
| Location | `app/api/tenant/locations/[id]/detail/route.ts` | `app.get_seller_location_detail_v2` |
| Warehouse | `src/lib/server/warehouse-data.ts` / `app/api/tenant/warehouses/[id]/route.ts` | `app.get_seller_warehouse_detail_v2` |
| Customer Group | `app/api/cohorts/[id]/route.ts` | `app.get_seller_cohort_detail_v2` |
| Pricelist | `app/api/price-lists/[id]/route.ts` | `app.get_seller_pricelist_detail_v2` |
| Campaign/Catalog | `app/api/tenant/catalogs/[id]/route.ts` | `app.get_seller_campaign_detail_v2` |

Large operational tabs remain separate bounded raw queries: members, products, stock, assignments, buyers, activity, and composition tables. The bootstrap RPC should not become a "load everything" endpoint.

### 3. Preserve Authorization and Location Scope

Do not loosen existing tenant and role checks while simplifying analytics:

- Cross-tenant guard stays in each route before returning any payload.
- Seller assistant location scope must be passed to V2 RPCs when the surface supports assistant access.
- Seller-admin-only pages, such as current category/location admin routes where applicable, should remain admin-only unless the product/RBAC contract is changed separately.
- Cost-price and sensitive pricing fields remain hidden from `seller_assistant`.

### 4. Update Hook and Page Consumption

Convert detail hooks and pages from legacy `meta_strip_4` / `meta_strip` / page-specific `performance` objects to the normalized V2 card contract:

- Customer: `app/(seller)/customers/[id]/page.tsx`, `CustomerPerformanceTab`
- Product: `useProducts`, `ProductDetailPage`, `ProductPerformanceTab`
- Brand: `useBrands`, `BrandDetailPage`, `BrandPerformanceTab`
- Category: `useCategories`, `CategoryDetailPage`, `CategoryOverviewTab`
- Location: `useLocations`, `LocationDetailPage`, `LocationOverviewTab`
- Warehouse: `useWarehouses`, `WarehouseDetailPage`, `WarehousePerformanceTab`
- Cohort: `useCohorts`, `CohortDetailPage`, `CohortPerformanceTab`
- Catalog/Campaign: `useCatalogs`, `CatalogDetailPage`, `CatalogPerformanceTab`
- Pricelist: `usePriceLists`, `app/(seller)/price-lists/[id]/page.tsx`

Every migrated page should render:

1. breadcrumb;
2. identity/status/actions;
3. adaptive Pulse from `metric_cards`;
4. R12 tabs;
5. tab content using `performance_cards` through `DetailCardRenderer`.

### 5. Fill Only Truthful V2 Card Data

Where the existing V2 bootstrap RPC currently returns `unavailable`, populate only bounded V2-safe data. Do not temporarily route these cards through V1 daily facts.

Allowed implementation sources:

- V2 snapshots/read models already introduced by Metrics V2;
- bounded raw document/line queries when the product strategy marks the card `ON-OPEN`;
- current entity/setup tables for identity, validity, assignment, and configuration posture;
- current inventory tables for NOW posture when no historical claim is made.

Forbidden implementation shortcuts:

- `buyers_snapshot`, `products_snapshot`, `brands_snapshot`, `categories_snapshot`, `locations_snapshot`, `warehouses_snapshot`;
- `kpi_buyers_daily`, `kpi_product_daily`, `kpi_brand_daily`, `kpi_category_daily`, `kpi_location_daily`, `kpi_warehouse_daily`;
- buyer-by-day or product-by-day V2 facts;
- stored entity-ID arrays, stored top-list JSON, or stored ranked membership;
- order-led sales labels where the product strategy requires invoiced sales.

Cards that can stay explicitly unavailable after this implementation pass must be unavailable because no truthful bounded source contract exists yet, not because the page still has a V1 dependency.

### 6. Remove Legacy Analytics Adapters

After each page consumes V2 cards, remove or narrow legacy-only analytics code:

- local month-bound helpers that exist only for KPI-table aggregation;
- trend aggregation over V1 daily rows;
- page-local top-buyer/top-product ranking built from full unbounded order hydration;
- obsolete `units_snapshot`, `meta_strip_4`, and local performance-card response shapes when no longer needed by UI.

Keep non-analytic operational lists and mutation payloads intact.

### 7. Add Focused Implementation Guardrails

Add or update tests that prove implementation cutover, without claiming stress/validation gates:

- route tests assert each detail route calls the expected V2 RPC and preserves tenant/role behavior;
- hook/page tests assert `performance_cards` render through shared primitives, including unavailable cards;
- source-isolation tests fail if analytic detail routes/helpers reference V1 `*_snapshot` or `kpi_*_daily`;
- transaction detail tests assert no KPI/Performance surface was added to Estimate, Sales Order, or Invoice details;
- Phase 6 landing-source scan remains green for active landing fetches.

## Acceptance for This Sweep

This implementation/cutover sweep is complete when:

- all selected analytic detail routes/hooks/pages consume V2 bootstrap detail payloads;
- active landing fetches remain free of V1 table reads;
- repository scans find no V1 `*_snapshot` or `kpi_*_daily` reads in analytic detail card paths;
- remaining V1 reads are classified as composer, summary, settings/freshness/repair, dashboard-retirement, or other explicitly out-of-scope operational paths;
- focused unit/route/component tests for the changed detail surfaces pass;
- the execution log is updated with changed files, cutover scope, guardrail scans, and tests run.

The sweep does not close Phase 7's full exit gate. The following remain separate validation work:

- detail RPC `EXPLAIN (ANALYZE, BUFFERS)` evidence;
- API p95/p99 and timeout evidence;
- staging activation and stress/load/resource evidence;
- full 1280px/1440px/1920px visual matrix;
- later physical retirement/drop of obsolete V1 tables and writers.
