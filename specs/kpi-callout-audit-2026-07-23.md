# Seller-App + Buyer-App KPI/Callout Cross-Page Audit — 2026-07-23

Read-only investigation. No code changed. Covers every seller-cockpit landing page
(Locations, Warehouses, Categories, Products, Customers, Invoices, Orders, Estimates,
Dashboard, Brands, Cohorts, Catalogs, Price Lists) plus the Buyer App PWA (Home tab,
Profile tab). All live values pulled directly from RPCs/tables against tenant
`d601c35c-1a78-4506-a556-a82118d72893` (project `hcpzbnmumbykdqveyjhr`) on 2026-07-23.
Amounts in ₹.

**Update note (this revision):** the user has confirmed the `total_amount` vs
`SUM(line_total)` gap is partly a data-completeness issue — many invoices are
missing loaded line items — and a backfill is underway. Re-run the §1 basis
triangulation after backfill completes; expect the gap to shrink but not
disappear (see §5 pattern 3 for why a residual gap is structurally expected).

## TL;DR — root causes of the two flagged discrepancies

**"Invoiced Sales" disagrees across pages because three independent variables change per page, and no two pages use the same combination:**

| Variable | Values in play |
|---|---|
| Amount basis | `invoices.total_amount` (header, incl. tax/rounding) **vs** `SUM(invoice_items.line_total)` (line-item only, currently understated tenant-wide pending the line-item backfill) |
| Time window | Trailing 90 calendar days **vs** calendar month-to-date (MTD) — and some MTD-*labeled* fields are actually 90d |
| Source table | Live `app.invoices` **vs** 4 different snapshot/rollup tables, each refreshed on its own cadence |
| Source *event* | Invoice-based (most pages) **vs** order-based (Brands, Cohorts) **vs** order+estimate-based (Catalogs) — not a timing/basis issue, a different underlying event entirely |

**"Overdue amount" disagrees because at least one page (Locations) shows *receivable* (all outstanding, unpaid + not-yet-due) under a KPI tile literally labeled "Overdue amount"** — that's not a rounding/timing gap, it's the wrong number under the wrong label. The same class of bug recurs on the Buyer App side, three-way, across Home/Profile.

---

## 1. Invoiced Sales — cross-page comparison

| Page | Displayed value (KPI field) | Live value pulled directly | Basis | Window | Source table |
|---|---|---|---|---|---|
| Locations | "Invoiced sales 90D" | **₹9.45cr** (total_amount) / snapshot ≈ ₹9.43cr | `total_amount` | trailing 90d | `metrics_location_daily.invoice_value` (client sums loaded rows) |
| Categories | "Invoiced sales" | **₹7.57cr** (line_total) / snapshot ≈ ₹7.52cr | `SUM(line_total)` | trailing 90d | `invoice_items` join, per-category (client sums loaded rows) |
| Products | "Invoiced sales · 90D" (UI label correct; internal field name `revenue_mtd` is not) | **₹7.515cr** | `SUM(invoice_units_90d / invoice_value_90d)` from `metrics_product_snapshot` | trailing 90d, correctly labeled in UI | `metrics_product_snapshot` |
| Customers | "Invoiced sales · MTD" (**UI label is wrong**) | **₹9.39cr** | `total_amount`, via `metrics_buyer_snapshot.invoice_value_90d` | **actually trailing 90d** — RPC's own payload says `headline_period: 'trailing_90_days'`, but `CustomersLandingClient.tsx` hardcodes the suffix `'MTD'` regardless | `metrics_buyer_snapshot` / `metrics_buyer_location_snapshot` |
| Invoices landing | "Invoiced sales" | **₹2.41cr** | `total_amount` | **true calendar MTD** | `metrics_tenant_daily.invoice_value` (or `metrics_location_daily` if scoped) |
| Dashboard | "Invoiced sales · This month" | **₹2.413cr** | `total_amount` | true calendar MTD | `metrics_tenant_commercial_snapshot.current_month_invoice_value` |

**Live basis triangulation (same tenant, same "trailing 90 days", isolating just the amount-basis variable):**

```
trailing_90d_total_amount     ₹94,509,101   (13,369 invoices)
trailing_90d_line_total_sum   ₹75,672,217   (12,518 invoices, header-only rows excluded)
```

`total_amount` > `SUM(line_total)` by ~₹1.88cr for this tenant — the gap is whatever sits at the invoice header level and never lands in `invoice_items` (freight/rounding/discount/tax adjustments, or invoices with zero line items). This alone explains Locations (9.4x) vs Categories/Products (7.5x).

**Root causes, ranked by impact:**

