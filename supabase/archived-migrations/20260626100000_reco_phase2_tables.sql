-- Recommendation Engine Phase 2: Category Roles + Bundle Framework
-- Signal weights follow Phase 1 convention: invoice×2 + order×1 + estimate×0.5 (non-invoiced)

-- ── ALTER app.tenant_categories ───────────────────────────────────────────────
-- Distributor override column. NULL = use auto-computed role.
ALTER TABLE app.tenant_categories
  ADD COLUMN IF NOT EXISTS recommendation_role text
    CHECK (recommendation_role IN ('anchor', 'companion', 'exclude'));

-- ── app.reco_category_profiles ────────────────────────────────────────────────
-- Auto-computed per tenant_category. Refreshed weekly by reco_compute_category_profiles().
-- computed_role resolution order:
--   1. tenant_categories.recommendation_role (distributor explicit — always wins)
--   2. reco_category_profiles.computed_role (batch-learned from order behavior)
--   3. 'anchor' (safe default when no data)
CREATE TABLE IF NOT EXISTS app.reco_category_profiles (
  tenant_id              uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  tenant_category_id     uuid NOT NULL REFERENCES app.tenant_categories(id) ON DELETE CASCADE,
  computed_role          text NOT NULL DEFAULT 'anchor'
    CHECK (computed_role IN ('anchor', 'companion', 'exclude')),
  -- solo_order_rate: fraction of weighted events where this is the ONLY category present.
  -- High → likely anchor (buyers sought it specifically).
  solo_order_rate        numeric(5,4),
  -- co_occurrence_breadth: count of distinct other categories this category appears alongside.
  -- Very high breadth relative to tenant median → likely companion (goes with everything).
  co_occurrence_breadth  int,
  weighted_event_count   int NOT NULL DEFAULT 0,
  computed_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, tenant_category_id)
);

CREATE INDEX IF NOT EXISTS idx_reco_cat_profiles_tenant_role
  ON app.reco_category_profiles (tenant_id, computed_role);

ALTER TABLE app.reco_category_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY reco_cat_profiles_service_write ON app.reco_category_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY reco_cat_profiles_tenant_read ON app.reco_category_profiles
  FOR SELECT USING (app.jwt_tenant_id() = tenant_id);

-- ── app.reco_category_associations ───────────────────────────────────────────
-- Category-level co-occurrence fallback when a product has too few events for SKU associations.
CREATE TABLE IF NOT EXISTS app.reco_category_associations (
  id                  bigserial PRIMARY KEY,
  tenant_id           uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  category_a_id       uuid NOT NULL REFERENCES app.tenant_categories(id) ON DELETE CASCADE,
  category_b_id       uuid NOT NULL REFERENCES app.tenant_categories(id) ON DELETE CASCADE,
  co_occurrence_count int NOT NULL DEFAULT 0,
  lift_score          numeric(10,6),
  confidence          numeric(10,6),
  time_window_days    int NOT NULL,
  computed_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, category_a_id, category_b_id, time_window_days)
);

CREATE INDEX IF NOT EXISTS idx_reco_cat_assoc_lookup
  ON app.reco_category_associations (tenant_id, category_a_id, time_window_days);

ALTER TABLE app.reco_category_associations ENABLE ROW LEVEL SECURITY;
CREATE POLICY reco_cat_assoc_service_write ON app.reco_category_associations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY reco_cat_assoc_tenant_read ON app.reco_category_associations
  FOR SELECT USING (app.jwt_tenant_id() = tenant_id);

-- ── app.reco_bundles ──────────────────────────────────────────────────────────
-- Named bundles of product categories that tend to appear together in orders.
-- source='auto_suggested': proposed by reco_suggest_bundles(), confirmed by distributor.
-- source='manual': distributor-defined from scratch.
CREATE TABLE IF NOT EXISTS app.reco_bundles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  source      text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto_suggested')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_reco_bundles_tenant_active
  ON app.reco_bundles (tenant_id, is_active);

ALTER TABLE app.reco_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY reco_bundles_service_write ON app.reco_bundles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY reco_bundles_tenant_read ON app.reco_bundles
  FOR SELECT USING (app.jwt_tenant_id() = tenant_id);

