---
paths:
  - "**/*metric*"
  - "**/*kpi*"
  - "**/*snapshot*"
  - "**/*Dashboard*"
  - "specs/metrics-*"
---
# Metrics aggregation standard

- The metric dictionary in `specs/metrics-definitions-2026-07.md` is the source of truth for KPI
  semantics, status inclusion, date grain, location scope, and null/zero behavior.
- KPI cards, page headers, dashboard totals, and table-row aggregate fields must read from
  `app.*_snapshot`, `app.kpi_*_daily`, or a documented aggregate-backed RPC/read model. Do not
  recompute those metrics from the visible page slice, an optimistic row cache, or a route-local
  unbounded relational query.
- Use canonical document dates and IST boundaries for period metrics: orders use `order_date`
  falling back to `created_at`, invoices use `invoice_date` falling back to `created_at`, and
  estimates use `estimate_date` falling back to `created_at`.
- Use shared database status helpers for metric inclusion, especially
  `app.order_status_in_flow`, `app.order_status_is_open`,
  `app.invoice_status_has_receivable`, and `app.invoice_is_overdue`. Do not duplicate status arrays
  in frontend code or API routes.
- Seller-assistant views must preserve location scoping from the aggregate contract. A location KPI
  cannot be silently replaced by a tenant total, and tenant totals cannot be inferred from a
  location-filtered page.
- Bounded relational queries are allowed only for detail previews, recent activity, and drill-down
  rows. If a KPI needs an aggregate that does not exist yet, document the exception in
  `specs/metrics-aggregation-execution-log-2026-07.md` instead of hiding page-slice math in the
  route.
- Optimistic UI may update row state, but aggregate KPI totals must come from a refetch or an
  aggregate response. Do not optimistically replace aggregate totals from the current page rows.
- `app.kpi_product_daily.on_hand` is a current inventory posture copied into daily facts, not a
  historical stock trend, until an inventory movement ledger exists.
- Metrics changes require targeted tests for status edges, canonical date fallbacks, sparse/no-data
  behavior, and multi-line order joins whenever those paths are touched.
