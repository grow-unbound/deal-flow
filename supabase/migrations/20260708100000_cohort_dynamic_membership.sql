-- Phase 1: Cohort dynamic membership
-- Adds event-driven refresh: buyer geography/order changes trigger cohort re-evaluation.
-- Daily pg_cron sweep catches drift from bulk imports or edge cases.

-- ─── Schema additions ────────────────────────────────────────────────────────

ALTER TABLE app.cohorts ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz;

-- ─── Helper: derive last_order_bucket from a timestamptz ─────────────────────

CREATE OR REPLACE FUNCTION app.derive_last_order_bucket(p_last_order_at timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_last_order_at IS NULL                          THEN 'dormant_90_plus_days'
    WHEN p_last_order_at >= now() - INTERVAL '30 days'   THEN 'within_30_days'
    WHEN p_last_order_at >= now() - INTERVAL '90 days'   THEN 'within_90_days'
    ELSE 'dormant_90_plus_days'
  END;
$$;

-- ─── Helper: derive gmv_90d_bucket from a numeric amount ─────────────────────

CREATE OR REPLACE FUNCTION app.derive_gmv_90d_bucket(p_gmv numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_gmv <= 0       THEN 'gmv_0'
    WHEN p_gmv <= 50000   THEN 'gmv_1_50000'
    WHEN p_gmv <= 200000  THEN 'gmv_50001_200000'
    WHEN p_gmv <= 500000  THEN 'gmv_200001_500000'
    ELSE                       'gmv_500001_plus'
  END;
$$;

-- ─── Core: evaluate one buyer against all dynamic cohorts of their tenant ─────
-- Called from triggers on app.buyers (geography change) and app.orders (new/updated order).

CREATE OR REPLACE FUNCTION app.evaluate_buyer_for_cohorts(p_buyer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id        uuid;
  v_city             text;
  v_last_order_at    timestamptz;
  v_gmv_90d          numeric;
  v_last_order_bucket text;
  v_gmv_90d_bucket   text;
  v_cohort           record;
  v_filter           jsonb;
  v_field            text;
  v_operator         text;
  v_value_arr        text[];
  v_matches          boolean;
  v_is_excluded      boolean;
  v_bucket_val       text;
  v_now              timestamptz := now();
BEGIN
  -- ── Fetch buyer basics ──────────────────────────────────────────────────────
  SELECT tenant_id, lower(trim(geography->>'city'))
  INTO v_tenant_id, v_city
  FROM app.buyers
  WHERE id = p_buyer_id AND deleted_at IS NULL AND is_active = true;

  IF NOT FOUND THEN
    RETURN; -- buyer deleted or inactive; cohort_members will be cleaned by cascades
  END IF;

  -- ── Compute order-derived metrics for this buyer ────────────────────────────
  SELECT
    MAX(o.placed_at),
    COALESCE(SUM(
      CASE WHEN o.placed_at >= v_now - INTERVAL '90 days' THEN o.total_amount ELSE 0 END
    ), 0)
  INTO v_last_order_at, v_gmv_90d
  FROM app.orders o
  WHERE o.tenant_id = v_tenant_id
    AND o.buyer_id  = p_buyer_id
    AND o.deleted_at IS NULL
    AND o.status   != 'cancelled';

  v_last_order_bucket := app.derive_last_order_bucket(v_last_order_at);
  v_gmv_90d_bucket    := app.derive_gmv_90d_bucket(v_gmv_90d);

  -- ── Evaluate each dynamic cohort ────────────────────────────────────────────
  FOR v_cohort IN
    SELECT id, rules
    FROM app.cohorts
    WHERE tenant_id  = v_tenant_id
      AND is_static  = false
      AND deleted_at IS NULL
  LOOP
    -- Check explicit exclusion list
    v_is_excluded := false;
    IF (v_cohort.rules ? 'excluded_buyer_ids') AND
       jsonb_array_length(v_cohort.rules -> 'excluded_buyer_ids') > 0
    THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_cohort.rules -> 'excluded_buyer_ids') x
        WHERE x = p_buyer_id::text
      ) INTO v_is_excluded;
    END IF;

    IF v_is_excluded THEN
      DELETE FROM app.cohort_members WHERE cohort_id = v_cohort.id AND buyer_id = p_buyer_id;
      CONTINUE;
    END IF;

    -- Evaluate each filter
    v_matches := true;

    FOR v_filter IN SELECT * FROM jsonb_array_elements(COALESCE(v_cohort.rules -> 'filters', '[]'::jsonb))
    LOOP
      v_field    := v_filter ->> 'field';
      v_operator := v_filter ->> 'operator';

      IF v_field = 'geography.city' THEN
        SELECT array_agg(lower(x)) INTO v_value_arr
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(v_filter -> 'value') = 'array'
               THEN v_filter -> 'value'
               ELSE jsonb_build_array(v_filter -> 'value')
          END
        ) x;
        IF NOT (COALESCE(v_city, '') = ANY(v_value_arr)) THEN
          v_matches := false;
          EXIT;
        END IF;

      ELSIF v_field = 'last_order_bucket' THEN
        v_bucket_val := CASE
          WHEN jsonb_typeof(v_filter -> 'value') = 'array'
          THEN (v_filter -> 'value') ->> 0
          ELSE v_filter ->> 'value'
        END;
        IF v_bucket_val = 'within_30_days' AND v_last_order_bucket != 'within_30_days' THEN
          v_matches := false; EXIT;
        ELSIF v_bucket_val = 'within_90_days'
          AND v_last_order_bucket NOT IN ('within_30_days', 'within_90_days') THEN
          v_matches := false; EXIT;
        ELSIF v_bucket_val = 'dormant_90_plus_days'
          AND v_last_order_bucket != 'dormant_90_plus_days' THEN
          v_matches := false; EXIT;
        -- 'anytime' always passes through
        END IF;

      ELSIF v_field = 'gmv_90d_bucket' THEN
        SELECT array_agg(x) INTO v_value_arr
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(v_filter -> 'value') = 'array'
               THEN v_filter -> 'value'
               ELSE jsonb_build_array(v_filter -> 'value')
          END
        ) x;
        IF NOT (v_gmv_90d_bucket = ANY(v_value_arr)) THEN
          v_matches := false; EXIT;
        END IF;
      END IF;
    END LOOP;

    -- Apply membership change
    IF v_matches THEN
      INSERT INTO app.cohort_members (cohort_id, buyer_id)
      VALUES (v_cohort.id, p_buyer_id)
      ON CONFLICT (cohort_id, buyer_id) DO NOTHING;
    ELSE
      DELETE FROM app.cohort_members
      WHERE cohort_id = v_cohort.id AND buyer_id = p_buyer_id;
    END IF;
  END LOOP;

  -- Update cached_member_count + last_refreshed_at for affected cohorts
  UPDATE app.cohorts c
  SET
    cached_member_count = (SELECT COUNT(*) FROM app.cohort_members WHERE cohort_id = c.id),
    last_refreshed_at   = v_now
  WHERE c.tenant_id  = v_tenant_id
    AND c.is_static  = false
    AND c.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION app.evaluate_buyer_for_cohorts(uuid) TO service_role;

