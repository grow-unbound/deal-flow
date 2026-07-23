-- Reconciliation for the campaign SKU/GMV point-in-time attribution fix in
-- app/api/tenant/catalogs/[id]/route.ts (filterLineItemsByMembershipWindow /
-- src/lib/server/campaign-performance.ts).
--
-- This logic lives in TypeScript, not a callable SQL RPC, so there is no snapshot table to
-- diff against. Instead this recomputes campaign-attributed order/estimate-line GMV two ways
-- directly from raw tables and reports where they diverge:
--   old_gmv  -- current-membership-only (app.campaign_items WHERE deleted_at IS NULL), the
--              pre-fix behavior: a line item counts iff its product is in the campaign RIGHT
--              NOW, regardless of when the order was placed.
--   new_gmv  -- point-in-time (matches the TS fix): a line item counts iff its product's
--              app.campaign_items window ([valid_from, deleted_at)) covered the order's
--              placed_at / estimate's created_at.
--
-- Rows where old_gmv != new_gmv are exactly the cases the point-in-time fix changes --
-- campaigns whose product composition has changed since some already-placed orders. Use this
-- to spot-check the fix's effect on real data, not as a pass/fail gate (a MISMATCH here is
-- expected and desired wherever product membership has actually changed over time).
--
-- Run with:
--   npx supabase db query --linked --file scripts/sql/metrics-v2-reconciliation/raw-vs-v2-campaign-sku-attribution.sql
--
-- Read-only: no writes, no schema changes.

WITH eligible_orders AS (
  SELECT o.id, o.tenant_id, o.campaign_id, COALESCE(o.placed_at, o.created_at) AS attributed_at
  FROM app.orders o
  WHERE o.campaign_id IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.status != 'cancelled'
), eligible_estimates AS (
  SELECT e.id, e.tenant_id, e.campaign_id, e.created_at AS attributed_at
  FROM app.estimates e
  WHERE e.campaign_id IS NOT NULL
    AND e.deleted_at IS NULL
    AND e.status NOT IN ('pending', 'void')
    AND e.converted_to_order_id IS NULL
), order_lines AS (
  SELECT
    eo.tenant_id, eo.campaign_id, eo.attributed_at,
    oi.tenant_product_id,
    COALESCE(oi.line_total, oi.qty * oi.unit_price, 0) AS line_amount
  FROM eligible_orders eo
  JOIN app.order_items oi ON oi.order_id = eo.id AND oi.deleted_at IS NULL
), estimate_lines AS (
  SELECT
    ee.tenant_id, ee.campaign_id, ee.attributed_at,
    ei.tenant_product_id,
    COALESCE(ei.line_total, ei.qty * ei.unit_price, 0) AS line_amount
  FROM eligible_estimates ee
  JOIN app.estimate_items ei ON ei.estimate_id = ee.id AND ei.deleted_at IS NULL
), all_lines AS (
  SELECT * FROM order_lines
  UNION ALL
  SELECT * FROM estimate_lines
), campaign_item_windows AS (
  SELECT campaign_id, tenant_product_id, valid_from, deleted_at
  FROM app.campaign_items
), old_gmv AS (
  -- Pre-fix: product must be a CURRENT (deleted_at IS NULL) campaign_items row, regardless of
  -- when the line's order/estimate was attributed.
  SELECT al.tenant_id, al.campaign_id, SUM(al.line_amount) AS old_gmv
  FROM all_lines al
  WHERE EXISTS (
    SELECT 1 FROM campaign_item_windows w
    WHERE w.campaign_id = al.campaign_id
      AND w.tenant_product_id = al.tenant_product_id
      AND w.deleted_at IS NULL
  )
  GROUP BY al.tenant_id, al.campaign_id
), new_gmv AS (
  -- Point-in-time: product's campaign_items window must cover the line's attributed_at.
  SELECT al.tenant_id, al.campaign_id, SUM(al.line_amount) AS new_gmv
  FROM all_lines al
  WHERE EXISTS (
    SELECT 1 FROM campaign_item_windows w
    WHERE w.campaign_id = al.campaign_id
      AND w.tenant_product_id = al.tenant_product_id
      AND w.valid_from <= al.attributed_at
      AND (w.deleted_at IS NULL OR w.deleted_at > al.attributed_at)
  )
  GROUP BY al.tenant_id, al.campaign_id
)
SELECT
  COALESCE(o.tenant_id, n.tenant_id) AS tenant_id,
  COALESCE(o.campaign_id, n.campaign_id) AS campaign_id,
  COALESCE(o.old_gmv, 0) AS old_gmv,
  COALESCE(n.new_gmv, 0) AS new_gmv,
  ROUND(COALESCE(n.new_gmv, 0) - COALESCE(o.old_gmv, 0), 2) AS diff,
  CASE WHEN ABS(COALESCE(n.new_gmv, 0) - COALESCE(o.old_gmv, 0)) <= 0.01 THEN 'UNCHANGED' ELSE 'CHANGED_BY_FIX' END AS verdict
FROM old_gmv o
FULL OUTER JOIN new_gmv n ON n.tenant_id = o.tenant_id AND n.campaign_id = o.campaign_id
ORDER BY (CASE WHEN ABS(COALESCE(n.new_gmv, 0) - COALESCE(o.old_gmv, 0)) > 0.01 THEN 0 ELSE 1 END), ABS(COALESCE(n.new_gmv, 0) - COALESCE(o.old_gmv, 0)) DESC;