1. **Amount-basis split (`total_amount` vs `SUM(line_total)`)** — Locations/Warehouses/Customers/Invoices/Dashboard use `total_amount`; Categories/Products use line-item sums because they need to attribute revenue to a specific category/product, which only line items carry. This is a structural, unavoidable-by-design difference for the category/product pages, but it means "Invoiced Sales" can never be reconciled 1:1 between those two families of pages unless one side is explicitly relabeled ("Line-item revenue" vs "Invoiced sales") to stop implying they're the same number.
2. **MTD vs 90d, with mislabeling** — Products' `revenue_mtd` and Customers' `spend_mtd`/"Invoiced sales · MTD" both compute a **trailing-90-day** figure but are named/labeled as if month-to-date. Invoices landing and Dashboard compute **true calendar MTD**. Two different periods, both called roughly "this period," on cards sitting one page apart.
3. **Four independently-refreshed snapshot tables** feed the "same" MTD number: `metrics_tenant_commercial_snapshot.current_month_invoice_value` (Dashboard) vs `metrics_tenant_daily` summed (Invoices landing) — live check shows these already drifted by ₹4,061 (₹24,132,840 vs ₹24,128,779) purely from refresh-cadence lag, on top of the bigger basis/window gaps above.
4. Locations' and Categories' client components sum only the **currently-loaded page of rows** (`rows.reduce((s,r) => s + r.gmv_mtd, 0)`), not a true tenant-wide total from the RPC — confirmed via a comment already in `categories-landing.ts` ("this is an approximation until that field is exposed"). Didn't cause a visible error for this 8-location/24-category tenant (both fit on one page), but will silently under-report the KPI for any tenant with more locations/categories than the page size.

---

## 2. Overdue Amount — cross-page comparison

| Page | Displayed value (KPI field) | Live value | Actually computes | Source |
|---|---|---|---|---|
| Locations | "Overdue amount" tile | **₹40.23L** (snapshot) / ₹39.98L (live) | **Receivable** (all outstanding unpaid invoices, due or not) | `outstanding_dues_total` ← `metrics_location_snapshot.receivable_amount` |
| Invoices landing | "Overdue amount" | **₹29.5L** | True overdue (`due_date` passed) | `metrics_tenant_commercial_snapshot.overdue_amount` (tenant-wide) or live query (location-scoped) |
| Dashboard | "Overdue receivables" | **₹29.5L** | True overdue — explicitly overwritten downstream from Invoices' RPC result | `metrics_v2_transaction_landing('invoices').overdue_sum` |
| Customers | "Overdue amount" | **₹31.23L** (snapshot, buyer-grain) | True overdue, but summed at buyer grain (10,884 buyer-snapshot rows) instead of invoice grain | `metrics_buyer_snapshot.overdue_amount` |

**Live triangulation, same tenant:**

```
live_overdue_all_time (due_date < today, has receivable)    ₹29,50,106   (271 invoices)
live_receivable_all_time (has receivable, due or not)       ₹39,97,660   (331 invoices)
metrics_location_snapshot.receivable_amount (sum)            ₹40,23,015
metrics_buyer_snapshot.overdue_amount (sum)                  ₹31,23,086
```

**Root cause — this is a real bug, not just drift:**

`src/components/seller/locations/LocationsLandingClient.tsx:268` renders:

```tsx
{
  label: 'Overdue amount',
  value: formatNumberValue(kpis.outstanding_dues_total, 'CURRENCY_THRESHOLD'),
  sub: `across ${kpis.dues_location_count} locations`,
  ...
}
```

`kpis.outstanding_dues_total` is sourced (both before and after the KPI-fix migration applied earlier this session) from `SUM(receivable_amount)` in `get_seller_locations_landing_summary` — **receivable**, not overdue. `receivable_amount` = any invoice with `outstanding_balance > 0` and a live status, regardless of whether `due_date` has passed. `overdue_amount` = the subset of receivable where `due_date < today`. The Locations page is unconditionally showing the larger, unfiltered number (₹40.2L) under a label that promises the smaller, due-date-filtered number (₹29.5L) — a genuine mislabel/wrong-field bug, independent of any refresh-lag or basis argument. Invoices and Dashboard agree with each other (both ₹29.5L, same predicate, same near-real-time snapshot) because Dashboard explicitly overwrites its own overdue figure with the Invoices-landing RPC's result — that pairing is correctly reconciled.

Customers' ₹31.2L sits between the two because `metrics_buyer_snapshot` is a different, buyer-grained refresh with its own cadence — same overdue *definition* as Invoices/Dashboard, but a third independently-refreshed copy of it, currently ~6% stale relative to the live number.

---

## 3. Full KPI inventory by landing page

Values below are what each page's own KPI RPC returns for tenant `d601c35c-...` at the time of this audit, alongside the qualifying filter for each figure. "Table" is the primary read path; snapshot tables are refreshed asynchronously from the live tables they summarize.

### Locations (`app.get_seller_locations_landing_summary`)

