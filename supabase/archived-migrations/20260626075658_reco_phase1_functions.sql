-- Phase 1 Recommendation Engine: Batch compute functions + pg_cron wrappers
--
-- Signal weighting strategy:
--   invoice_items × 2.0 — true conversion (billed/delivered)
--   order_items   × 1.0 — confirmed intent
--   estimate_items × 0.5 — demand signal, ONLY if estimate was NOT subsequently invoiced
--     (de-dup: invoices.estimate_id FK identifies converted estimates)
--
-- All functions run per-tenant; pg_cron wrappers iterate active tenants.

-- ── app.reco_compute_popularity ───────────────────────────────────────────────
-- Writes to reco_product_popularity. Run daily at 3am.
CREATE OR REPLACE FUNCTION app.reco_compute_popularity(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  window_90d           timestamptz := NOW() - INTERVAL '90 days';
  window_30d           timestamptz := NOW() - INTERVAL '30 days';
  window_7d            timestamptz := NOW() - INTERVAL '7 days';
  invoiced_estimate_ids uuid[];
BEGIN
  -- Collect estimate_ids already converted to an invoice (exclude from estimate signal)
  SELECT ARRAY(
    SELECT DISTINCT estimate_id
    FROM app.invoices
    WHERE tenant_id = p_tenant_id
      AND estimate_id IS NOT NULL
      AND deleted_at IS NULL
  ) INTO invoiced_estimate_ids;

  WITH
  -- Signal A: invoices (weight 2.0)
  invoice_signal AS (
    SELECT
      ii.tenant_product_id,
      inv.buyer_id,
      COUNT(DISTINCT CASE WHEN inv.invoice_date >= window_30d THEN inv.id END) AS cnt_30d,
      COALESCE(SUM(CASE WHEN inv.invoice_date >= window_30d THEN ii.line_total ELSE 0 END), 0) AS rev_30d
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id
      AND inv.deleted_at IS NULL
      AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_90d
    GROUP BY ii.tenant_product_id, inv.buyer_id
  ),
  -- Signal B: orders (weight 1.0)
  order_signal AS (
    SELECT
      oi.tenant_product_id,
      o.buyer_id,
      COUNT(DISTINCT CASE WHEN o.placed_at >= window_7d  THEN o.id END) AS cnt_7d,
      COUNT(DISTINCT CASE WHEN o.placed_at >= window_30d THEN o.id END) AS cnt_30d,
      COUNT(DISTINCT CASE WHEN o.placed_at >= window_90d THEN o.id END) AS cnt_90d
    FROM app.order_items oi
    JOIN app.orders o ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND oi.deleted_at IS NULL
      AND o.placed_at >= window_90d
    GROUP BY oi.tenant_product_id, o.buyer_id
  ),
  -- Signal C: estimates NOT converted to invoice (weight 0.5)
  estimate_signal AS (
    SELECT
      ei.tenant_product_id,
      e.buyer_id,
      COUNT(DISTINCT CASE WHEN e.created_at >= window_30d THEN e.id END) AS cnt_30d
    FROM app.estimate_items ei
    JOIN app.estimates e ON e.id = ei.estimate_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND ei.deleted_at IS NULL
      AND e.created_at >= window_90d
      AND (
        invoiced_estimate_ids IS NULL
        OR array_length(invoiced_estimate_ids, 1) IS NULL
        OR e.id <> ALL(invoiced_estimate_ids)
      )
    GROUP BY ei.tenant_product_id, e.buyer_id
  ),
  -- Aggregate per product across all signals
  product_agg AS (
    SELECT
      tp.id                                                           AS tenant_product_id,
      tp.tenant_category_id,
      COALESCE(SUM(inv.cnt_30d), 0)::int                             AS invoice_count_30d,
      COALESCE(SUM(ord.cnt_30d), 0)::int                             AS order_count_30d,
      COALESCE(SUM(est.cnt_30d), 0)::int                             AS estimate_count_30d,
      COALESCE(SUM(inv.cnt_30d * 2.0), 0)
        + COALESCE(SUM(ord.cnt_30d * 1.0), 0)
        + COALESCE(SUM(est.cnt_30d * 0.5), 0)                        AS weighted_score_30d,
      COALESCE(SUM(ord.cnt_7d), 0)::int                              AS order_count_7d,
      COALESCE(SUM(ord.cnt_90d), 0)::int                             AS order_count_90d,
      COALESCE(SUM(inv.rev_30d), 0)                                  AS revenue_30d,
      COUNT(DISTINCT COALESCE(inv.buyer_id, ord.buyer_id, est.buyer_id)) AS unique_buyer_count_30d
    FROM app.tenant_products tp
    LEFT JOIN invoice_signal  inv ON inv.tenant_product_id = tp.id
    LEFT JOIN order_signal    ord ON ord.tenant_product_id = tp.id
    LEFT JOIN estimate_signal est ON est.tenant_product_id = tp.id
    WHERE tp.tenant_id = p_tenant_id
      AND (
        COALESCE(inv.cnt_30d, 0) > 0
        OR COALESCE(ord.cnt_30d, 0) > 0
        OR COALESCE(est.cnt_30d, 0) > 0
      )
    GROUP BY tp.id, tp.tenant_category_id
  ),
  -- Apply category rank by weighted_score_30d within each category
  ranked AS (
    SELECT *,
      RANK() OVER (
        PARTITION BY tenant_category_id
        ORDER BY weighted_score_30d DESC
      )::int AS category_rank_30d
    FROM product_agg
  )
  INSERT INTO app.reco_product_popularity (
    tenant_id, tenant_product_id,
    invoice_count_30d, order_count_30d, estimate_count_30d,
    weighted_score_30d,
    order_count_7d, order_count_90d,
    revenue_30d, unique_buyer_count_30d,
    category_rank_30d, computed_at
  )
  SELECT
    p_tenant_id, tenant_product_id,
    invoice_count_30d, order_count_30d, estimate_count_30d,
    weighted_score_30d,
    order_count_7d, order_count_90d,
    revenue_30d, unique_buyer_count_30d,
    category_rank_30d, NOW()
  FROM ranked
  ON CONFLICT (tenant_id, tenant_product_id) DO UPDATE SET
    invoice_count_30d      = EXCLUDED.invoice_count_30d,
    order_count_30d        = EXCLUDED.order_count_30d,
    estimate_count_30d     = EXCLUDED.estimate_count_30d,
    weighted_score_30d     = EXCLUDED.weighted_score_30d,
    order_count_7d         = EXCLUDED.order_count_7d,
    order_count_90d        = EXCLUDED.order_count_90d,
    revenue_30d            = EXCLUDED.revenue_30d,
    unique_buyer_count_30d = EXCLUDED.unique_buyer_count_30d,
    category_rank_30d      = EXCLUDED.category_rank_30d,
    computed_at            = NOW();
END;
$$;

-- ── app.reco_compute_associations ─────────────────────────────────────────────
-- Writes to reco_product_associations. Run weekly (Sunday 2am).
-- Uses a unified purchase events CTE pooling invoices (×2), orders (×1), estimates-not-invoiced (×1 event).
-- Invoice events are duplicated (inv: and inv2: prefixes) to give them 2× co-occurrence weight.
CREATE OR REPLACE FUNCTION app.reco_compute_associations(p_tenant_id uuid, p_window_days int DEFAULT 90)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  min_support   int;
  window_start  timestamptz := NOW() - (p_window_days || ' days')::interval;
  invoiced_ids  uuid[];
  total_events  bigint;
BEGIN
  SELECT COALESCE((settings->>'reco_min_support')::int, 3)
  INTO min_support
  FROM app.tenants WHERE id = p_tenant_id;

  SELECT ARRAY(
    SELECT DISTINCT estimate_id
    FROM app.invoices
    WHERE tenant_id = p_tenant_id AND estimate_id IS NOT NULL AND deleted_at IS NULL
  ) INTO invoiced_ids;

  -- Clear stale rows for this window before recomputing
  DELETE FROM app.reco_product_associations
  WHERE tenant_id = p_tenant_id AND time_window_days = p_window_days;

  -- Unified purchase events:
  --   inv:  / inv2: = invoice repeated twice for weight=2
  --   ord:  = order, weight=1
  --   est:  = estimate (not invoiced), weight=1 (min_support threshold compensates for lower quality)
  WITH purchase_events AS (
    -- Invoice copy 1
    SELECT ('inv:' || inv.id::text) AS event_id, inv.buyer_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    -- Invoice copy 2 (doubles weight for co-occurrence counting)
    SELECT ('inv2:' || inv.id::text) AS event_id, inv.buyer_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    -- Orders
    SELECT ('ord:' || o.id::text) AS event_id, o.buyer_id, oi.tenant_product_id
    FROM app.order_items oi
    JOIN app.orders o ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
      AND o.placed_at >= window_start
    UNION ALL
    -- Estimates NOT converted to invoice
    SELECT ('est:' || e.id::text) AS event_id, e.buyer_id, ei.tenant_product_id
    FROM app.estimate_items ei
    JOIN app.estimates e ON e.id = ei.estimate_id
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND ei.deleted_at IS NULL
      AND e.created_at >= window_start
      AND (
        invoiced_ids IS NULL
        OR array_length(invoiced_ids, 1) IS NULL
        OR e.id <> ALL(invoiced_ids)
      )
  ),
  event_totals AS (
    SELECT COUNT(DISTINCT event_id) AS total_cnt FROM purchase_events
  ),
  -- co_order: products appearing in the same event
  co_event_pairs AS (
    SELECT
      pe1.tenant_product_id AS product_a,
      pe2.tenant_product_id AS product_b,
      COUNT(DISTINCT pe1.event_id) AS co_count
    FROM purchase_events pe1
    JOIN purchase_events pe2
      ON pe1.event_id = pe2.event_id
      AND pe1.tenant_product_id < pe2.tenant_product_id
    GROUP BY pe1.tenant_product_id, pe2.tenant_product_id
    HAVING COUNT(DISTINCT pe1.event_id) >= min_support
  ),
  product_event_counts AS (
    SELECT tenant_product_id, COUNT(DISTINCT event_id) AS event_count
    FROM purchase_events
    GROUP BY tenant_product_id
  )
  INSERT INTO app.reco_product_associations
    (tenant_id, product_a_id, product_b_id, association_type,
     co_occurrence_count, lift_score, confidence, time_window_days)
  -- A → B
  SELECT
    p_tenant_id, p.product_a, p.product_b, 'co_order',
    p.co_count,
    (p.co_count::numeric / NULLIF(t.total_cnt, 0)) /
      NULLIF(
        (pa.event_count::numeric / NULLIF(t.total_cnt, 0)) *
        (pb.event_count::numeric / NULLIF(t.total_cnt, 0)),
        0
      ),
    p.co_count::numeric / NULLIF(pa.event_count, 0),
    p_window_days
  FROM co_event_pairs p
  CROSS JOIN event_totals t
  JOIN product_event_counts pa ON pa.tenant_product_id = p.product_a
  JOIN product_event_counts pb ON pb.tenant_product_id = p.product_b
  UNION ALL
  -- B → A (mirror)
  SELECT
    p_tenant_id, p.product_b, p.product_a, 'co_order',
    p.co_count,
    (p.co_count::numeric / NULLIF(t.total_cnt, 0)) /
      NULLIF(
        (pb.event_count::numeric / NULLIF(t.total_cnt, 0)) *
        (pa.event_count::numeric / NULLIF(t.total_cnt, 0)),
        0
      ),
    p.co_count::numeric / NULLIF(pb.event_count, 0),
    p_window_days
  FROM co_event_pairs p
  CROSS JOIN event_totals t
  JOIN product_event_counts pa ON pa.tenant_product_id = p.product_a
  JOIN product_event_counts pb ON pb.tenant_product_id = p.product_b;

  -- co_buyer: same buyer purchased A and B across different events (invoices + orders only)
  WITH buyer_products AS (
    SELECT DISTINCT buyer_id, tenant_product_id FROM (
      SELECT inv.buyer_id, ii.tenant_product_id
      FROM app.invoice_items ii
      JOIN app.invoices inv ON inv.id = ii.invoice_id
      WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
        AND inv.invoice_date >= window_start
      UNION
      SELECT o.buyer_id, oi.tenant_product_id
      FROM app.order_items oi
      JOIN app.orders o ON o.id = oi.order_id
      WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
        AND o.placed_at >= window_start
    ) src
  ),
  buyer_pairs AS (
    SELECT
      bp1.tenant_product_id AS product_a,
      bp2.tenant_product_id AS product_b,
      COUNT(DISTINCT bp1.buyer_id) AS co_count
    FROM buyer_products bp1
    JOIN buyer_products bp2
      ON bp1.buyer_id = bp2.buyer_id
      AND bp1.tenant_product_id < bp2.tenant_product_id
    GROUP BY bp1.tenant_product_id, bp2.tenant_product_id
    HAVING COUNT(DISTINCT bp1.buyer_id) >= min_support
  )
  INSERT INTO app.reco_product_associations
    (tenant_id, product_a_id, product_b_id, association_type, co_occurrence_count, time_window_days)
  SELECT p_tenant_id, product_a, product_b, 'co_buyer', co_count, p_window_days FROM buyer_pairs
  UNION ALL
  SELECT p_tenant_id, product_b, product_a, 'co_buyer', co_count, p_window_days FROM buyer_pairs;
END;
$$;

-- ── app.reco_refresh_buyer_profiles ───────────────────────────────────────────
-- Writes to reco_buyer_profiles. Run weekly (Monday 3am).
-- Uses invoices (×2) + orders (×1) for ranking. Estimates excluded — a quote that didn't
-- convert is not a "Buy Again" candidate.
CREATE OR REPLACE FUNCTION app.reco_refresh_buyer_profiles(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT DISTINCT buyer_id FROM (
      SELECT buyer_id FROM app.invoices
      WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
        AND invoice_date >= NOW() - INTERVAL '12 months'
      UNION
      SELECT buyer_id FROM app.orders
      WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
        AND placed_at >= NOW() - INTERVAL '12 months'
    ) buyers
  ) LOOP
    INSERT INTO app.reco_buyer_profiles (tenant_id, buyer_id, top_products, top_categories, refreshed_at)
    VALUES (
      p_tenant_id,
      r.buyer_id,
      -- top_products: ranked by weighted count (invoice×2 + order×1), last 12 months
      COALESCE((
        SELECT jsonb_agg(row_to_json(t))
        FROM (
          SELECT
            src.tenant_product_id                        AS product_id,
            SUM(src.weight_count)                        AS weighted_count,
            MAX(src.event_date)                          AS last_ordered_at,
            MAX(COALESCE(tp.name_override, cp.name))     AS product_name
          FROM (
            SELECT ii.tenant_product_id, 2 AS weight_count, inv.invoice_date AS event_date
            FROM app.invoice_items ii
            JOIN app.invoices inv ON inv.id = ii.invoice_id
            WHERE inv.tenant_id = p_tenant_id AND inv.buyer_id = r.buyer_id
              AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
              AND inv.invoice_date >= NOW() - INTERVAL '12 months'
            UNION ALL
            SELECT oi.tenant_product_id, 1 AS weight_count, o.placed_at AS event_date
            FROM app.order_items oi
            JOIN app.orders o ON o.id = oi.order_id
            WHERE o.tenant_id = p_tenant_id AND o.buyer_id = r.buyer_id
              AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
              AND o.placed_at >= NOW() - INTERVAL '12 months'
          ) src
          JOIN app.tenant_products tp ON tp.id = src.tenant_product_id
          LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
          GROUP BY src.tenant_product_id
          ORDER BY weighted_count DESC, last_ordered_at DESC
          LIMIT 10
        ) t
      ), '[]'::jsonb),
      -- top_categories: by weighted count within the same 12-month window
      COALESCE((
        SELECT jsonb_agg(row_to_json(t))
        FROM (
          SELECT
            tp.tenant_category_id                        AS category_id,
            SUM(src.weight_count)                        AS weighted_count,
            MAX(src.event_date)                          AS last_ordered_at
          FROM (
            SELECT ii.tenant_product_id, 2 AS weight_count, inv.invoice_date AS event_date
            FROM app.invoice_items ii
            JOIN app.invoices inv ON inv.id = ii.invoice_id
            WHERE inv.tenant_id = p_tenant_id AND inv.buyer_id = r.buyer_id
              AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
              AND inv.invoice_date >= NOW() - INTERVAL '12 months'
            UNION ALL
            SELECT oi.tenant_product_id, 1 AS weight_count, o.placed_at AS event_date
            FROM app.order_items oi
            JOIN app.orders o ON o.id = oi.order_id
            WHERE o.tenant_id = p_tenant_id AND o.buyer_id = r.buyer_id
              AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
              AND o.placed_at >= NOW() - INTERVAL '12 months'
          ) src
          JOIN app.tenant_products tp ON tp.id = src.tenant_product_id
          WHERE tp.tenant_category_id IS NOT NULL
          GROUP BY tp.tenant_category_id
          ORDER BY weighted_count DESC
          LIMIT 5
        ) t
      ), '[]'::jsonb),
      NOW()
    )
    ON CONFLICT (tenant_id, buyer_id) DO UPDATE SET
      top_products   = EXCLUDED.top_products,
      top_categories = EXCLUDED.top_categories,
      refreshed_at   = NOW();
  END LOOP;
END;
$$;

-- ── pg_cron wrapper functions ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.reco_run_all_popularity()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    PERFORM app.reco_compute_popularity(t.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.reco_run_all_associations()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    PERFORM app.reco_compute_associations(t.id, 90);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.reco_run_all_buyer_profiles()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    PERFORM app.reco_refresh_buyer_profiles(t.id);
  END LOOP;
END;
$$;

-- ── pg_cron schedules ─────────────────────────────────────────────────────────
-- Requires pg_cron extension (enabled by default on Supabase).
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('reco-popularity-daily', '0 3 * * *',   'SELECT app.reco_run_all_popularity()');
SELECT cron.schedule('reco-assoc-weekly',     '0 2 * * 0',   'SELECT app.reco_run_all_associations()');
SELECT cron.schedule('reco-buyer-weekly',     '0 3 * * 1',   'SELECT app.reco_run_all_buyer_profiles()');

-- Schedules:
--   reco-popularity-daily: Runs daily at 3:00 AM UTC — computes product popularity metrics
--   reco-assoc-weekly:     Runs Sundays at 2:00 AM UTC — computes product co-purchase associations
--   reco-buyer-weekly:     Runs Mondays at 3:00 AM UTC — refreshes buyer purchase profiles