-- ─── Per-cohort refresh (called from "Refresh now" button) ───────────────────

CREATE OR REPLACE FUNCTION app.refresh_cohort_by_id(p_cohort_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id uuid;
  v_buyer     record;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM app.cohorts
  WHERE id = p_cohort_id AND is_static = false AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_buyer IN
    SELECT id FROM app.buyers
    WHERE tenant_id = v_tenant_id AND deleted_at IS NULL AND is_active = true
  LOOP
    PERFORM app.evaluate_buyer_for_cohorts(v_buyer.id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION app.refresh_cohort_by_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.refresh_cohort_by_id(uuid) TO authenticated;

-- ─── Daily sweep: refresh all dynamic cohorts across all tenants ──────────────

CREATE OR REPLACE FUNCTION app.refresh_all_dynamic_cohorts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cohort record;
BEGIN
  FOR v_cohort IN
    SELECT DISTINCT id FROM app.cohorts
    WHERE is_static = false AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_cohort_by_id(v_cohort.id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION app.refresh_all_dynamic_cohorts() TO service_role;

-- ─── Trigger: buyer geography change → re-evaluate cohorts ───────────────────

CREATE OR REPLACE FUNCTION app.trg_buyer_geography_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.geography IS DISTINCT FROM OLD.geography THEN
    PERFORM app.evaluate_buyer_for_cohorts(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_buyer_geography_cohort_refresh ON app.buyers;
CREATE TRIGGER trg_buyer_geography_cohort_refresh
  AFTER UPDATE OF geography ON app.buyers
  FOR EACH ROW
  EXECUTE FUNCTION app.trg_buyer_geography_changed();

-- ─── Trigger: new/updated order → re-evaluate buyer's cohort membership ───────
-- Fires on INSERT (new order placed) and UPDATE of status/total_amount/placed_at
-- which affects last_order_bucket and gmv_90d_bucket derivations.

CREATE OR REPLACE FUNCTION app.trg_order_buyer_cohort_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (
    TG_OP = 'UPDATE' AND (
      NEW.status        IS DISTINCT FROM OLD.status OR
      NEW.total_amount  IS DISTINCT FROM OLD.total_amount OR
      NEW.placed_at     IS DISTINCT FROM OLD.placed_at
    )
  ) THEN
    PERFORM app.evaluate_buyer_for_cohorts(NEW.buyer_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_buyer_cohort_refresh ON app.orders;
CREATE TRIGGER trg_order_buyer_cohort_refresh
  AFTER INSERT OR UPDATE OF status, total_amount, placed_at ON app.orders
  FOR EACH ROW
  EXECUTE FUNCTION app.trg_order_buyer_cohort_refresh();

-- ─── pg_cron: daily sweep at 02:00 UTC ───────────────────────────────────────

SELECT cron.schedule(
  'refresh-cohorts-daily',
  '0 2 * * *',
  $$SELECT app.refresh_all_dynamic_cohorts()$$
);

-- ─── Updated preview_cohort_count RPC ────────────────────────────────────────
-- Removes: tier, geography.state, geography.zone, geography.label
-- Adds:    geography.city (with 'in' operator), last_order_bucket, gmv_90d_bucket

CREATE OR REPLACE FUNCTION app.preview_cohort_count(
  p_tenant_id  uuid,
  p_rules_json jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count         integer := 0;
  v_sample_names  text[]  := '{}';
  v_filters       jsonb;
  v_filter        jsonb;
  v_field         text;
  v_operator      text;
  v_value_arr     text[];
  v_bucket_val    text;
  v_geo_cond      text    := NULL;
  v_order_cond    text    := NULL;
  v_gmv_cond      text    := NULL;
  v_needs_orders  boolean := false;
  v_base_cte      text;
  v_where_parts   text[]  := '{}';
  v_query         text;
BEGIN
  v_filters := p_rules_json -> 'filters';

  -- Fast path: no filters → all active buyers
  IF v_filters IS NULL OR jsonb_array_length(v_filters) = 0 THEN
    SELECT COUNT(*), array_agg(sub.business_name ORDER BY sub.business_name)
    INTO v_count, v_sample_names
    FROM (
      SELECT business_name FROM app.buyers
      WHERE tenant_id = p_tenant_id AND is_active = true AND deleted_at IS NULL
      LIMIT 5
    ) sub;
    RETURN jsonb_build_object('count', COALESCE(v_count, 0), 'sample_names', COALESCE(v_sample_names, '{}'));
  END IF;

  -- Parse filters
  FOR i IN 0 .. jsonb_array_length(v_filters) - 1 LOOP
    v_filter   := v_filters -> i;
    v_field    := v_filter ->> 'field';
    v_operator := v_filter ->> 'operator';

    IF v_field = 'geography.city' THEN
      SELECT array_agg(lower(x)) INTO v_value_arr
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_filter -> 'value') = 'array'
             THEN v_filter -> 'value'
             ELSE jsonb_build_array(v_filter -> 'value')
        END
      ) x;
      v_geo_cond := format(
        'lower(geography->>''city'') = ANY(%L::text[])',
        v_value_arr
      );

    ELSIF v_field = 'last_order_bucket' THEN
      v_needs_orders := true;
      v_bucket_val := CASE
        WHEN jsonb_typeof(v_filter -> 'value') = 'array'
        THEN (v_filter -> 'value') ->> 0
        ELSE v_filter ->> 'value'
      END;
      v_order_cond := CASE v_bucket_val
        WHEN 'within_30_days'       THEN 'last_order_bucket = ''within_30_days'''
        WHEN 'within_90_days'       THEN 'last_order_bucket IN (''within_30_days'',''within_90_days'')'
        WHEN 'dormant_90_plus_days' THEN 'last_order_bucket = ''dormant_90_plus_days'''
        ELSE NULL -- 'anytime' → no condition
      END;

    ELSIF v_field = 'gmv_90d_bucket' THEN
      v_needs_orders := true;
      SELECT array_agg(x) INTO v_value_arr
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_filter -> 'value') = 'array'
             THEN v_filter -> 'value'
             ELSE jsonb_build_array(v_filter -> 'value')
        END
      ) x;
      v_gmv_cond := format('gmv_90d_bucket = ANY(%L::text[])', v_value_arr);
    END IF;
  END LOOP;

  IF NOT v_needs_orders THEN
    -- Simple path: only geography filter, no orders join needed
    v_where_parts := ARRAY['is_active = true', 'deleted_at IS NULL', format('tenant_id = %L::uuid', p_tenant_id)];
    IF v_geo_cond IS NOT NULL THEN
      v_where_parts := array_append(v_where_parts, v_geo_cond);
    END IF;

    v_query := 'SELECT COUNT(*) FROM app.buyers WHERE ' || array_to_string(v_where_parts, ' AND ');
    EXECUTE v_query INTO v_count;

    v_query := 'SELECT array_agg(business_name ORDER BY business_name) FROM (SELECT business_name FROM app.buyers WHERE '
      || array_to_string(v_where_parts, ' AND ') || ' LIMIT 5) sub';
    EXECUTE v_query INTO v_sample_names;

  ELSE
    -- Orders-join path: compute buckets via CTE then filter
    v_base_cte := format(
      $CTE$
      WITH buyer_metrics AS (
        SELECT
          b.id,
          b.business_name,
          b.geography,
          MAX(o.placed_at) AS last_order_at,
          COALESCE(SUM(
            CASE WHEN o.placed_at >= now() - INTERVAL '90 days' THEN o.total_amount ELSE 0 END
          ), 0) AS gmv_90d
        FROM app.buyers b
        LEFT JOIN app.orders o
          ON  o.buyer_id   = b.id
          AND o.tenant_id  = %L::uuid
          AND o.deleted_at IS NULL
          AND o.status    != 'cancelled'
        WHERE b.tenant_id = %L::uuid
          AND b.is_active = true
          AND b.deleted_at IS NULL
        GROUP BY b.id, b.business_name, b.geography
      ),
      buyer_buckets AS (
        SELECT
          id, business_name, geography,
          app.derive_last_order_bucket(last_order_at) AS last_order_bucket,
          app.derive_gmv_90d_bucket(gmv_90d)          AS gmv_90d_bucket
        FROM buyer_metrics
      )
      $CTE$,
      p_tenant_id, p_tenant_id
    );

    v_where_parts := '{}';
    IF v_geo_cond   IS NOT NULL THEN v_where_parts := array_append(v_where_parts, v_geo_cond);   END IF;
    IF v_order_cond IS NOT NULL THEN v_where_parts := array_append(v_where_parts, v_order_cond); END IF;
    IF v_gmv_cond   IS NOT NULL THEN v_where_parts := array_append(v_where_parts, v_gmv_cond);   END IF;

    v_query := v_base_cte || ' SELECT COUNT(*) FROM buyer_buckets'
      || CASE WHEN array_length(v_where_parts, 1) > 0
              THEN ' WHERE ' || array_to_string(v_where_parts, ' AND ')
              ELSE '' END;
    EXECUTE v_query INTO v_count;

    v_query := v_base_cte
      || ' SELECT array_agg(business_name ORDER BY business_name) FROM (SELECT business_name FROM buyer_buckets'
      || CASE WHEN array_length(v_where_parts, 1) > 0
              THEN ' WHERE ' || array_to_string(v_where_parts, ' AND ')
              ELSE '' END
      || ' LIMIT 5) sub';
    EXECUTE v_query INTO v_sample_names;
  END IF;

  RETURN jsonb_build_object(
    'count',        COALESCE(v_count, 0),
    'sample_names', COALESCE(v_sample_names, '{}')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION app.preview_cohort_count(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION app.preview_cohort_count(uuid, jsonb) TO authenticated;