| KPI | Value | Qualifying filter |
|---|---|---|
| Active locations | 0 | `lower(status) = 'active'` — **all 9 locations in this tenant have `status = 'inactive'`, confirmed via direct query, yet 8 of them carry live GMV, buyers, and 16,882 invoices between them. Either "inactive" means something other than "not operating" for this data set, or every KPI/callout on this page that gates on "active" is silently suppressing a fully-trading tenant. Worth a product/data-semantics check, not a query bug — the RPC is faithfully reading what's in the column.** |
| Unpaid invoice count | 333 | `invoice_status_has_receivable(status, outstanding_balance)`, all-time, all locations |
| Total invoice count | 16,882 | all invoices, all-time, no status filter |
| Outstanding dues total *(mislabeled "Overdue amount" in UI)* | ₹41,43,770 | `SUM(receivable_amount)` per location, all-time |
| Dues location count | 8 | locations where `receivable_amount > 0` |
| Open estimate count | 3,864 | `estimate_status_is_open` = `draft`/`sent`, live count, all-time |
| Total estimate count | 5,759 | all estimates, all-time |
| Conversion % *(newly exposed this session)* | 21.1% | `AVG(conversion_90d)` across locations — `conversion_90d` = invoices(90d) / (estimates+orders)(90d), capped at 100 |
| Top location GMV share | 21% | `top_one.gmv / SUM(all locations' gmv)`, trailing 90d, `total_amount` basis |

**Callouts:**

| Callout | Row count | Qualifying filter |
|---|---|---|
| Conversions | 16 | open estimates (`estimate_status_is_open`) expiring within 14 days from today |
| Top locations | 8 | locations with `gmv > 0` (trailing 90d), **unbounded** — full list returned, client slices to 2 for preview |
| Collections overdue | 8 | locations with `overdue_amount > 0` **and** a resolvable `oldest_unpaid_days` (post-fix; previously silently dropped rows with no due-date data) |

### Warehouses (`app.get_seller_warehouses_landing_summary_v2`)

| KPI | Value | Qualifying filter |
|---|---|---|
| Active warehouses | (not re-queried this pass — see Locations "active" caveat, same status-hygiene risk applies) | `status = 'active'` |
| Tracked SKUs | tenant-wide sum | `COUNT(DISTINCT tenant_product_id)` with any inventory row at the warehouse (not qty-filtered) |
| Low-stock warehouses | tenant-wide count | warehouses where `low_stock_skus > 0 OR stockout_skus > 0` |
| Idle stock SKUs | 0 *(stale — see prior-session Bug 5 fix)* | `qty_available > 0 AND no invoice in trailing 90d`, sourced from `warehouses_snapshot`, refreshed only on write-trigger — daily freshness cron added this session but hasn't run yet as of audit time |

**Callouts:**

| Callout | Row count | Qualifying filter |
|---|---|---|
| Stock attention | 0 | `low_stock_skus > 0 OR stockout_skus > 0` |
| Idle stock | 0 | `idle_stock_skus > 0` — zero because of the staleness above |
| Recently replenished | 9 | all warehouses, ordered by `last_inventory_update DESC`, **unbounded** |

### Categories (`app.get_seller_category_landing_summary_v2`)

| KPI | Value | Qualifying filter |
|---|---|---|
| Active categories | per snapshot (`metrics_tenant_setup_snapshot.active_category_count`) | `is_active = true` |
| Low stock count | count of categories with any low-stock SKU | `low_stock_sku_count > 0` (now excludes OOS overlap, fixed this session) |
| Top category share | `top_category.gmv / total_gmv`, trailing 90d, `line_total` basis | — |
| "Uncategorized count" *(misleadingly named, correctly used)* | count of categories with `gmv_current = 0` in the period | **Not** "products without a category" despite the field name — UI already labels the tile correctly ("Categories with no sale in 90D") and pulls the true uncategorized-*product* count from a separate direct query |

**Callouts:**

| Callout | Row count | Qualifying filter |
|---|---|---|
| Stockout risk | 11 | categories with `low_stock_sku_count > 0 OR oos_sku_count > 0` |
| Top performers | 23 | categories with `gmv_current > 0`, trailing 90d |
| Fast movers | 23 | categories with `units_current > 0`, trailing 90d |

### Products (`app.metrics_v2_products_landing`)

| KPI | Value | Qualifying filter |
|---|---|---|
| Active SKUs | 340 | `is_active = true` |
| Total SKUs | 451 | all, `deleted_at IS NULL` |
| Out of stock | 99 | `metrics_product_snapshot.out_of_stock` |
| Low stock | 0 | `low_stock AND NOT out_of_stock` |
| "Invoiced sales · 90D" (internal field `revenue_mtd`, UI label is correct) | ₹7,51,51,687.64 | `SUM(invoice_value_90d)` from `metrics_product_snapshot`, filtered by whatever location scope applies, status `invoice_status_gmv_included`, table `app.invoices`, column `total_amount` |
| Units, same period (internal field `units_mtd`) | 1,26,127 | `SUM(invoice_units_90d)` |
| Revenue growth % | 100% (artifact) | `prev_revenue` is hardcoded to `0` in this RPC (`0::numeric AS previous_revenue_90d`), so growth always reads 100% whenever current revenue > 0 — **not a real growth calculation, a stub** |

### Customers (`app.metrics_v2_customers_landing`)

