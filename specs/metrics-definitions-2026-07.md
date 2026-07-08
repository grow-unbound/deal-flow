# Metrics Definitions

Date: 2026-07-07
Status: Golden source for metrics aggregation implementation
Related plan: [metrics-aggregation-standardization-plan-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-aggregation-standardization-plan-2026-07.md)
Execution log: [metrics-aggregation-execution-log-2026-07.md](/Users/phanikrovvidi/projects/deal-flow/specs/metrics-aggregation-execution-log-2026-07.md)

## Global Rules

- Tenant-facing period metrics use `Asia/Kolkata` day boundaries.
- Seller admins see tenant-wide KPIs, callouts, lists, and entities.
- Seller assistants see only assigned-location-scoped KPIs, callouts, lists, and entities.
- Seller assistants do not get access to the campaigns page or any GROW-navbar surface.
- Seller landing-page filters, search, sort, cursor, and page size affect table rows only. They never affect KPI cards or callouts.
- Detail-page header KPIs are entity-scoped, not table-slice-scoped.
- Table row metrics are period-scoped for the selected period.



## Document Dates

- Estimates use `app.estimates.estimate_date`; fallback: `app.estimates.created_at`.
- Orders use `app.orders.order_date`; fallback: `app.orders.created_at`.
- Invoices use `app.invoices.invoice_date`; fallback: `app.invoices.created_at`.
- Create and conversion flows must populate these date fields in addition to any legacy timestamp fields still needed for compatibility.



## Document Statuses



### Estimates

- Flow statuses: `draft`, `sent`, `converted`, `void`, `expired`.
- Total estimates and estimate GMV include all estimates unless a page explicitly asks for a downstream-quality metric.
- Open estimates include `draft` and `sent`.
- Converted, void, and expired estimates should be stored in KPI facts but are not exposed in standard KPI cards unless a page explicitly asks for them.



### Orders

- Total orders and order GMV include all orders unless a page explicitly asks for a downstream-quality metric.
- Open orders include `draft` and all non-terminal operational statuses.
- Cancelled, archived, and rejected orders should be stored in KPI facts but are not exposed in standard KPI cards unless a page explicitly asks for them.
- Confirmed/converted/invoiced/paid-style metrics are separate downstream-quality metrics and must not silently replace total flow metrics.



### Invoices

- Invoice status taxonomy still needs final product confirmation before implementation.
- Invoice GMV should follow standard receivables/accounting practice and include sent/issued, partially-paid, paid, and overdue invoices.
- Draft invoices count toward total flow metrics where the product intent is business flow and buyer engagement.
- Cancelled, archived, rejected, and void invoices should be stored in KPI facts but are not exposed in standard KPI cards unless a page explicitly asks for them.



## Core Metrics



### GMV

- `estimates_gmv`: total estimate value for estimates in the selected period.
- `orders_gmv`: total order value for orders in the selected period.
- `invoices_gmv`: total invoice value for sent/issued, partially-paid, paid, and overdue invoices in the selected period, subject to final invoice status taxonomy.
- Avoid using one generic GMV definition when the page is specifically about estimates, orders, or invoices.



### Document Counts

- `estimates_count`: count of estimates in the selected period using estimate status rules.
- `orders_count`: count of orders in the selected period using order status rules.
- `invoices_count`: count of invoices in the selected period using invoice status rules.
- Count metrics should expose status buckets in facts/snapshots even if only total/open counts are shown in the UI.



### AOV

- `estimate_aov = estimates_gmv / estimates_count`.
- `order_aov = orders_gmv / orders_count`.
- `invoice_aov = invoices_gmv / invoices_count`.
- Numerator and denominator must use the same date window, status set, role scope, and grain.



### Active Buyers

- Seller context: buyers with at least one estimate, order, or invoice in the selected period.
- Buyer-app context: buyers where `buyers.is_buyer_app_enabled = true` and at least one tracked event in the selected period.



### Open Documents

- Open estimates include `draft` and `sent`.
- Open orders include `draft` and all non-terminal operational statuses.
- Open invoices need final invoice status confirmation; expected basis is invoices with unpaid receivable exposure.



### Outstanding Dues

- Outstanding dues come from receivables on sent/issued and partially-paid invoices only.
- Use invoice outstanding amount/balance fields, not total invoice amount, once partial payment exists.



### Overdue Amount And Count

- Overdue amount is outstanding invoice amount where `due_date` is before the evaluation date.
- Overdue count is the count of invoices with positive outstanding amount past `due_date`.



### Buyer App Usage

- `opened_app_mtd`: buyer successfully logged in or used an existing session to access the buyer app, represented by at least one tracked app event or buyer-app API GET/POST.
- `repeat_users_mtd`: buyer has at least two qualifying buyer-app events in the selected period.
- `at_least_one_order_mtd`: buyer created at least one buyer-app estimate or order in the selected period.



### Campaign Funnel

- `notified`: message sent.
- `delivered`: WhatsApp webhook confirms delivery.
- `viewed`: buyer opened the campaign in the app, including campaign/list access.
- `ordered`: at least one estimate or order contains at least one campaign SKU.
- Campaign conversion should track order count, estimate count, unique buyers, and attributed GMV.



### Days Cover

- Days cover can be computed from invoice-based SKU velocity because invoices represent final stock clearance.
- Formula: `days_cover = current_stock / recent_invoice_velocity`.
- Support both location-level and aggregate tenant/product-level views if data quality and query cost are acceptable.
- If invoice velocity is zero or unavailable, return null or an explicit "insufficient velocity" state rather than inventing a number.