-- ── app.reco_bundle_slots ─────────────────────────────────────────────────────
-- Each slot defines one required/optional component category in a bundle.
-- "Complete Your Cart" checks which slots are covered by current cart categories.
CREATE TABLE IF NOT EXISTS app.reco_bundle_slots (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id            uuid NOT NULL REFERENCES app.reco_bundles(id) ON DELETE CASCADE,
  tenant_category_id   uuid NOT NULL REFERENCES app.tenant_categories(id) ON DELETE CASCADE,
  slot_label           text,
  is_required          boolean NOT NULL DEFAULT true,
  display_order        int NOT NULL DEFAULT 0,
  UNIQUE (bundle_id, tenant_category_id)
);

CREATE INDEX IF NOT EXISTS idx_reco_bundle_slots_bundle
  ON app.reco_bundle_slots (bundle_id, display_order);

ALTER TABLE app.reco_bundle_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY reco_bundle_slots_service_write ON app.reco_bundle_slots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Join through reco_bundles to check tenant ownership
CREATE POLICY reco_bundle_slots_tenant_read ON app.reco_bundle_slots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM app.reco_bundles rb
      WHERE rb.id = bundle_id AND rb.tenant_id = app.jwt_tenant_id()
    )
  );

-- ── app.reco_bundle_suggestions ───────────────────────────────────────────────
-- Batch-computed bundle candidates surfaced to the distributor for review.
-- status flow: pending → accepted (creates reco_bundles row) | rejected
CREATE TABLE IF NOT EXISTS app.reco_bundle_suggestions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  suggested_name      text,
  category_ids        uuid[] NOT NULL,
  avg_co_occurrence   int NOT NULL,
  confidence_score    numeric(5,4) NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  computed_at         timestamptz NOT NULL DEFAULT now(),
  reviewed_at         timestamptz,
  reviewed_by         uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_reco_bundle_sugg_tenant_status
  ON app.reco_bundle_suggestions (tenant_id, status, computed_at DESC);

ALTER TABLE app.reco_bundle_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reco_bundle_sugg_service_write ON app.reco_bundle_suggestions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY reco_bundle_sugg_tenant_read ON app.reco_bundle_suggestions
  FOR SELECT USING (app.jwt_tenant_id() = tenant_id);