| KPI | Value | Qualifying filter |
|---|---|---|
| "Invoiced sales · MTD" *(mislabeled — actually trailing 90d)* | ₹9,38,95,986 | `SUM(invoice_value_90d)` from `metrics_buyer_snapshot`/`metrics_buyer_location_snapshot`, pre-aggregated over the **entire tenant's buyer base before pagination/search/status filters apply** |
| Overdue amount | ₹31,23,086 | `SUM(overdue_amount)` from same buyer snapshot, same `invoice_is_overdue` predicate as Invoices/Dashboard, independently refreshed |
| Overdue customer count | count where `overdue_amount > 0` | — |

### Invoices landing (`app.metrics_v2_transaction_landing`, `p_kind='invoices'`)

| KPI | Value | Qualifying filter |
|---|---|---|
| "Invoiced sales" (true calendar MTD) | ₹2,41,28,779 | `metrics_tenant_daily.invoice_value` summed `day BETWEEN month_start AND today` (IST) |
| Overdue amount | ₹29,50,106 | `metrics_tenant_commercial_snapshot.overdue_amount` (tenant-wide) or live query when location-scoped |
| Outstanding amount | ₹39,97,660 | `outstanding_balance` basis, `invoice_status_has_receivable` |

### Orders landing (`app.metrics_v2_transaction_landing`, `p_kind='orders'`)

| KPI | Value | Qualifying filter |
|---|---|---|
| Orders MTD / GMV MTD | ₹0 (this tenant is estimate-primary, near-zero order volume) | calendar MTD, `order_status_in_flow` for buyer count, no status filter for raw MTD count |
| Open total | snapshot `open_order_count` | `order_status_is_open` = `draft,open,received,confirmed,partially_dispatched,dispatched,partially_invoiced,overdue` |
| Open value | **not returned by RPC for `p_kind='orders'`** — API route falls back to `landingKpis.open_value ?? 0`, which the RPC never sets for this kind, so this **silently renders ₹0** even when `open_order_value` (₹7,04,970 live) is nonzero | bug, confirmed via code read + live snapshot check |
| Pending dispatch / received / delivered counts | live `COUNT(*)` queries, no date filter (all-time) | bypasses the snapshot RPC entirely |

### Estimates landing (`app.metrics_v2_transaction_landing`, `p_kind='estimates'`)

| KPI | Value | Qualifying filter |
|---|---|---|
| Estimates this period / GMV this period | calendar MTD | `metrics_tenant_daily.estimate_value`/`estimate_count` |
| Open estimates | snapshot `open_estimate_count` | `estimate_status_is_open` = `draft,sent` only |
| "Open accepted" / "ready to convert" | live count | `status = 'accepted'` — **surfaced alongside "open" figures even though `estimate_status_is_open` explicitly excludes `accepted`**, an internal inconsistency within one KPI card |
| Expiring soon | 0 (hardcoded stub in the RPC) then overwritten client-side | actual value computed separately via a live `pulse_aggregates` query (`expires_at <= now()+7d`) |

### Dashboard (`app.get_metrics_v2_seller_dashboard` + `metrics_v2_transaction_landing('invoices')` + several direct table reads)

Renders one of two views by role (`AdminSection` / `AssistantSection`), both assembled in `src/lib/server/seller-dashboard.ts`.

**Admin — KPI strip (4 tiles):**

| KPI | Value | Source | Window | Filter | Table | Amount basis |
|---|---|---|---|---|---|---|
| Invoiced sales · this month | ₹2,41,32,840 | `get_metrics_v2_seller_dashboard` (`invoiced_sales`, fallback `currentGmv`) | calendar MTD | `invoice_status_gmv_included` | `metrics_tenant_commercial_snapshot.current_month_invoice_value` (or `metrics_location_daily` if scoped) | `total_amount` |
| Open demand | — | `open_primary_demand_value` | point-in-time ("now"), not windowed | pre-aggregated "open" in snapshot; basis switches on tenant's orders-vs-estimates primary-demand flag | `metrics_tenant_commercial_snapshot` (or `metrics_location_snapshot` summed if scoped) | `total_amount` |
| Overdue receivables | ₹29,50,106 | **overwritten** downstream from `metrics_v2_transaction_landing('invoices').overdue_sum` | point-in-time | `invoice_is_overdue` | same as Invoices landing | `outstanding_balance` |
| Recently sold, now out of stock | count only | `recently_sold_products_now_out_of_stock` | trailing 90d for the "sold" half, point-in-time for "out of stock" | `metrics_product_snapshot.out_of_stock = true AND invoice_units_90d > 0` | `metrics_product_snapshot` | n/a (unit count) — **fallback path**, if RPC returns nothing, JS computes a *different* metric (`reorder_point > 0 AND qty_available <= reorder_point`, i.e. low-stock, not out-of-stock) under the same tile slot |

**Admin — callout panel (3 cards, preview 3 rows):**

