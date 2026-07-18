-- Customers landing Pulse cards, per specs/metrics-product-strategy-proposal-2026-07.md:
--   - "Invoiced sales 90d" needs a unique-customer count alongside value —
--     added invoiced_customer_count (distinct buyers with invoice_count_90d>0).
--   - "Overdue amount" needs the real overdue total + affected-customer count,
--     not the broader receivables total previously exposed as outstanding_dues
--     (kept as-is; new overdue_sum/overdue_customer_count are additive).
--   - "Inactive 90d w/ prior-year sales" needs the prior-year value summed
--     over just the dormant cohort — added dormant_prior_year_value.
CREATE OR REPLACE FUNCTION app.metrics_v2_customers_landing(
  p_tenant_id uuid,
  p_location_ids uuid[] DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_dues text[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor_name text DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_as_of timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
  v_location_scoped boolean := COALESCE(array_length(p_location_ids, 1), 0) > 0;
  v_total bigint := 0;
  v_active bigint := 0;
  v_dormant bigint := 0;
  v_dues_buyers bigint := 0;
  v_cohort_count bigint := 0;
  v_spend numeric := 0;
  v_prev_spend numeric := 0;
  v_outstanding numeric := 0;
  v_invoiced_customers bigint := 0;
  v_overdue_sum numeric := 0;
  v_overdue_customers bigint := 0;
  v_dormant_prior_year_value numeric := 0;
  v_rows jsonb := '[]'::jsonb;
  v_needs_call jsonb := '[]'::jsonb;
  v_win_back jsonb := '[]'::jsonb;
  v_next_name text;
  v_next_id uuid;
  v_next_cursor jsonb := NULL;
  v_source_watermark timestamptz;
  v_computed_at timestamptz;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'metrics_v2_customers_landing_tenant_required' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE _metrics_v2_customers_base ON COMMIT DROP AS
  WITH scoped_metrics AS (
    SELECT
      b.id AS buyer_id,
      COALESCE(SUM(bls.invoice_count_90d), 0)::bigint AS invoice_count_90d,
      COALESCE(SUM(bls.invoice_value_90d), 0)::numeric AS invoice_value_90d,
      0::numeric AS prior_year_invoice_value_90d,
      COALESCE(SUM(bls.estimate_count_90d), 0)::bigint AS estimate_count_90d,
      COALESCE(SUM(bls.order_count_90d), 0)::bigint AS order_count_90d,
      COALESCE(SUM(bls.order_value_90d), 0)::numeric AS order_value_90d,
      MAX(bls.last_invoice_at) AS last_invoice_at,
      MAX(bls.last_estimate_at) AS last_estimate_at,
      MAX(bls.last_order_at) AS last_order_at,
      COALESCE(SUM(bls.receivable_amount), 0)::numeric AS receivable_amount,
      COALESCE(SUM(bls.overdue_amount), 0)::numeric AS overdue_amount,
      MAX(bls.source_watermark) AS source_watermark,
      MAX(bls.computed_at) AS computed_at
    FROM app.buyers b
    LEFT JOIN app.metrics_buyer_location_snapshot bls
      ON bls.tenant_id = b.tenant_id
     AND bls.buyer_id = b.id
     AND bls.location_id = ANY (p_location_ids)
     AND bls.deleted_at IS NULL
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND v_location_scoped
    GROUP BY b.id
  ),
  tenant_metrics AS (
    SELECT
      bs.buyer_id,
      bs.invoice_count_90d,
      bs.invoice_value_90d,
      bs.prior_year_invoice_value_90d,
      bs.estimate_count_90d,
      bs.order_count_90d,
      bs.order_value_90d,
      bs.last_invoice_at,
      bs.last_estimate_at,
      bs.last_order_at,
      bs.receivable_amount,
      bs.overdue_amount,
      bs.source_watermark,
      bs.computed_at
    FROM app.metrics_buyer_snapshot bs
    WHERE bs.tenant_id = p_tenant_id
      AND bs.deleted_at IS NULL
      AND NOT v_location_scoped
  ),
  metrics AS (
    SELECT * FROM scoped_metrics
    UNION ALL
    SELECT * FROM tenant_metrics
  )
  SELECT
    b.id,
    b.business_name,
    b.tier,
    b.phone,
    b.gst_treatment,
    b.status AS zoho_status,
    b.credit_limit AS buyer_credit_limit,
    b.is_active,
    b.geography,
    b.whatsapp_opt_out_at,
    COALESCE(m.invoice_count_90d, 0)::bigint AS invoice_count_90d,
    COALESCE(m.invoice_value_90d, 0)::numeric AS invoice_value_90d,
    COALESCE(m.prior_year_invoice_value_90d, 0)::numeric AS prior_year_invoice_value_90d,
    COALESCE(m.estimate_count_90d, 0)::bigint AS estimate_count_90d,
    COALESCE(m.order_count_90d, 0)::bigint AS order_count_90d,
    COALESCE(m.order_value_90d, 0)::numeric AS order_value_90d,
    GREATEST(m.last_invoice_at, m.last_estimate_at, m.last_order_at) AS last_order_at,
    COALESCE(m.receivable_amount, 0)::numeric AS receivable_amount,
    COALESCE(m.overdue_amount, 0)::numeric AS overdue_amount,
    COALESCE(bs.credit_limit, b.credit_limit, 0)::numeric AS credit_limit,
    bs.last_buyer_app_activity_at,
    bs.health_reason,
    bs.oldest_due_at,
    COALESCE(m.source_watermark, bs.source_watermark) AS source_watermark,
    COALESCE(m.computed_at, bs.computed_at) AS computed_at
  FROM app.buyers b
  LEFT JOIN metrics m ON m.buyer_id = b.id
  LEFT JOIN app.metrics_buyer_snapshot bs
    ON bs.tenant_id = b.tenant_id
   AND bs.buyer_id = b.id
   AND bs.deleted_at IS NULL
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND (NOT v_location_scoped OR m.buyer_id IS NOT NULL);

  CREATE TEMP TABLE _metrics_v2_customer_cohorts ON COMMIT DROP AS
  SELECT
    cm.buyer_id,
    MIN(c.name) AS cohort_name,
    COUNT(DISTINCT c.id)::bigint AS cohort_count
  FROM app.cohort_members cm
  JOIN app.cohorts c
    ON c.id = cm.cohort_id
   AND c.tenant_id = p_tenant_id
   AND c.deleted_at IS NULL
  JOIN _metrics_v2_customers_base b ON b.id = cm.buyer_id
  GROUP BY cm.buyer_id;

  CREATE TEMP TABLE _metrics_v2_customer_price_lists ON COMMIT DROP AS
  WITH candidate AS (
    SELECT
      pla.target_id AS buyer_id,
      pl.name,
      'direct'::text AS source,
      NULL::text AS cohort_name,
      pl.priority,
      pla.created_at,
      0 AS source_rank
    FROM app.price_list_assignments pla
    JOIN app.price_lists pl ON pl.id = pla.price_list_id AND pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL
    JOIN _metrics_v2_customers_base b ON b.id = pla.target_id
    WHERE pla.deleted_at IS NULL AND pla.target_type = 'buyer'
    UNION ALL
    SELECT
      cm.buyer_id,
      pl.name,
      'cohort'::text AS source,
      c.name AS cohort_name,
      pl.priority,
      pla.created_at,
      1 AS source_rank
    FROM app.price_list_assignments pla
    JOIN app.price_lists pl ON pl.id = pla.price_list_id AND pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL
    JOIN app.cohorts c ON c.id = pla.target_id AND c.tenant_id = p_tenant_id AND c.deleted_at IS NULL
    JOIN app.cohort_members cm ON cm.cohort_id = c.id
    JOIN _metrics_v2_customers_base b ON b.id = cm.buyer_id
    WHERE pla.deleted_at IS NULL AND pla.target_type = 'cohort'
  )
  SELECT buyer_id, name, source, cohort_name
  FROM (
    SELECT *, row_number() OVER (PARTITION BY buyer_id ORDER BY source_rank, priority DESC, created_at DESC NULLS LAST) AS rn
    FROM candidate
  ) ranked
  WHERE rn = 1;

  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE is_active AND (invoice_count_90d + estimate_count_90d + order_count_90d) > 0)::bigint,
    COUNT(*) FILTER (WHERE is_active AND (invoice_count_90d + estimate_count_90d + order_count_90d) = 0)::bigint,
    COUNT(*) FILTER (WHERE receivable_amount > 0)::bigint,
    COALESCE(SUM(invoice_value_90d), 0),
    COALESCE(SUM(prior_year_invoice_value_90d), 0),
    COALESCE(SUM(receivable_amount), 0),
    COUNT(*) FILTER (WHERE invoice_count_90d > 0)::bigint,
    COALESCE(SUM(overdue_amount), 0),
    COUNT(*) FILTER (WHERE overdue_amount > 0)::bigint,
    COALESCE(SUM(prior_year_invoice_value_90d) FILTER (WHERE is_active AND (invoice_count_90d + estimate_count_90d + order_count_90d) = 0), 0),
    MAX(source_watermark),
    MAX(computed_at)
  INTO v_total, v_active, v_dormant, v_dues_buyers, v_spend, v_prev_spend, v_outstanding,
    v_invoiced_customers, v_overdue_sum, v_overdue_customers, v_dormant_prior_year_value,
    v_source_watermark, v_computed_at
  FROM _metrics_v2_customers_base;

  SELECT COUNT(DISTINCT cohort_name)::bigint INTO v_cohort_count FROM _metrics_v2_customer_cohorts;

  DELETE FROM _metrics_v2_customers_base
  WHERE (p_query IS NOT NULL AND p_query <> '' AND (
      business_name NOT ILIKE '%' || p_query || '%'
      AND COALESCE(phone, '') NOT ILIKE '%' || p_query || '%'
      AND COALESCE(geography->>'city', '') NOT ILIKE '%' || p_query || '%'
      AND COALESCE(geography->>'state', '') NOT ILIKE '%' || p_query || '%'
    ))
    OR (COALESCE(array_length(p_statuses, 1), 0) > 0 AND NOT (
      ('Active' = ANY (p_statuses) AND is_active AND (invoice_count_90d + estimate_count_90d + order_count_90d) > 0)
      OR ('Inactive' = ANY (p_statuses) AND NOT is_active)
      OR ('Dormant' = ANY (p_statuses) AND is_active AND (invoice_count_90d + estimate_count_90d + order_count_90d) = 0)
    ))
    OR (COALESCE(array_length(p_dues, 1), 0) > 0 AND NOT (
      ('Due' = ANY (p_dues) AND receivable_amount > 0)
      OR ('Overdue' = ANY (p_dues) AND overdue_amount > 0)
    ))
    OR (
      p_cursor_name IS NOT NULL
      AND p_cursor_id IS NOT NULL
      AND NOT (business_name > p_cursor_name OR (business_name = p_cursor_name AND id > p_cursor_id))
    );

  SELECT COUNT(*) INTO v_total FROM _metrics_v2_customers_base;

  WITH page_rows AS (
    SELECT * FROM _metrics_v2_customers_base ORDER BY business_name ASC, id ASC LIMIT v_limit + 1
  ),
  visible_rows AS (
    SELECT * FROM page_rows ORDER BY business_name ASC, id ASC LIMIT v_limit
  ),
  numbered_rows AS (
    SELECT r.*, row_number() OVER (ORDER BY r.business_name ASC, r.id ASC) AS row_ordinal
    FROM visible_rows r
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'business_name', r.business_name,
    'tier', r.tier,
    'phone', r.phone,
    'gst_treatment', r.gst_treatment,
    'zoho_status', r.zoho_status,
    'is_active', r.is_active,
    'city', COALESCE(r.geography->>'city', 'Unknown'),
    'state', r.geography->>'state',
    'cohort', COALESCE(c.cohort_name, '—'),
    'spend_mtd', r.invoice_value_90d,
    'spend_prev_mtd', r.prior_year_invoice_value_90d,
    'growth_pct', CASE WHEN r.prior_year_invoice_value_90d > 0 THEN ROUND(((r.invoice_value_90d - r.prior_year_invoice_value_90d) / r.prior_year_invoice_value_90d) * 100, 1) WHEN r.invoice_value_90d > 0 THEN 100 ELSE 0 END,
    'orders_mtd', r.order_count_90d,
    'last_order_at', r.last_order_at,
    'credit_limit', r.credit_limit,
    'credit_used', r.receivable_amount,
    'dues', r.receivable_amount,
    'status', jsonb_build_object(
      'label', CASE WHEN NOT r.is_active THEN 'Inactive' WHEN r.overdue_amount > 0 OR r.receivable_amount > r.credit_limit THEN 'Needs follow-up' WHEN (r.invoice_count_90d + r.estimate_count_90d + r.order_count_90d) = 0 THEN 'Dormant' ELSE 'Healthy' END,
      'tone', CASE WHEN NOT r.is_active THEN 'neutral' WHEN r.overdue_amount > 0 OR r.receivable_amount > r.credit_limit THEN 'warning' WHEN (r.invoice_count_90d + r.estimate_count_90d + r.order_count_90d) = 0 THEN 'danger' ELSE 'success' END
    ),
    'avatar', jsonb_build_object(
      'initials', upper(left(regexp_replace(r.business_name, '[^[:alnum:]]', '', 'g'), 2)),
      'hue', CASE (r.row_ordinal - 1) % 3 WHEN 0 THEN 'teal' WHEN 1 THEN 'ember' ELSE 'cream' END
    ),
    'active_price_list', CASE WHEN pl.name IS NULL THEN NULL ELSE jsonb_build_object('name', pl.name, 'source', pl.source, 'cohort_name', pl.cohort_name) END,
    'whatsapp_opted_out', r.whatsapp_opt_out_at IS NOT NULL
  ) ORDER BY r.business_name ASC, r.id ASC), '[]'::jsonb)
  INTO v_rows
  FROM numbered_rows r
  LEFT JOIN _metrics_v2_customer_cohorts c ON c.buyer_id = r.id
  LEFT JOIN _metrics_v2_customer_price_lists pl ON pl.buyer_id = r.id;

  SELECT r.business_name, r.id
  INTO v_next_name, v_next_id
  FROM (
    SELECT business_name, id, row_number() OVER (ORDER BY business_name ASC, id ASC) AS rn
    FROM _metrics_v2_customers_base
  ) r
  WHERE r.rn = v_limit;

  IF v_total > v_limit AND v_next_name IS NOT NULL AND v_next_id IS NOT NULL THEN
    v_next_cursor := jsonb_build_object('n', v_next_name, 'i', v_next_id);
  END IF;

  -- Action 1: Collect overdue — buyer / overdue amount / invoice count / days overdue.
  WITH ranked AS (
    SELECT
      b.*,
      COALESCE(c.cohort_name, '—') AS cohort_name,
      CASE WHEN prior_year_invoice_value_90d > 0 THEN ROUND(((invoice_value_90d - prior_year_invoice_value_90d) / prior_year_invoice_value_90d) * 100, 1) WHEN invoice_value_90d > 0 THEN 100 ELSE 0 END AS growth_pct
    FROM _metrics_v2_customers_base b
    LEFT JOIN _metrics_v2_customer_cohorts c ON c.buyer_id = b.id
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key), '[]'::jsonb)
  INTO v_needs_call
  FROM (
    SELECT
      row_number() OVER () AS sort_key,
      jsonb_build_object(
        'id', id,
        'business_name', business_name,
        'tier', tier,
        'phone', phone,
        'city', COALESCE(geography->>'city', 'Unknown'),
        'state', geography->>'state',
        'cohort', cohort_name,
        'spend_mtd', invoice_value_90d,
        'spend_prev_mtd', prior_year_invoice_value_90d,
        'growth_pct', growth_pct,
        'orders_mtd', order_count_90d,
        'invoice_count', invoice_count_90d,
        'days_overdue', CASE WHEN oldest_due_at IS NOT NULL THEN GREATEST(0, EXTRACT(DAY FROM (p_as_of - oldest_due_at))::int) ELSE NULL END,
        'last_order_at', last_order_at,
        'last_order_label', CASE WHEN last_order_at IS NULL THEN 'Never' ELSE to_char(last_order_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') END,
        'credit_limit', credit_limit,
        'credit_used', receivable_amount,
        'dues', receivable_amount,
        'status', jsonb_build_object('label', 'Needs follow-up', 'tone', 'warning'),
        'avatar', jsonb_build_object('initials', upper(left(regexp_replace(business_name, '[^[:alnum:]]', '', 'g'), 2)), 'hue', 'teal'),
        'active_price_list', NULL,
        'whatsapp_opted_out', whatsapp_opt_out_at IS NOT NULL
      ) AS item
    FROM ranked
    WHERE overdue_amount > 0 OR receivable_amount > credit_limit OR (is_active AND invoice_count_90d + estimate_count_90d + order_count_90d = 0)
    ORDER BY overdue_amount DESC, receivable_amount DESC, business_name ASC
    LIMIT 3
  ) s;

  -- Action 2: Win back inactive customers — buyer / prior-period value / phone /
  -- days since last activity. Ranked by inactivity (longest-inactive first),
  -- tie-broken by prior-year trailing-90d value — not growth_pct, which
  -- measures demand *momentum* and is unrelated to "who has gone quiet."
  WITH ranked AS (
    SELECT
      b.*,
      COALESCE(c.cohort_name, '—') AS cohort_name,
      CASE WHEN last_order_at IS NULL THEN NULL ELSE GREATEST(0, EXTRACT(DAY FROM (p_as_of - last_order_at))::int) END AS days_inactive
    FROM _metrics_v2_customers_base b
    LEFT JOIN _metrics_v2_customer_cohorts c ON c.buyer_id = b.id
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key), '[]'::jsonb)
  INTO v_win_back
  FROM (
    SELECT
      row_number() OVER () AS sort_key,
      jsonb_build_object(
        'id', id,
        'business_name', business_name,
        'tier', tier,
        'phone', phone,
        'city', COALESCE(geography->>'city', 'Unknown'),
        'state', geography->>'state',
        'cohort', cohort_name,
        'spend_mtd', invoice_value_90d,
        'spend_prev_mtd', prior_year_invoice_value_90d,
        'prior_value', prior_year_invoice_value_90d,
        'orders_mtd', order_count_90d,
        'last_order_at', last_order_at,
        'last_order_label', CASE WHEN last_order_at IS NULL THEN 'Never' ELSE to_char(last_order_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') END,
        'days_inactive', days_inactive,
        'credit_limit', credit_limit,
        'credit_used', receivable_amount,
        'dues', receivable_amount,
        'status', jsonb_build_object('label', 'Inactive', 'tone', 'neutral'),
        'avatar', jsonb_build_object('initials', upper(left(regexp_replace(business_name, '[^[:alnum:]]', '', 'g'), 2)), 'hue', 'cream'),
        'active_price_list', NULL,
        'whatsapp_opted_out', whatsapp_opt_out_at IS NOT NULL
      ) AS item
    FROM ranked
    WHERE is_active AND (invoice_count_90d + estimate_count_90d + order_count_90d) = 0
      AND (days_inactive IS NULL OR days_inactive > 90)
    ORDER BY days_inactive DESC NULLS FIRST, prior_year_invoice_value_90d DESC, business_name ASC
    LIMIT 3
  ) s;

  RETURN jsonb_build_object(
    'as_of', p_as_of,
    'table_period_owner', 'none',
    'headline_period', 'trailing_90_days',
    'action_period', 'now',
    'commercial_horizon_days', 90,
    'source_watermark', v_source_watermark,
    'computed_at', v_computed_at,
    'period', jsonb_build_object(
      'selected', 'last90',
      'label', 'Trailing 90 days',
      'current_label', 'Trailing 90 days',
      'previous_label', 'prior-year trailing 90 days'
    ),
    'kpis', jsonb_build_object(
      'total', v_total,
      'cohort_count', COALESCE(v_cohort_count, 0),
      'active', v_active,
      'active_pct', CASE WHEN v_total > 0 THEN ROUND((v_active::numeric / v_total::numeric) * 100, 1) ELSE 0 END,
      'spend_mtd', v_spend,
      'spend_growth_pct', CASE WHEN v_prev_spend > 0 THEN ROUND(((v_spend - v_prev_spend) / v_prev_spend) * 100, 1) WHEN v_spend > 0 THEN 100 ELSE 0 END,
      'dormant_over_30d', v_dormant,
      'outstanding_dues', v_outstanding,
      'buyers_with_dues', v_dues_buyers,
      'invoiced_customer_count', v_invoiced_customers,
      'overdue_sum', v_overdue_sum,
      'overdue_customer_count', v_overdue_customers,
      'dormant_prior_year_value', v_dormant_prior_year_value
    ),
    'callouts', jsonb_build_object(
      'needs_call', v_needs_call,
      'win_back', v_win_back
    ),
    'buyers', v_rows,
    'filters', jsonb_build_object(
      'groups', jsonb_build_array(
        jsonb_build_object('key', 'status', 'label', 'Status', 'options', jsonb_build_array(
          jsonb_build_object('value', 'Active', 'label', 'Active'),
          jsonb_build_object('value', 'Inactive', 'label', 'Inactive'),
          jsonb_build_object('value', 'Dormant', 'label', 'Dormant')
        )),
        jsonb_build_object('key', 'due', 'label', 'Due', 'options', jsonb_build_array(
          jsonb_build_object('value', 'Due', 'label', 'Due'),
          jsonb_build_object('value', 'Overdue', 'label', 'Overdue')
        ))
      )
    ),
    'total', v_total,
    'nextCursor', v_next_cursor
  );
END;
$$;
