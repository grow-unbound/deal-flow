-- Phase 2 of the v2 metrics sunset, part A: schema additions to v4 tables
-- discovered missing during the search_seller_location_landing_ids /
-- search_buyer_app_access_v2 rewire audit, per owner instruction:
--   "if you are updating any of the v4 tables/functions - ensure that the
--   counts of invoices are also captured for receivable_amount and
--   overdue_amount. They were missed out in the previous iterations"
--
-- metrics_buyer_now_summary already carries receivable_amount +
-- receivable_invoice_count (verified). metrics_location_now_summary was
-- missing the receivable_amount VALUE -- it only had
-- receivable_invoice_count (a count, no amount). Adding it now.
--
-- Also adding metrics_buyer_now_summary.last_buyer_app_activity_at -- a
-- point-in-time fact (not a period aggregate), needed by the
-- search_buyer_app_access_v2 rewire (next migration) for its 30d/90d/
-- dormant "last ordered" filter and inactive-buyer flag, replacing the
-- old metrics_buyer_snapshot.last_buyer_app_activity_at that's going away
-- with the v2 table drop.

ALTER TABLE app.metrics_location_now_summary
  ADD COLUMN IF NOT EXISTS receivable_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE app.metrics_buyer_now_summary
  ADD COLUMN IF NOT EXISTS last_buyer_app_activity_at timestamptz;

-- Wire both into the existing v4 refresh-tick writer,
-- _metrics_v4_refresh_claimed_periods -- NOT touching the tick's
-- orchestration/fencing/loop, only extending the two INSERT ... ON
-- CONFLICT statements it already runs for these two tables. Done via a
-- server-side text substitution against the live function definition
-- (rather than hand-transcribing a 59KB function body into this file) --
-- each substitution is guarded to fail loudly if the expected substring
-- isn't found exactly once, so this migration cannot silently no-op.
DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc
  WHERE proname = '_metrics_v4_refresh_claimed_periods' AND pronamespace = 'app'::regnamespace;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'phase2: _metrics_v4_refresh_claimed_periods not found';
  END IF;

  v_new := v_def;

  -- 1) location INSERT column list: add receivable_amount
  IF (SELECT count(*) FROM regexp_matches(v_new,
        E'    receivable_invoice_count, receivable_buyer_count,\\n    source_watermark, computed_at, updated_at, deleted_at\\n  \\)\\n  SELECT', 'g')) <> 1 THEN
    RAISE EXCEPTION 'phase2: location INSERT column-list anchor not found exactly once';
  END IF;
  v_new := replace(v_new,
    E'    receivable_invoice_count, receivable_buyer_count,\n    source_watermark, computed_at, updated_at, deleted_at\n  )\n  SELECT',
    E'    receivable_amount, receivable_invoice_count, receivable_buyer_count,\n    source_watermark, computed_at, updated_at, deleted_at\n  )\n  SELECT');

  -- 2) location SELECT value list: add COALESCE(inv.receivable_amount, 0)
  IF (SELECT count(*) FROM regexp_matches(v_new,
        E'    COALESCE\\(inv\\.receivable_invoice_count, 0\\),\\n    COALESCE\\(inv\\.receivable_buyer_count, 0\\),', 'g')) <> 1 THEN
    RAISE EXCEPTION 'phase2: location SELECT value-list anchor not found exactly once';
  END IF;
  v_new := replace(v_new,
    E'    COALESCE(inv.receivable_invoice_count, 0),\n    COALESCE(inv.receivable_buyer_count, 0),',
    E'    COALESCE(inv.receivable_amount, 0),\n    COALESCE(inv.receivable_invoice_count, 0),\n    COALESCE(inv.receivable_buyer_count, 0),');

  -- 3) location "inv" lateral: compute receivable_amount
  IF (SELECT count(*) FROM regexp_matches(v_new,
        E'AS overdue_buyer_count,\\n      COUNT\\(\\*\\) FILTER \\(WHERE app\\.invoice_status_has_receivable\\(i\\.status, i\\.outstanding_balance\\)\\)::bigint AS receivable_invoice_count,', 'g')) <> 1 THEN
    RAISE EXCEPTION 'phase2: location inv-lateral anchor not found exactly once';
  END IF;
  v_new := replace(v_new,
    E'AS overdue_buyer_count,\n      COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance))::bigint AS receivable_invoice_count,',
    E'AS overdue_buyer_count,\n      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)), 0)::numeric AS receivable_amount,\n      COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance))::bigint AS receivable_invoice_count,');

  -- 4) location ON CONFLICT DO UPDATE SET: add receivable_amount
  IF (SELECT count(*) FROM regexp_matches(v_new,
        E'overdue_buyer_count = EXCLUDED\\.overdue_buyer_count,\\n    receivable_invoice_count = EXCLUDED\\.receivable_invoice_count,', 'g')) <> 1 THEN
    RAISE EXCEPTION 'phase2: location ON CONFLICT anchor not found exactly once';
  END IF;
  v_new := replace(v_new,
    E'overdue_buyer_count = EXCLUDED.overdue_buyer_count,\n    receivable_invoice_count = EXCLUDED.receivable_invoice_count,',
    E'overdue_buyer_count = EXCLUDED.overdue_buyer_count,\n    receivable_amount = EXCLUDED.receivable_amount,\n    receivable_invoice_count = EXCLUDED.receivable_invoice_count,');

  -- 5) buyer INSERT column list: add last_buyer_app_activity_at
  IF (SELECT count(*) FROM regexp_matches(v_new,
        E'    last_invoice_date,\\n    source_watermark, computed_at, updated_at, deleted_at\\n  \\)\\n  SELECT\\n    p_tenant_id,\\n    b\\.id,\\n    concat_ws\\(''\:'', p_tenant_id::text, b\\.id::text, ''buyer-now''\\),', 'g')) <> 1 THEN
    RAISE EXCEPTION 'phase2: buyer INSERT column-list anchor not found exactly once';
  END IF;
  v_new := replace(v_new,
    E'    last_invoice_date,\n    source_watermark, computed_at, updated_at, deleted_at\n  )\n  SELECT\n    p_tenant_id,\n    b.id,\n    concat_ws(\':\', p_tenant_id::text, b.id::text, \'buyer-now\'),',
    E'    last_invoice_date,\n    last_buyer_app_activity_at,\n    source_watermark, computed_at, updated_at, deleted_at\n  )\n  SELECT\n    p_tenant_id,\n    b.id,\n    concat_ws(\':\', p_tenant_id::text, b.id::text, \'buyer-now\'),');

  -- 6) buyer SELECT value list: add app_act.last_buyer_app_activity_at
  IF (SELECT count(*) FROM regexp_matches(v_new,
        E'    li\\.last_invoice_date,\\n    GREATEST\\(b\\.updated_at, inv\\.watermark\\),', 'g')) <> 1 THEN
    RAISE EXCEPTION 'phase2: buyer SELECT value-list anchor not found exactly once';
  END IF;
  v_new := replace(v_new,
    E'    li.last_invoice_date,\n    GREATEST(b.updated_at, inv.watermark),',
    E'    li.last_invoice_date,\n    app_act.last_buyer_app_activity_at,\n    GREATEST(b.updated_at, inv.watermark),');

  -- 7) buyer FROM clause: add app_act lateral after the li lateral
  IF (SELECT count(*) FROM regexp_matches(v_new,
        E'\\) li ON true\\n  ON CONFLICT \\(tenant_id, buyer_id\\) WHERE deleted_at IS NULL DO UPDATE SET', 'g')) <> 1 THEN
    RAISE EXCEPTION 'phase2: buyer li-lateral anchor not found exactly once';
  END IF;
  v_new := replace(v_new,
    E') li ON true\n  ON CONFLICT (tenant_id, buyer_id) WHERE deleted_at IS NULL DO UPDATE SET',
    E') li ON true\n  LEFT JOIN LATERAL (\n    SELECT GREATEST(\n      (SELECT MAX(i3.invoice_date::timestamptz) FROM app.invoices i3 WHERE i3.tenant_id = p_tenant_id AND i3.buyer_id = b.id AND i3.deleted_at IS NULL AND i3.is_buyer_app_invoice),\n      (SELECT MAX(o3.placed_at) FROM app.orders o3 WHERE o3.tenant_id = p_tenant_id AND o3.buyer_id = b.id AND o3.deleted_at IS NULL AND o3.is_buyer_app_order)\n    ) AS last_buyer_app_activity_at\n  ) app_act ON true\n  ON CONFLICT (tenant_id, buyer_id) WHERE deleted_at IS NULL DO UPDATE SET');

  -- 8) buyer ON CONFLICT DO UPDATE SET: add last_buyer_app_activity_at
  IF (SELECT count(*) FROM regexp_matches(v_new,
        E'last_invoice_date = EXCLUDED\\.last_invoice_date,\\n    credit_available = EXCLUDED\\.credit_available,', 'g')) <> 1 THEN
    RAISE EXCEPTION 'phase2: buyer ON CONFLICT anchor not found exactly once';
  END IF;
  v_new := replace(v_new,
    E'last_invoice_date = EXCLUDED.last_invoice_date,\n    credit_available = EXCLUDED.credit_available,',
    E'last_invoice_date = EXCLUDED.last_invoice_date,\n    last_buyer_app_activity_at = EXCLUDED.last_buyer_app_activity_at,\n    credit_available = EXCLUDED.credit_available,');

  IF v_new = v_def THEN
    RAISE EXCEPTION 'phase2: no substitutions applied, aborting';
  END IF;

  EXECUTE v_new;