| Callout | Qualifying filter | Table | Sort |
|---|---|---|---|
| Estimate follow-up / Order execution (label depends on tenant's primary-demand kind) | `estimates.status IN ('draft','sent')` or `orders.status IN ('received','confirmed')` | `app.estimates`/`app.orders`, `total_amount` | `total_amount` desc |
| Collections | overdue invoices (`isInvoiceOverdue`, same predicate as `invoice_is_overdue`), grouped by buyer | `app.invoices`, `outstanding_balance` | aggregated overdue amount desc |
| Buyer-app activation | buyers with `invoice_value_90d > 0 AND (buyer_app_enabled = false OR app_invoice_value_90d = 0)` | `app.metrics_buyer_snapshot`, trailing 90d | `invoice_value_90d` desc |

**Admin — detail cards below the fold:**

| Card | What it shows | Window | Table | Amount basis |
|---|---|---|---|---|
| Business flow | Invoiced sales / Order value / Estimate value, "this month" | calendar MTD | `metrics_tenant_commercial_snapshot` current-month columns | `total_amount` |
| Customer activity | Purchasing / repeat (≥2 invoices) / inactive (no invoice in 90d) / overdue customer counts, "last 90 days" | trailing 90d, except overdue-customers which is point-in-time and **client-overridden** to a distinct-buyer count from `isInvoiceOverdue` rather than the RPC's own `overdue_amount > 0` count — a third variant of "how many customers are overdue" within one page | `app.metrics_buyer_snapshot` | n/a (counts) |
| Sales mix (Brand/Category/Location toggle) | invoiced-sales share by dimension, "90 days" | trailing 90d | `invoice_items` joined to `invoices` (`invoice_status_gmv_included`) joined to `tenant_products`; location dimension reuses `location_comparison`'s figure | `line_total` (fallback `qty * unit_price`) — **the same line-item-vs-header-total basis split documented in §1 recurs here, inside the Dashboard itself** |
| Location comparison | per-location `invoiced_sales_90d`, `open_primary_demand_value`, `overdue_amount`, top 20 by GMV | trailing 90d | `app.metrics_location_snapshot` | `total_amount` |
| Recent activity | latest 8 across orders+estimates+invoices, no date filter, sorted by recency | all-time (sorted, not windowed) | `app.orders`/`app.estimates`/`app.invoices` | `total_amount` |

**Assistant view** (seller_assistant role, feature-gated, up to 4 metric tiles + backfill tiles if fewer than 2 qualify): Open estimates (`status IN draft,sent`), Orders to confirm (`status='received'`), Overdue invoices (reuses Invoices RPC's `overdue_count`), Low-stock alerts (`tenant_inventory` reorder-point breach), Inactive customers (no order in >30 days). Callouts: `needs_action` (buyers with `dues > 0 OR credit_utilization >= 100%`, via the same `loadBuyerCreditSnapshot` helper documented in the Buyer App section below — so the Dashboard's assistant view and the buyer's own Profile page share one credit-computation helper, which is good, but that helper's status predicate still diverges from the canonical `invoice_status_has_receivable` used everywhere else, per §6 finding below), `recent_activity`, `re_engage` (no order in >30 days).

Two RPC-returned items — `significant_changes` (stubbed `available: false`) and `inventory_actions` — are fetched but never rendered on this page.

### Brands (`app.get_seller_brand_landing_summary` + `app.get_seller_brand_landing_rows`)

Page hardcodes `period=last90` (not user-selectable), trailing 90d IST, despite internal field names saying `*_mtd`.

| KPI | Value | Qualifying filter | Table | Amount basis |
|---|---|---|---|---|
| Portfolio GMV · "mtd" (actually trailing 90d) | **₹0** (live-verified, this tenant) | tenant-wide: no status filter, pre-aggregated `app.kpi_brand_daily.gmv`; location-scoped: `order_status_in_flow(status)` live against `app.orders`/`app.order_items` | **`app.orders`/`app.order_items` — a sixth distinct financial concept, this time order-sourced, not invoice-sourced. Zero for this tenant because it's estimate-primary with near-zero order volume, even though the tenant carries ₹9+cr in invoiced sales** | `COALESCE(order_items.line_total, qty*unit_price)` located; pre-summed `kpi_brand_daily.gmv` tenant-wide |
| Brands carried | 15 | `is_active = true`, tenant-wide from `brands_snapshot.active_count` or live count if location-scoped | `app.tenant_brands` | n/a |
| Buyers with orders · "mtd" | 2 | `order_status_in_flow`, trailing 90d, distinct buyer | `app.buyers` LEFT JOIN `app.orders` | n/a |
| Total buyers | 10,892 | all buyers, no filter | `app.buyers` | n/a |
| Need attention count | 0 | brands where trailing-90d GMV declined vs prior 90d (order-based, same zero-order-volume issue as above) | `brand_rollup` | order `total_amount`/`line_total` |
| Catalog freshness count / total campaigns | 1 / 1 | `status = 'published'`, updated within trailing 90d | `app.campaigns` | n/a |

**Callouts** (all sourced from the same order-based `brand_rollup`, so all read ₹0/flat for this tenant):

| Callout | Qualifying filter | Sort |
|---|---|---|
| Needs attention | brands with a `gmv_decline` alert (current 90d order-GMV < previous 90d) | alert count desc, GMV desc, top 3 |
| Top performers | all visible brands, no threshold | current 90d order-GMV desc, top 3 |
| Top risers | all visible brands, no threshold | growth % desc, top 3 |

**Brand detail page** (`app.get_seller_brand_detail_v2`, fixed 90d window) switches basis entirely: "Invoiced sales 90D" / "Units 90D" / "Products" come from `app.metrics_product_snapshot` (`invoice_value_90d`/`invoice_units_90d`) — the **invoice**-based, line-item-attributed family shared with Categories/Products — not the order-based `kpi_brand_daily` the landing page's own KPI strip uses. **The Brands landing page and its own detail page compute "how much has this brand sold" from two entirely different source tables (orders vs. invoices)** — clicking from a ₹0 landing-page tile into the detail page for that same brand can show a nonzero "Invoiced sales 90D" figure, which will read as broken rather than as "two different metrics."

### Cohorts (`app.get_seller_cohort_landing_aggregates`)

| KPI | Value | Qualifying filter |
|---|---|---|
| Combined GMV · MTD (label) | trailing 90d (see note) | `SUM(orders_gmv)` from `app.kpi_buyers_daily`, sourced from `app.orders` only (`order_status_in_flow` — everything except `void`), column `total_amount`. **Invoices are not involved in this figure at all** — order-demand, not invoiced sales, same as Brands above. Additionally, `app/api/cohorts/route.ts` hardcodes `getSellerLandingPeriodMeta('last90')` and **ignores the `periodInput` argument actually passed to it** — the period selector on this page cannot change this KPI's window regardless of what the user picks. |

### Catalogs — served at the `/campaigns` route (`app.get_catalog_landing_metrics`)

Note: `app/(seller)/campaigns/page.tsx` actually renders the Catalogs landing component (`CatalogsLandingClient` via `/api/tenant/catalogs`) — there is no separate Campaigns landing page in the codebase; the "campaigns" URL and the "catalogs" feature are the same page.

| KPI | Value | Qualifying filter |
|---|---|---|
| "Campaign-linked demand value · 90D" (`gmv_mtd` field, but UI label is honest about being demand, not sales) | — | `SUM(orders.total_amount) + SUM(estimates.total_amount)`, trailing 90d — `app.orders` filtered by `order_status_in_flow`, `app.estimates` filtered by `estimate_status_is_open` OR `status='accepted'`. Order+estimate demand, not invoiced sales — correctly labeled as such — included here only so it's not mistaken for another "invoiced sales" data point if someone compares it against the other pages. |

### Price Lists

No dollar/GMV KPI at all — `get_seller_price_list_landing_aggregates` only returns counts (active/expired/expiring_soon/member_count). Not comparable to anything above.

### Buyer App — Home tab (`app/api/buyer/home/route.ts`, no RPC — assembled directly from live tables in the API route)

This is the buyer-facing PWA, a different surface from everything above (buyer's own view of their spend/dues/credit with one tenant), but it re-derives figures that conceptually overlap with the seller-side Customers page for the same buyer — and uses its own third and fourth predicate variants to do it.

| KPI | Value (illustrative buyer, this tenant) | Window | Filter | Table | Amount basis |
|---|---|---|---|---|---|
| "Spend this year" (`gmv_ytd`, falls back to `gmv_mtd`) | ₹16,62,230 (53 invoices) live vs **₹16,37,730 (52 invoices) under the canonical seller-side predicate** | calendar YTD/MTD, computed in JS over a ~13-month date-bounded fetch | **no status filter at all** — every invoice regardless of status | `app.invoices`, direct query (not a snapshot) | `total_amount` |
| Outstanding dues (Home card) | `metrics_buyer_snapshot.receivable_amount` when present; JS fallback (bounded to the same ~13-month window) otherwise | n/a (snapshot) / ~13mo bounded fallback | snapshot: same canonical predicate as everywhere else; JS fallback: `hasInvoiceReceivableExposure` — **confirmed identical** to SQL's `invoice_status_has_receivable` (same 5-status set) | `app.metrics_buyer_snapshot` / `app.invoices` | `outstanding_balance` |
| Available credit / Credit used | `credit_available`/`credit_limit` from snapshot when present; **fallback logic is inconsistent** — if the snapshot row is missing, `available_credit` falls back to the buyer's raw `credit_limit` (i.e. reports 100% available) while `credit_used` independently falls back to `receivable_amount`, so a buyer with a missing snapshot row and real dues can see "available: full limit" and "used: nonzero" simultaneously, which don't sum to the limit | n/a | n/a | `app.metrics_buyer_snapshot` / `app.buyers.credit_limit` | — |

**Buyer App — Profile tab:** two more independent computations of the same "how much does this buyer owe" question, live-verified to diverge from the canonical figure and from each other for the same buyer at the same instant:

| Source | Predicate | Live value (same buyer as above) |
|---|---|---|
| Canonical (`invoice_status_has_receivable`, used by Locations/Customers/Invoices/Dashboard) | `status IN ('sent','viewed','unpaid','partially_paid','overdue') AND outstanding_balance > 0` | ₹6,20,150 (23 invoices) |
| Profile credit widget (`loadBuyerCreditSnapshot` in `src/lib/server/buyer-credit.ts` — also reused by the seller Dashboard's `needs_action` callout, so this predicate variant leaks into the seller side too) | `status <> 'draft' AND outstanding_balance > 0` | **₹6,44,650 (24 invoices)** |
| Profile "unpaid invoices" sheet (`/api/buyer/invoices?unpaid_only=true`) | `outstanding_balance > 0` — **no status check at all** | **₹6,44,650 (24 invoices)** |

The extra ₹24,500/1 invoice in the latter two is whatever sits outside the 5-status receivable set but isn't `draft` — most likely a `paid` or `void` invoice with a stray positive `outstanding_balance` that the canonical predicate correctly excludes and these two don't. **Three different "outstanding dues" numbers for the same buyer, visible on two different tabs of the same app, one of whose underlying helper is also shared with a seller-facing callout** — this is the same class of bug as Locations' overdue-vs-receivable mislabel, just with three-way divergence instead of two, and harder to spot because it's cross-surface (buyer PWA vs seller cockpit) rather than two tiles on one page.

Not checked in this pass: Buyer Catalog and Orders/Estimates/Invoices tabs don't appear to carry their own independently-computed summary KPIs beyond list views and the per-document `outstanding_balance` already covered above.

---

## 4. Pages with no directly-comparable "invoiced sales" figure

Price Lists carries no dollar KPI at all. Cohorts, Catalogs ("campaigns" route), and Brands landing all show a GMV-labeled figure, but each is demand (orders, or orders+estimates), not invoiced sales — see their entries above. They're excluded from the section-1 comparison table because they're measuring a genuinely different thing, not because the number happens to look different for a mundane reason. Worth flagging that the seller app now has **six distinct "how much has this tenant sold" concepts** in play across pages: invoice `total_amount` (tenant/location grain), invoice `SUM(line_total)` (category/product/brand-detail grain), order demand (Brands, Cohorts), order+estimate demand (Catalogs), buyer-side invoice sum with no status filter at all (Buyer App Home), and true overdue vs. receivable — none interchangeable, several sharing near-identical labels. Brands is the sharpest illustration: its own landing page (order-based, reads ₹0 for this tenant) and its own detail page (invoice-based, reads nonzero) disagree about the same brand's sales within a single click-through.

---

## 5. Summary of distinct root-cause patterns found

1. **Wrong field under a label** (Locations "Overdue amount" ⇒ actually receivable) — the one outright bug among these, not explainable by timing/refresh.
2. **Mislabeled time window** (Customers "Invoiced sales · MTD" is actually trailing 90d — UI-level label bug; Products' internal field is named `revenue_mtd` but its own UI already renders it correctly as "90D", so that one's cosmetic-only, not user-facing).
3. **Structurally different amount basis** (`total_amount` vs `SUM(line_total)`) between location/tenant-grain pages and category/product-grain pages — largest single contributor to the dollar gap, and not fully fixable without either accepting the two numbers will never match or explicitly relabeling one of them.
4. **Different financial concept entirely, similar label** (Cohorts', Catalogs', and Brands' "GMV"/demand-value KPIs source from `app.orders`/`app.estimates`, not `app.invoices` — not reconcilable against "invoiced sales" no matter how the refresh/basis/window issues above are fixed, because they're not measuring the same event). Brands is the extreme case: its landing page (order-based) and its own detail page (invoice-based) disagree about the same brand's sales one click apart.
5. **Period selector silently ignored** (Cohorts' `combined_gmv_mtd` hardcodes `last90` server-side regardless of the `periodInput` the route receives — same failure mode as pattern 8 below, but here the RPC won't respond to the period argument at all, not even in code that's wired up to pass it).
6. **N independently-refreshed snapshot tables** for what's conceptually one number (`metrics_tenant_commercial_snapshot`, `metrics_tenant_daily`, `metrics_location_snapshot`, `metrics_buyer_snapshot`) — each drifts from live truth and from each other by its own refresh cadence; confirmed live drift of ~₹4K between two of them on Dashboard alone, and larger buyer-grain drift (₹31.2L vs ₹29.5L) for Customers' overdue figure.
7. **Client-side page-sum instead of RPC total** (Locations, Categories "Invoiced sales" tiles) — currently invisible at this tenant's data volume (rows fit on one page) but will silently under-report once tenants exceed the landing page's row limit.
8. **KPI strip ignores the table's period toolbar** (Orders/Estimates) — KPI cards are hardcoded to calendar MTD regardless of the `today/week/last90/quarter/year` selector the row table below obeys, so strip and table can show numbers computed over different periods.
9. **Missing/stubbed fields silently defaulting to 0** — Orders' `open_value` never returned for `p_kind='orders'` (falls back to 0 client-side), Products' `revenue_growth_pct` always reads 100% because `previous_revenue_90d` is hardcoded to 0 in the RPC, Estimates' `expiring_soon` hardcoded to 0 and only fixed by a second, separate live query downstream.
10. **Inconsistent "open" status sets used together in one KPI card** — Estimates mixes `estimate_status_is_open` (`draft`,`sent`) with a live `status='accepted'` count labeled "open_accepted"/"ready_to_convert"; Orders mixes `order_status_is_open` (8 statuses) with `order_status_in_flow` (all statuses except 5 terminal ones) for different fields within the same payload.
11. **Cross-surface predicate drift on the buyer side, confirmed live** — three different definitions of "this buyer's outstanding dues" exist across the Buyer App alone: the canonical `invoice_status_has_receivable` (5-status set), the Profile credit widget's `status <> 'draft'`, and the unpaid-invoices sheet's bare `outstanding_balance > 0` with no status check. Live-verified ₹24,500/1-invoice divergence between the canonical figure and the other two, for the same buyer, at the same instant. The credit widget's helper is also reused by the seller Dashboard's `needs_action` callout, so this non-canonical predicate isn't confined to the buyer app — it leaks into a seller-facing surface too. Separately, the Buyer Home's own "Spend this year" tile applies **no status filter at all**, live-confirmed to overcount vs. the canonical `invoice_status_gmv_included` figure for the same buyer by exactly the same one draft/void invoice.
12. **Inconsistent fallback logic within one KPI card** — Buyer Home's credit tile: when the buyer's snapshot row is missing, `available_credit` falls back to the raw `credit_limit` (100% available) while `credit_used` independently falls back to `receivable_amount` — the two numbers no longer sum to the limit, and a buyer with real dues can see "fully available" and "has dues" on the same card.

---

## 6. Recommended fix approach, in priority order

A wrong number under a confident label is worse than no number — it doesn't just cost that one tile, it makes every other number on the page suspect. Fix in order of trust blast-radius, not code complexity:

**P0 — outright wrong, fix this week:**
- Locations "Overdue amount" tile bound to receivable, not overdue. Two valid fixes: point the tile at `overdue_amount` instead (recommended — it then agrees with its own "Collections overdue" callout directly below it), or rename the tile to "Outstanding dues" if receivable is the intended number. Don't leave label and value mismatched.
- Customers "Invoiced sales · MTD" — hardcoded `'MTD'` suffix on a 90-day figure. One-line label fix.
- Orders `open_value` silently rendering ₹0 — RPC doesn't return the field for `p_kind='orders'`; add it rather than let the fallback mask a real number.
- Buyer App: pick one canonical "outstanding dues" predicate (the 5-status `invoice_status_has_receivable` set already used everywhere else) and point the Profile credit widget and the unpaid-invoices sheet at it, replacing their own `status <> 'draft'` / no-status-check variants. Fix the credit-tile fallback so `available_credit`/`credit_used`/`credit_limit` always sum correctly even when the snapshot row is missing.

**P1 — structural, this sprint:**
- After the line-item backfill lands, re-run the §1 basis triangulation. Expect a residual gap (freight/order-level discounts/rounding sit at the invoice header and can't be attributed to any line item) — decide now whether to accept that residual as "Line-item revenue" (explicitly relabeled on Categories/Products/Brand-detail) rather than implying it's the same "Invoiced Sales" figure as Locations/Customers/Invoices/Dashboard.
- Collapse `metrics_tenant_commercial_snapshot`, `metrics_tenant_daily`, `metrics_location_snapshot`, `metrics_buyer_snapshot` into one canonical source for "how much has this tenant/location/buyer invoiced" — every page that needs that number should read the same table, not four independently-refreshed copies of the same computation.
- Standardize period semantics: trailing-90d is already the majority default (7 of 10 seller pages). Make Invoices/Dashboard/Cohorts explicit and consistent rather than silently mixing calendar-MTD in, and put a visible period suffix on every financial KPI card — no bare number without a window indicator anywhere in the app.
- Decide what Brands/Cohorts/Catalogs "GMV" should mean. If the intent is genuinely "demand," keep it order/estimate-sourced but rename away from "GMV"/anything that reads as "sales" (Catalogs already does this correctly — "Campaign-linked demand value" — copy that pattern to Brands and Cohorts). If the intent is "how much has this brand/cohort actually sold," switch the source to invoices, matching Brand *detail*'s own basis so landing and detail pages agree.

**P2 — this month:**
- Fix the period-toolbar-ignored bugs (Orders/Estimates KPI strip, Cohorts hardcoded `last90`).
- Fix stubbed fields: Products' `revenue_growth_pct` (always 100% because `previous_revenue_90d` is hardcoded to 0), Estimates' `expiring_soon` (hardcoded 0, overwritten by a separate live query — collapse to one path).
- Reconcile the "open" status-set inconsistencies within Orders/Estimates KPI payloads.

**Standing recommendation beyond the bug list:** put a visible "as of HH:MM" freshness stamp on every snapshot-backed KPI card. Once the actual bugs above are fixed, the remaining minutes-to-hours of legitimate refresh lag stops looking like a bug and starts reading as expected staleness — that alone prevents a large share of future "why don't these match" reports before they're filed.
