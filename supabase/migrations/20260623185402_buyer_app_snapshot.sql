-- EP-13-013: Buyer App analytics snapshot tables.
-- Pattern mirrors 20260622150000_perf_snapshot_tables.sql.
--
-- buyer_app_daily    — daily grain (tenant_id, snapshot_date). Drives KPI tiles across periods.
-- buyer_app_snapshot — single live row per tenant. Drives callouts + 2×2 card grid.
--
-- Both refresh functions check app.sync_trigger_bypass_active() to skip during bulk imports.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. buyer_app_daily — time-series grain
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.buyer_app_daily (
  tenant_id                   uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  snapshot_date               date NOT NULL,
  app_gmv                     numeric NOT NULL DEFAULT 0,
  app_orders                  bigint  NOT NULL DEFAULT 0,
  active_buyers               bigint  NOT NULL DEFAULT 0,
  app_estimates_value         numeric NOT NULL DEFAULT 0,
  app_estimates_count         bigint  NOT NULL DEFAULT 0,
  converted_to_order_value    numeric NOT NULL DEFAULT 0,
  converted_to_order_count    bigint  NOT NULL DEFAULT 0,
  invoiced_value              numeric NOT NULL DEFAULT 0,
  invoiced_count              bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, snapshot_date)
);

ALTER TABLE app.buyer_app_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read buyer_app_daily"
  ON app.buyer_app_daily FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

CREATE OR REPLACE FUNCTION app.refresh_buyer_app_daily(p_tenant_id uuid, p_date date)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  INSERT INTO app.buyer_app_daily (
    tenant_id, snapshot_date,
    app_gmv, app_orders, active_buyers,
    app_estimates_value, app_estimates_count,
    converted_to_order_value, converted_to_order_count,
    invoiced_value, invoiced_count
  )
  SELECT
    p_tenant_id,
    p_date,
    COALESCE((SELECT SUM(total_amount) FROM app.orders
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND placed_at::date = p_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM app.orders
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND placed_at::date = p_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.orders
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND placed_at::date = p_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(total_amount) FROM app.estimates
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND created_at::date = p_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM app.estimates
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND created_at::date = p_date AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(total_amount) FROM app.orders
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND placed_at::date = p_date
                AND status IN ('confirmed','partially_dispatched','dispatched','delivered','invoiced','partially_invoiced')
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM app.orders
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND placed_at::date = p_date
                AND status IN ('confirmed','partially_dispatched','dispatched','delivered','invoiced','partially_invoiced')
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(i.total_amount)
              FROM app.invoices i JOIN app.estimates e ON i.estimate_id = e.id
              WHERE i.tenant_id = p_tenant_id AND e.source = 'buyer_app'
                AND i.invoice_date::date = p_date AND i.deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*)
              FROM app.invoices i JOIN app.estimates e ON i.estimate_id = e.id
              WHERE i.tenant_id = p_tenant_id AND e.source = 'buyer_app'
                AND i.invoice_date::date = p_date AND i.deleted_at IS NULL), 0)
  ON CONFLICT (tenant_id, snapshot_date) DO UPDATE SET
    app_gmv                  = EXCLUDED.app_gmv,
    app_orders               = EXCLUDED.app_orders,
    active_buyers            = EXCLUDED.active_buyers,
    app_estimates_value      = EXCLUDED.app_estimates_value,
    app_estimates_count      = EXCLUDED.app_estimates_count,
    converted_to_order_value = EXCLUDED.converted_to_order_value,
    converted_to_order_count = EXCLUDED.converted_to_order_count,
    invoiced_value           = EXCLUDED.invoiced_value,
    invoiced_count           = EXCLUDED.invoiced_count;
$$;

CREATE OR REPLACE FUNCTION app.trg_orders_refresh_buyer_app_daily()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant uuid;
  target_date   date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' OR NEW.source = 'buyer_app' OR OLD.source = 'buyer_app' THEN
    target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    target_date   := COALESCE(NEW.placed_at, OLD.placed_at)::date;
    PERFORM app.refresh_buyer_app_daily(target_tenant, target_date);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_refresh_buyer_app_daily ON app.orders;
CREATE TRIGGER trg_orders_refresh_buyer_app_daily
  AFTER INSERT OR UPDATE OR DELETE ON app.orders
  FOR EACH ROW EXECUTE FUNCTION app.trg_orders_refresh_buyer_app_daily();