END $$;

-- Backfill both new columns for existing rows so the frontend never sees
-- a partially-populated v4 table -- same computation the writer above now
-- runs, executed once as a plain set-based UPDATE (not via the tick/lease
-- machinery -- this is a one-time backfill, not a refresh-tick change).
UPDATE app.metrics_location_now_summary mln
SET receivable_amount = COALESCE(sub.amt, 0)
FROM (
  SELECT i.tenant_id, i.location_id,
    SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)) AS amt
  FROM app.invoices i
  WHERE i.deleted_at IS NULL AND i.outstanding_balance > 0
  GROUP BY i.tenant_id, i.location_id
) sub
WHERE sub.tenant_id = mln.tenant_id
  AND sub.location_id = mln.location_id
  AND mln.deleted_at IS NULL;

UPDATE app.metrics_buyer_now_summary mbn
SET last_buyer_app_activity_at = GREATEST(sub.inv_max, sub.ord_max)
FROM (
  SELECT
    b.tenant_id,
    b.id AS buyer_id,
    (SELECT MAX(i.invoice_date::timestamptz) FROM app.invoices i
     WHERE i.tenant_id = b.tenant_id AND i.buyer_id = b.id AND i.deleted_at IS NULL AND i.is_buyer_app_invoice) AS inv_max,
    (SELECT MAX(o.placed_at) FROM app.orders o
     WHERE o.tenant_id = b.tenant_id AND o.buyer_id = b.id AND o.deleted_at IS NULL AND o.is_buyer_app_order) AS ord_max
  FROM app.buyers b
  WHERE b.deleted_at IS NULL
) sub
WHERE sub.tenant_id = mbn.tenant_id
  AND sub.buyer_id = mbn.buyer_id
  AND mbn.deleted_at IS NULL
  AND (sub.inv_max IS NOT NULL OR sub.ord_max IS NOT NULL);
