-- Metrics V4 reconciliation: NOW summaries for tenant, buyer, and location posture.

WITH raw_buyer AS (
  SELECT
    b.tenant_id,
    b.id AS buyer_id,
    COALESCE(b.credit_limit, 0)::numeric AS credit_limit,
    COALESCE(inv.receivable_amount, 0)::numeric AS receivable_amount,
    COALESCE(inv.overdue_amount, 0)::numeric AS overdue_amount,
    COALESCE(b.credit_limit, 0)::numeric - COALESCE(inv.receivable_amount, 0)::numeric AS credit_available
  FROM app.buyers b
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)), 0)::numeric AS receivable_amount,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)), 0)::numeric AS overdue_amount
    FROM app.invoices i
    WHERE i.tenant_id = b.tenant_id
      AND i.buyer_id = b.id
      AND i.deleted_at IS NULL
  ) inv ON true
  WHERE b.deleted_at IS NULL
), buyer_diff AS (
  SELECT
    'buyer_now'::text AS section,
    r.tenant_id,
    r.buyer_id AS entity_id,
    r.credit_limit AS raw_value_1,
    COALESCE(s.credit_limit, 0) AS snap_value_1,
    r.receivable_amount AS raw_value_2,
    COALESCE(s.receivable_amount, 0) AS snap_value_2,
    r.overdue_amount AS raw_value_3,
    COALESCE(s.overdue_amount, 0) AS snap_value_3
  FROM raw_buyer r
  LEFT JOIN app.metrics_buyer_now_summary s
    ON s.tenant_id = r.tenant_id
   AND s.buyer_id = r.buyer_id
   AND s.deleted_at IS NULL
  WHERE abs(r.credit_limit - COALESCE(s.credit_limit, 0)) > 0.01
     OR abs(r.receivable_amount - COALESCE(s.receivable_amount, 0)) > 0.01
     OR abs(r.overdue_amount - COALESCE(s.overdue_amount, 0)) > 0.01
     OR abs(r.credit_available - COALESCE(s.credit_available, 0)) > 0.01
), raw_location AS (
  SELECT
    l.tenant_id,
    l.id AS location_id,
    COALESCE(est.open_estimate_count, 0)::bigint AS open_estimate_count,
    COALESCE(ord.open_order_count, 0)::bigint AS open_order_count,
    COALESCE(inv.overdue_amount, 0)::numeric AS overdue_amount
  FROM app.locations l
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status))::bigint AS open_estimate_count
    FROM app.estimates e
    WHERE e.tenant_id = l.tenant_id AND e.location_id = l.id AND e.deleted_at IS NULL
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.order_status_is_open(o.status))::bigint AS open_order_count
    FROM app.orders o
    WHERE o.tenant_id = l.tenant_id AND o.location_id = l.id AND o.deleted_at IS NULL
  ) ord ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)), 0)::numeric AS overdue_amount
    FROM app.invoices i
    WHERE i.tenant_id = l.tenant_id AND i.location_id = l.id AND i.deleted_at IS NULL
  ) inv ON true
  WHERE l.deleted_at IS NULL
), location_diff AS (
  SELECT
    'location_now'::text AS section,
    r.tenant_id,
    r.location_id AS entity_id,
    r.open_estimate_count::numeric AS raw_value_1,
    COALESCE(s.open_estimate_count, 0)::numeric AS snap_value_1,
    r.open_order_count::numeric AS raw_value_2,
    COALESCE(s.open_order_count, 0)::numeric AS snap_value_2,
    r.overdue_amount AS raw_value_3,
    COALESCE(s.overdue_amount, 0) AS snap_value_3
  FROM raw_location r
  LEFT JOIN app.metrics_location_now_summary s
    ON s.tenant_id = r.tenant_id
   AND s.location_id = r.location_id
   AND s.deleted_at IS NULL
  WHERE r.open_estimate_count <> COALESCE(s.open_estimate_count, 0)
     OR r.open_order_count <> COALESCE(s.open_order_count, 0)
     OR abs(r.overdue_amount - COALESCE(s.overdue_amount, 0)) > 0.01
), raw_tenant AS (
  SELECT
    t.id AS tenant_id,
    COALESCE(SUM(b.receivable_amount), 0)::numeric AS receivable_amount,
    COUNT(*) FILTER (WHERE b.receivable_amount > 0)::bigint AS receivable_buyer_count,
    COALESCE(SUM(b.overdue_amount), 0)::numeric AS overdue_amount,
    COUNT(*) FILTER (WHERE b.overdue_amount > 0)::bigint AS overdue_buyer_count
  FROM app.tenants t
  LEFT JOIN raw_buyer b ON b.tenant_id = t.id
  WHERE t.deleted_at IS NULL
  GROUP BY t.id
), tenant_diff AS (
  SELECT
    'tenant_now'::text AS section,
    r.tenant_id,
    r.tenant_id AS entity_id,
    r.receivable_amount AS raw_value_1,
    COALESCE(s.receivable_amount, 0) AS snap_value_1,
    r.overdue_amount AS raw_value_2,
    COALESCE(s.overdue_amount, 0) AS snap_value_2,
    r.receivable_buyer_count::numeric AS raw_value_3,
    COALESCE(s.receivable_buyer_count, 0)::numeric AS snap_value_3
  FROM raw_tenant r
  LEFT JOIN app.metrics_tenant_now_summary s
    ON s.tenant_id = r.tenant_id
   AND s.deleted_at IS NULL
  WHERE abs(r.receivable_amount - COALESCE(s.receivable_amount, 0)) > 0.01
     OR abs(r.overdue_amount - COALESCE(s.overdue_amount, 0)) > 0.01
     OR r.receivable_buyer_count <> COALESCE(s.receivable_buyer_count, 0)
     OR r.overdue_buyer_count <> COALESCE(s.overdue_buyer_count, 0)
)
SELECT * FROM buyer_diff
UNION ALL
SELECT * FROM location_diff
UNION ALL
SELECT * FROM tenant_diff
ORDER BY section, tenant_id, entity_id;