-- ── Batch compute: reco_compute_category_profiles ─────────────────────────────
-- Classifies each tenant_category as anchor / companion / exclude using the same
-- weighted event signals as Phase 1 (invoice×2 via duplication, order×1, estimate×0.5).
-- Writes to reco_category_profiles. Scheduled Sunday 1am.
CREATE OR REPLACE FUNCTION app.reco_compute_category_profiles(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  window_start      timestamptz := NOW() - INTERVAL '90 days';
  invoiced_ids      uuid[];
  median_breadth    numeric;
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT estimate_id FROM app.invoices
    WHERE tenant_id = p_tenant_id AND estimate_id IS NOT NULL AND deleted_at IS NULL
  ) INTO invoiced_ids;

  -- Build weighted events at category grain using the Phase 1 signal pattern.
  -- invoice copy 1 + copy 2 gives effective weight=2 for invoices.
  WITH purchase_events AS (
    SELECT ('inv:' || inv.id::text) AS event_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    SELECT ('inv2:' || inv.id::text) AS event_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    SELECT ('ord:' || o.id::text) AS event_id, oi.tenant_product_id
    FROM app.order_items oi
    JOIN app.orders o ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
      AND o.placed_at >= window_start
    UNION ALL
    SELECT ('est:' || e.id::text) AS event_id, ei.tenant_product_id
    FROM app.estimate_items ei
    JOIN app.estimates e ON e.id = ei.estimate_id
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND ei.deleted_at IS NULL
      AND e.created_at >= window_start
      AND (invoiced_ids IS NULL OR array_length(invoiced_ids, 1) IS NULL OR e.id <> ALL(invoiced_ids))
  ),
  -- Map events → categories
  event_categories AS (
    SELECT DISTINCT pe.event_id, tp.tenant_category_id
    FROM purchase_events pe
    JOIN app.tenant_products tp ON tp.id = pe.tenant_product_id
    WHERE tp.tenant_category_id IS NOT NULL
  ),
  -- For each (event, category), count distinct OTHER categories in that event
  event_category_counts AS (
    SELECT event_id, COUNT(DISTINCT tenant_category_id) AS category_count
    FROM event_categories
    GROUP BY event_id
  ),
  -- Per category: weighted event count + solo order rate + co-occurrence breadth
  category_stats AS (
    SELECT
      ec.tenant_category_id,
      COUNT(DISTINCT ec.event_id)                                                     AS weighted_event_count,
      -- solo_order_rate: events where this is the ONLY category
      COUNT(DISTINCT CASE WHEN ecc.category_count = 1 THEN ec.event_id END)::numeric
        / NULLIF(COUNT(DISTINCT ec.event_id), 0)                                      AS solo_order_rate,
      -- co_occurrence_breadth: distinct other categories this one appears alongside
      COUNT(DISTINCT ec2.tenant_category_id)                                          AS co_occurrence_breadth
    FROM event_categories ec
    JOIN event_category_counts ecc ON ecc.event_id = ec.event_id
    LEFT JOIN event_categories ec2
      ON ec2.event_id = ec.event_id AND ec2.tenant_category_id <> ec.tenant_category_id
    GROUP BY ec.tenant_category_id
  ),
  -- Compute median breadth across categories for this tenant
  median_calc AS (
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY co_occurrence_breadth) AS med
    FROM category_stats
  ),
  -- Classification
  classified AS (
    SELECT
      cs.tenant_category_id,
      cs.weighted_event_count,
      cs.solo_order_rate,
      cs.co_occurrence_breadth::int,
      CASE
        -- exclude: zero activity or name matches service patterns
        WHEN cs.weighted_event_count = 0 THEN 'exclude'
        WHEN LOWER(tc.name) ~ '(charge|installation|amc|service|labour|labor|freight|transport|handling)' THEN 'exclude'
        -- companion: almost never bought alone and appears with a very wide variety of categories
        WHEN cs.solo_order_rate < 0.05
          AND cs.co_occurrence_breadth > COALESCE(mc.med * 1.5, 2) THEN 'companion'
        -- anchor: default (conservative — when uncertain, keep in Bestsellers)
        ELSE 'anchor'
      END AS computed_role
    FROM category_stats cs
    JOIN app.tenant_categories tc ON tc.id = cs.tenant_category_id
    CROSS JOIN median_calc mc
  )
  INSERT INTO app.reco_category_profiles
    (tenant_id, tenant_category_id, computed_role, solo_order_rate, co_occurrence_breadth, weighted_event_count, computed_at)
  SELECT
    p_tenant_id,
    tenant_category_id,
    computed_role,
    solo_order_rate,
    co_occurrence_breadth,
    weighted_event_count,
    NOW()
  FROM classified
  ON CONFLICT (tenant_id, tenant_category_id) DO UPDATE SET
    computed_role          = EXCLUDED.computed_role,
    solo_order_rate        = EXCLUDED.solo_order_rate,
    co_occurrence_breadth  = EXCLUDED.co_occurrence_breadth,
    weighted_event_count   = EXCLUDED.weighted_event_count,
    computed_at            = NOW();

  -- Mark categories with zero events as 'exclude' (not seen in classified CTE)
  INSERT INTO app.reco_category_profiles
    (tenant_id, tenant_category_id, computed_role, weighted_event_count, computed_at)
  SELECT p_tenant_id, tc.id, 'exclude', 0, NOW()
  FROM app.tenant_categories tc
  WHERE tc.tenant_id = p_tenant_id
    AND tc.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM app.reco_category_profiles cp
      WHERE cp.tenant_id = p_tenant_id AND cp.tenant_category_id = tc.id
    )
  ON CONFLICT (tenant_id, tenant_category_id) DO NOTHING;
END;
$$;

-- ── Batch compute: reco_compute_category_associations ─────────────────────────
-- Category-level co-occurrence pairs. Same weighted-event pattern as Phase 1 product associations.
-- Scheduled Sunday 2am (after category profiles are ready).
CREATE OR REPLACE FUNCTION app.reco_compute_category_associations(p_tenant_id uuid, p_window_days int DEFAULT 90)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  min_support  int;
  window_start timestamptz := NOW() - (p_window_days || ' days')::interval;
  invoiced_ids uuid[];
  total_events bigint;