CREATE OR REPLACE FUNCTION app.trg_estimates_refresh_buyer_app_daily()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant uuid;
  target_date   date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' OR NEW.source = 'buyer_app' OR OLD.source = 'buyer_app' THEN
    target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    target_date   := COALESCE(NEW.created_at, OLD.created_at)::date;
    PERFORM app.refresh_buyer_app_daily(target_tenant, target_date);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_estimates_refresh_buyer_app_daily ON app.estimates;
CREATE TRIGGER trg_estimates_refresh_buyer_app_daily
  AFTER INSERT OR UPDATE OR DELETE ON app.estimates
  FOR EACH ROW EXECUTE FUNCTION app.trg_estimates_refresh_buyer_app_daily();

CREATE OR REPLACE FUNCTION app.trg_invoices_refresh_buyer_app_daily()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant uuid;
  target_date   date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  target_date   := COALESCE(NEW.invoice_date, OLD.invoice_date, now())::date;
  PERFORM app.refresh_buyer_app_daily(target_tenant, target_date);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_refresh_buyer_app_daily ON app.invoices;
CREATE TRIGGER trg_invoices_refresh_buyer_app_daily
  AFTER INSERT OR UPDATE OR DELETE ON app.invoices
  FOR EACH ROW EXECUTE FUNCTION app.trg_invoices_refresh_buyer_app_daily();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. buyer_app_snapshot — live single-row per tenant
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.buyer_app_snapshot (
  tenant_id                   uuid PRIMARY KEY REFERENCES app.tenants(id) ON DELETE CASCADE,
  -- Funnel (Card 1)
  enabled_buyers              bigint  NOT NULL DEFAULT 0,
  total_buyers                bigint  NOT NULL DEFAULT 0,
  opened_app_mtd              bigint  NOT NULL DEFAULT 0,
  ordered_mtd                 bigint  NOT NULL DEFAULT 0,
  repeat_mtd                  bigint  NOT NULL DEFAULT 0,
  -- GMV conversion funnel (Card 2 + KPI tiles)
  app_gmv_mtd                 numeric NOT NULL DEFAULT 0,
  app_orders_mtd              bigint  NOT NULL DEFAULT 0,
  total_gmv_mtd               numeric NOT NULL DEFAULT 0,
  estimates_app_value_mtd     numeric NOT NULL DEFAULT 0,
  estimates_app_count_mtd     bigint  NOT NULL DEFAULT 0,
  converted_order_value_mtd   numeric NOT NULL DEFAULT 0,
  converted_order_count_mtd   bigint  NOT NULL DEFAULT 0,
  invoiced_app_value_mtd      numeric NOT NULL DEFAULT 0,
  invoiced_app_count_mtd      bigint  NOT NULL DEFAULT 0,
  -- Callout lists + card lists (bounded JSONB arrays)
  not_ordering_buyers         jsonb   NOT NULL DEFAULT '[]',
  top_app_buyers_callout      jsonb   NOT NULL DEFAULT '[]',
  no_app_buyers               jsonb   NOT NULL DEFAULT '[]',
  top_app_buyers_card         jsonb   NOT NULL DEFAULT '[]',
  top_locations               jsonb   NOT NULL DEFAULT '[]',
  refreshed_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.buyer_app_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read buyer_app_snapshot"
  ON app.buyer_app_snapshot FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

CREATE OR REPLACE FUNCTION app.refresh_buyer_app_snapshot(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_month_start timestamptz := date_trunc('month', now());
  v_month_end   timestamptz := date_trunc('month', now()) + interval '1 month';
  v_30d_ago     timestamptz := now() - interval '30 days';
BEGIN
  INSERT INTO app.buyer_app_snapshot (
    tenant_id,
    enabled_buyers, total_buyers, opened_app_mtd, ordered_mtd, repeat_mtd,
    app_gmv_mtd, app_orders_mtd, total_gmv_mtd,
    estimates_app_value_mtd, estimates_app_count_mtd,
    converted_order_value_mtd, converted_order_count_mtd,
    invoiced_app_value_mtd, invoiced_app_count_mtd,
    not_ordering_buyers, top_app_buyers_callout, no_app_buyers,
    top_app_buyers_card, top_locations,
    refreshed_at
  )
  SELECT
    p_tenant_id,
    (SELECT COUNT(DISTINCT bu.buyer_id)
     FROM app.buyer_users bu JOIN app.buyers b ON b.id = bu.buyer_id
     WHERE b.tenant_id = p_tenant_id AND bu.is_active = true AND b.deleted_at IS NULL),
    (SELECT COUNT(*) FROM app.buyers
     WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active = true),
    (SELECT COUNT(DISTINCT bu.buyer_id)
     FROM app.buyer_users bu JOIN app.buyers b ON b.id = bu.buyer_id
     WHERE b.tenant_id = p_tenant_id AND bu.is_active = true
       AND bu.updated_at >= v_month_start AND b.deleted_at IS NULL),
    (SELECT COUNT(DISTINCT buyer_id) FROM app.orders
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM (
       SELECT buyer_id FROM app.orders
       WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
         AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL
       GROUP BY buyer_id HAVING COUNT(*) >= 2
     ) r),
    COALESCE((SELECT SUM(total_amount) FROM app.orders
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL), 0),
    (SELECT COUNT(*) FROM app.orders
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL),
    COALESCE((SELECT SUM(total_amount) FROM app.orders
     WHERE tenant_id = p_tenant_id
       AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(total_amount) FROM app.estimates
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND created_at >= v_month_start AND created_at < v_month_end AND deleted_at IS NULL), 0),
    (SELECT COUNT(*) FROM app.estimates
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND created_at >= v_month_start AND created_at < v_month_end AND deleted_at IS NULL),
    COALESCE((SELECT SUM(total_amount) FROM app.orders
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND placed_at >= v_month_start AND placed_at < v_month_end
       AND status IN ('confirmed','partially_dispatched','dispatched','delivered','invoiced','partially_invoiced')
       AND deleted_at IS NULL), 0),
    (SELECT COUNT(*) FROM app.orders
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND placed_at >= v_month_start AND placed_at < v_month_end
       AND status IN ('confirmed','partially_dispatched','dispatched','delivered','invoiced','partially_invoiced')
       AND deleted_at IS NULL),
    COALESCE((SELECT SUM(i.total_amount)
     FROM app.invoices i JOIN app.estimates e ON i.estimate_id = e.id
     WHERE i.tenant_id = p_tenant_id AND e.source = 'buyer_app'
       AND i.invoice_date >= v_month_start AND i.invoice_date < v_month_end
       AND i.deleted_at IS NULL), 0),
    (SELECT COUNT(*)
     FROM app.invoices i JOIN app.estimates e ON i.estimate_id = e.id
     WHERE i.tenant_id = p_tenant_id AND e.source = 'buyer_app'
       AND i.invoice_date >= v_month_start AND i.invoice_date < v_month_end
       AND i.deleted_at IS NULL),
    -- not_ordering_buyers: buyers with buyer_users but 0 app orders in 30d (max 3)
    COALESCE((
      SELECT jsonb_agg(row_to_json(s) ORDER BY s.days_inactive DESC)
      FROM (
        SELECT b.id AS buyer_id, b.name,
          upper(left(b.name, 2)) AS initials,
          to_char(MIN(bu.created_at), 'DD Mon YYYY') AS enabled_date,
          EXTRACT(DAY FROM now() - COALESCE(MAX(o.placed_at), MIN(bu.created_at)))::int AS days_inactive
        FROM app.buyers b
        JOIN app.buyer_users bu ON bu.buyer_id = b.id AND bu.is_active = true
        LEFT JOIN app.orders o ON o.buyer_id = b.id AND o.source = 'buyer_app'
          AND o.placed_at >= v_30d_ago AND o.deleted_at IS NULL
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND b.is_active = true
        GROUP BY b.id, b.name
        HAVING MAX(o.id) IS NULL
        ORDER BY days_inactive DESC
        LIMIT 3
      ) s
    ), '[]'),
    -- top_app_buyers_callout: top 2 by app GMV MTD
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT b.id AS buyer_id, b.name,
          upper(left(b.name, 2)) AS initials,
          COALESCE(SUM(o.total_amount), 0) AS gmv,
          COUNT(o.id) AS orders
        FROM app.buyers b
        JOIN app.orders o ON o.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
          AND o.source = 'buyer_app'
          AND o.placed_at >= v_month_start AND o.placed_at < v_month_end
          AND o.deleted_at IS NULL
        GROUP BY b.id, b.name
        ORDER BY gmv DESC LIMIT 2
      ) s
    ), '[]'),
    -- no_app_buyers: top 3 offline buyers with no buyer_users row
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT b.id AS buyer_id, b.name,
          upper(left(b.name, 2)) AS initials,
          COALESCE(SUM(o.total_amount), 0) AS offline_gmv
        FROM app.buyers b
        LEFT JOIN app.buyer_users bu ON bu.buyer_id = b.id AND bu.is_active = true
        LEFT JOIN app.orders o ON o.buyer_id = b.id
          AND o.placed_at >= v_month_start AND o.placed_at < v_month_end
          AND o.deleted_at IS NULL
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND b.is_active = true
          AND bu.id IS NULL
        GROUP BY b.id, b.name
        ORDER BY offline_gmv DESC LIMIT 3
      ) s
    ), '[]'),
    -- top_app_buyers_card: top 5 by app GMV MTD (with city)
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT b.id AS buyer_id, b.name,
          upper(left(b.name, 2)) AS initials,
          COALESCE(b.city, '') AS city,
          COALESCE(SUM(o.total_amount), 0) AS gmv,
          COUNT(o.id) AS orders
        FROM app.buyers b
        JOIN app.orders o ON o.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
          AND o.source = 'buyer_app'
          AND o.placed_at >= v_month_start AND o.placed_at < v_month_end
          AND o.deleted_at IS NULL
        GROUP BY b.id, b.name, b.city
        ORDER BY gmv DESC LIMIT 5
      ) s
    ), '[]'),
    -- top_locations: top 5 by app GMV MTD
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT l.id AS location_id, l.name,
          COUNT(o.id) AS app_orders,
          COALESCE(SUM(o.total_amount), 0) AS app_gmv,
          ROUND(100.0 * COALESCE(SUM(o.total_amount), 0) /
            NULLIF((SELECT SUM(total_amount) FROM app.orders
                    WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                      AND placed_at >= v_month_start AND placed_at < v_month_end
                      AND deleted_at IS NULL), 0), 1) AS share_pct
        FROM app.locations l
        JOIN app.orders o ON o.location_id = l.id
        WHERE l.tenant_id = p_tenant_id AND l.deleted_at IS NULL
          AND o.source = 'buyer_app'
          AND o.placed_at >= v_month_start AND o.placed_at < v_month_end
          AND o.deleted_at IS NULL
        GROUP BY l.id, l.name
        ORDER BY app_gmv DESC LIMIT 5
      ) s
    ), '[]'),
    now()
  ON CONFLICT (tenant_id) DO UPDATE SET
    enabled_buyers            = EXCLUDED.enabled_buyers,
    total_buyers              = EXCLUDED.total_buyers,
    opened_app_mtd            = EXCLUDED.opened_app_mtd,
    ordered_mtd               = EXCLUDED.ordered_mtd,
    repeat_mtd                = EXCLUDED.repeat_mtd,
    app_gmv_mtd               = EXCLUDED.app_gmv_mtd,
    app_orders_mtd            = EXCLUDED.app_orders_mtd,
    total_gmv_mtd             = EXCLUDED.total_gmv_mtd,
    estimates_app_value_mtd   = EXCLUDED.estimates_app_value_mtd,
    estimates_app_count_mtd   = EXCLUDED.estimates_app_count_mtd,
    converted_order_value_mtd = EXCLUDED.converted_order_value_mtd,
    converted_order_count_mtd = EXCLUDED.converted_order_count_mtd,
    invoiced_app_value_mtd    = EXCLUDED.invoiced_app_value_mtd,
    invoiced_app_count_mtd    = EXCLUDED.invoiced_app_count_mtd,
    not_ordering_buyers       = EXCLUDED.not_ordering_buyers,
    top_app_buyers_callout    = EXCLUDED.top_app_buyers_callout,
    no_app_buyers             = EXCLUDED.no_app_buyers,
    top_app_buyers_card       = EXCLUDED.top_app_buyers_card,
    top_locations             = EXCLUDED.top_locations,
    refreshed_at              = EXCLUDED.refreshed_at;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_buyer_app_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  PERFORM app.refresh_buyer_app_snapshot(target_tenant);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_refresh_buyer_app_snapshot ON app.orders;
CREATE TRIGGER trg_orders_refresh_buyer_app_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON app.orders
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_buyer_app_snapshot();

DROP TRIGGER IF EXISTS trg_buyer_users_refresh_buyer_app_snapshot ON app.buyer_users;
CREATE TRIGGER trg_buyer_users_refresh_buyer_app_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON app.buyer_users
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_buyer_app_snapshot();

DROP TRIGGER IF EXISTS trg_estimates_refresh_buyer_app_snapshot ON app.estimates;
CREATE TRIGGER trg_estimates_refresh_buyer_app_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON app.estimates
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_buyer_app_snapshot();

DROP TRIGGER IF EXISTS trg_invoices_refresh_buyer_app_snapshot ON app.invoices;
CREATE TRIGGER trg_invoices_refresh_buyer_app_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON app.invoices
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_buyer_app_snapshot();

CREATE INDEX IF NOT EXISTS idx_buyer_app_daily_tenant_date
  ON app.buyer_app_daily (tenant_id, snapshot_date DESC);
