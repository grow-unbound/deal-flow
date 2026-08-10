-- Backfill for 20260807050347_details_v4_now_summaries.sql.
--
-- That migration's new tables/columns are only *written* by the incremental
-- tick (app._metrics_v4_refresh_setup_now runs per-tenant on demand;
-- app._metrics_v4_refresh_claimed_periods only touches whatever entities are
-- in this tick's dirty set). Neither backfills existing tenants/rows on its
-- own -- a tenant with no dirty work since this migration landed has zero
-- rows in the four new now_summary tables, and a buyer/location whose row
-- predates this migration still has 0 in the new columns even though real
-- receivable/overdue/open-demand data exists for it right now.
--
-- One-off, idempotent (safe to re-run): recomputes from live data, not from
-- the tick's incremental state.

-- 1) New now_summary tables (brand/category/warehouse/price_lists) + tenant_now
--    for every tenant, via the same full-recompute function the tick calls.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM app.tenants WHERE deleted_at IS NULL LOOP
    PERFORM app._metrics_v4_refresh_setup_now(r.id);
  END LOOP;
END $$;

-- 2) metrics_buyer_now_summary.receivable_invoice_count / overdue_invoice_count
--    for every existing row, not just buyers touched by a recent tick.
UPDATE app.metrics_buyer_now_summary bns
SET
  receivable_invoice_count = COALESCE(inv.receivable_invoice_count, 0),
  overdue_invoice_count = COALESCE(inv.overdue_invoice_count, 0),
  updated_at = clock_timestamp()
FROM (
  SELECT
    b.id AS buyer_id,
    b.tenant_id,
    COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)) AS receivable_invoice_count,
    COUNT(*) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)) AS overdue_invoice_count
  FROM app.buyers b
  LEFT JOIN app.invoices i
    ON i.tenant_id = b.tenant_id AND i.buyer_id = b.id AND i.deleted_at IS NULL AND i.outstanding_balance > 0
  GROUP BY b.id, b.tenant_id
) inv
WHERE bns.buyer_id = inv.buyer_id
  AND bns.tenant_id = inv.tenant_id
  AND bns.deleted_at IS NULL
  AND (bns.receivable_invoice_count IS DISTINCT FROM COALESCE(inv.receivable_invoice_count, 0)
    OR bns.overdue_invoice_count IS DISTINCT FROM COALESCE(inv.overdue_invoice_count, 0));

-- 3) metrics_location_now_summary's five new columns for every existing row.
UPDATE app.metrics_location_now_summary lns
SET
  overdue_invoice_count = COALESCE(x.overdue_invoice_count, 0),
  receivable_invoice_count = COALESCE(x.receivable_invoice_count, 0),
  overdue_buyer_count = COALESCE(x.overdue_buyer_count, 0),
  receivable_buyer_count = COALESCE(x.receivable_buyer_count, 0),
  open_estimate_value = COALESCE(y.open_estimate_value, 0),
  open_order_value = COALESCE(z.open_order_value, 0),
  updated_at = clock_timestamp()
FROM app.locations l
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)) AS overdue_invoice_count,
    COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)) AS overdue_buyer_count,
    COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)) AS receivable_invoice_count,
    COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)) AS receivable_buyer_count
  FROM app.invoices i
  WHERE i.tenant_id = l.tenant_id AND i.location_id = l.id AND i.deleted_at IS NULL AND i.outstanding_balance > 0
) x ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(e.total_amount), 0) AS open_estimate_value
  FROM app.estimates e
  WHERE e.tenant_id = l.tenant_id AND e.location_id = l.id AND e.deleted_at IS NULL AND app.estimate_status_is_open(e.status)
) y ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(o.total_amount), 0) AS open_order_value
  FROM app.orders o
  WHERE o.tenant_id = l.tenant_id AND o.location_id = l.id AND o.deleted_at IS NULL AND app.order_status_is_open(o.status)
) z ON true
WHERE lns.location_id = l.id
  AND lns.tenant_id = l.tenant_id
  AND lns.deleted_at IS NULL;

-- 4) metrics_brand_period_summary.invoice_units for every existing period row
--    (derived the same way the live tick derives it: SUM over
--    metrics_product_period_summary for that brand/grain/period).
UPDATE app.metrics_brand_period_summary bps
SET invoice_units = agg.units, updated_at = clock_timestamp()
FROM (
  SELECT tp.tenant_brand_id, ps.grain, ps.period_start, SUM(ps.invoice_units) AS units
  FROM app.metrics_product_period_summary ps
  JOIN app.tenant_products tp ON tp.id = ps.tenant_product_id AND tp.tenant_brand_id IS NOT NULL
  WHERE ps.deleted_at IS NULL AND ps.invoice_count > 0
  GROUP BY tp.tenant_brand_id, ps.grain, ps.period_start
) agg
WHERE bps.tenant_brand_id = agg.tenant_brand_id
  AND bps.grain = agg.grain
  AND bps.period_start = agg.period_start
  AND bps.deleted_at IS NULL
  AND bps.invoice_units IS DISTINCT FROM agg.units;