BEGIN
  SELECT COALESCE((settings->>'reco_min_support')::int, 3)
  INTO min_support FROM app.tenants WHERE id = p_tenant_id;

  SELECT ARRAY(
    SELECT DISTINCT estimate_id FROM app.invoices
    WHERE tenant_id = p_tenant_id AND estimate_id IS NOT NULL AND deleted_at IS NULL
  ) INTO invoiced_ids;

  DELETE FROM app.reco_category_associations
  WHERE tenant_id = p_tenant_id AND time_window_days = p_window_days;

  WITH purchase_events AS (
    SELECT ('inv:' || inv.id::text) AS event_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    SELECT ('inv2:' || inv.id::text) AS event_id, ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_start
    UNION ALL
    SELECT ('ord:' || o.id::text) AS event_id, oi.tenant_product_id
    FROM app.order_items oi
    JOIN app.orders o ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
      AND o.placed_at >= window_start
    UNION ALL
    SELECT ('est:' || e.id::text) AS event_id, ei.tenant_product_id
    FROM app.estimate_items ei
    JOIN app.estimates e ON e.id = ei.estimate_id
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND ei.deleted_at IS NULL
      AND e.created_at >= window_start
      AND (invoiced_ids IS NULL OR array_length(invoiced_ids, 1) IS NULL OR e.id <> ALL(invoiced_ids))
  ),
  event_categories AS (
    SELECT DISTINCT pe.event_id, tp.tenant_category_id
    FROM purchase_events pe
    JOIN app.tenant_products tp ON tp.id = pe.tenant_product_id
    WHERE tp.tenant_category_id IS NOT NULL
  ),
  event_totals AS (
    SELECT COUNT(DISTINCT event_id) AS total_cnt FROM event_categories
  ),
  co_pairs AS (
    SELECT
      ec1.tenant_category_id AS category_a,
      ec2.tenant_category_id AS category_b,
      COUNT(DISTINCT ec1.event_id) AS co_count
    FROM event_categories ec1
    JOIN event_categories ec2
      ON ec1.event_id = ec2.event_id AND ec1.tenant_category_id < ec2.tenant_category_id
    GROUP BY ec1.tenant_category_id, ec2.tenant_category_id
    HAVING COUNT(DISTINCT ec1.event_id) >= min_support
  ),
  cat_event_counts AS (
    SELECT tenant_category_id, COUNT(DISTINCT event_id) AS event_count
    FROM event_categories GROUP BY tenant_category_id
  )
  INSERT INTO app.reco_category_associations
    (tenant_id, category_a_id, category_b_id, co_occurrence_count, lift_score, confidence, time_window_days)
  SELECT p_tenant_id, p.category_a, p.category_b,
    p.co_count,
    (p.co_count::numeric / NULLIF(t.total_cnt, 0)) /
      NULLIF((ca.event_count::numeric / t.total_cnt) * (cb.event_count::numeric / t.total_cnt), 0),
    p.co_count::numeric / NULLIF(ca.event_count, 0),
    p_window_days
  FROM co_pairs p
  CROSS JOIN event_totals t
  JOIN cat_event_counts ca ON ca.tenant_category_id = p.category_a
  JOIN cat_event_counts cb ON cb.tenant_category_id = p.category_b
  UNION ALL
  SELECT p_tenant_id, p.category_b, p.category_a,
    p.co_count,
    (p.co_count::numeric / NULLIF(t.total_cnt, 0)) /
      NULLIF((cb.event_count::numeric / t.total_cnt) * (ca.event_count::numeric / t.total_cnt), 0),
    p.co_count::numeric / NULLIF(cb.event_count, 0),
    p_window_days
  FROM co_pairs p
  CROSS JOIN event_totals t
  JOIN cat_event_counts ca ON ca.tenant_category_id = p.category_a
  JOIN cat_event_counts cb ON cb.tenant_category_id = p.category_b;
END;
$$;

-- ── Batch compute: reco_suggest_bundles ───────────────────────────────────────
-- Identifies high-confidence category clusters and writes to reco_bundle_suggestions.
-- Only clusters of anchor categories (not companions/excludes) are proposed.
-- Skips clusters where a matching suggestion already exists in the last 60 days.
-- Scheduled Sunday 4am.
CREATE OR REPLACE FUNCTION app.reco_suggest_bundles(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO app.reco_bundle_suggestions
    (tenant_id, suggested_name, category_ids, avg_co_occurrence, confidence_score, status, computed_at)
  SELECT
    p_tenant_id,
    -- Generate a suggested bundle name from the category names
    (
      SELECT string_agg(tc2.name, ' + ' ORDER BY tc2.name)
      FROM app.tenant_categories tc2
      WHERE tc2.id = ANY(ARRAY[ca.category_a_id, ca.category_b_id])
    ),
    ARRAY[ca.category_a_id, ca.category_b_id],
    ca.co_occurrence_count,
    ca.confidence,
    'pending',
    NOW()
  FROM app.reco_category_associations ca
  -- Only propose pairs of anchor categories
  JOIN app.reco_category_profiles cpa
    ON cpa.tenant_id = p_tenant_id AND cpa.tenant_category_id = ca.category_a_id
  JOIN app.reco_category_profiles cpb
    ON cpb.tenant_id = p_tenant_id AND cpb.tenant_category_id = ca.category_b_id
  JOIN app.tenant_categories tca ON tca.id = ca.category_a_id AND tca.deleted_at IS NULL
  JOIN app.tenant_categories tcb ON tcb.id = ca.category_b_id AND tcb.deleted_at IS NULL
  WHERE ca.tenant_id = p_tenant_id
    AND ca.time_window_days = 90
    AND ca.confidence >= 0.3
    AND ca.co_occurrence_count >= 5
    -- Skip companion/exclude categories
    AND COALESCE(tca.recommendation_role, cpa.computed_role, 'anchor') = 'anchor'
    AND COALESCE(tcb.recommendation_role, cpb.computed_role, 'anchor') = 'anchor'
    -- Skip pairs that already have a recent suggestion
    AND NOT EXISTS (
      SELECT 1 FROM app.reco_bundle_suggestions bs
      WHERE bs.tenant_id = p_tenant_id
        AND ca.category_a_id = ANY(bs.category_ids)
        AND ca.category_b_id = ANY(bs.category_ids)
        AND bs.computed_at >= NOW() - INTERVAL '60 days'
    )
  -- Top 10 strongest pairs per tenant per run
  ORDER BY ca.confidence DESC
  LIMIT 10
  ON CONFLICT DO NOTHING;
END;
$$;

-- ── pg_cron wrapper: reco_refresh_category_intelligence ───────────────────────
-- Iterates active tenants and runs all three category-level batch jobs in order.
-- Registered on pg_cron: Sunday 1am for profiles, 2am for associations, 4am for bundles.
CREATE OR REPLACE FUNCTION app.reco_refresh_category_intelligence()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    PERFORM app.reco_compute_category_profiles(t.id);
    PERFORM app.reco_compute_category_associations(t.id, 90);
    PERFORM app.reco_suggest_bundles(t.id);
  END LOOP;
END;
$$;

-- ── pg_cron schedule (run manually in Supabase SQL editor) ────────────────────
-- SELECT cron.schedule('reco-cat-profiles-weekly',  '0 1 * * 0', 'SELECT app.reco_compute_category_profiles_all()');
-- Wrapper per-job:
-- CREATE OR REPLACE FUNCTION app.reco_compute_category_profiles_all() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
--   DECLARE t RECORD; BEGIN FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
--     PERFORM app.reco_compute_category_profiles(t.id); END LOOP; END; $$;
-- SELECT cron.schedule('reco-cat-assoc-weekly',     '0 2 * * 0', 'SELECT app.reco_compute_category_associations_all()');
-- SELECT cron.schedule('reco-suggest-bundles-weekly','0 4 * * 0', 'SELECT app.reco_suggest_bundles_all()');
-- Or use the combined wrapper: SELECT cron.schedule('reco-category-intelligence','0 1 * * 0','SELECT app.reco_refresh_category_intelligence()');
