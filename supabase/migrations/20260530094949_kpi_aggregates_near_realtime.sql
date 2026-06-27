-- Near-real-time KPI aggregates for faster seller landing reads.

CREATE TABLE IF NOT EXISTS app.kpi_tenant_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  day date NOT NULL,
  orders_count integer NOT NULL DEFAULT 0,
  buyers_count integer NOT NULL DEFAULT 0,
  gmv numeric(14,2) NOT NULL DEFAULT 0,
  items_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  external_ref text,
  UNIQUE (tenant_id, day)
);

CREATE TABLE IF NOT EXISTS app.kpi_product_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  tenant_product_id uuid NOT NULL,
  day date NOT NULL,
  units_sold integer NOT NULL DEFAULT 0,
  revenue numeric(14,2) NOT NULL DEFAULT 0,
  on_hand numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  external_ref text,
  UNIQUE (tenant_id, tenant_product_id, day)
);

CREATE INDEX IF NOT EXISTS idx_kpi_tenant_daily_lookup
  ON app.kpi_tenant_daily (tenant_id, day)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kpi_product_daily_lookup
  ON app.kpi_product_daily (tenant_id, tenant_product_id, day)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_date_status
  ON app.orders (tenant_id, placed_at, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_order_product
  ON app.order_items (order_id, tenant_product_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_product_live
  ON app.tenant_inventory (tenant_product_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_catalogs_tenant_created
  ON app.campaigns (tenant_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_buyers_tenant_active
  ON app.buyers (tenant_id, is_active)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kpi_tenant_daily_updated_at ON app.kpi_tenant_daily;
CREATE TRIGGER trg_kpi_tenant_daily_updated_at
BEFORE UPDATE ON app.kpi_tenant_daily
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

DROP TRIGGER IF EXISTS trg_kpi_product_daily_updated_at ON app.kpi_product_daily;
CREATE TRIGGER trg_kpi_product_daily_updated_at
BEFORE UPDATE ON app.kpi_product_daily
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE OR REPLACE FUNCTION app.refresh_kpi_tenant_daily(p_tenant_id uuid, p_day date)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO app.kpi_tenant_daily (tenant_id, day, orders_count, buyers_count, gmv, items_count)
  SELECT
    p_tenant_id,
    p_day,
    COUNT(DISTINCT o.id)::int,
    COUNT(DISTINCT o.buyer_id)::int,
    COALESCE(SUM(o.total_amount), 0)::numeric(14,2),
    COALESCE(SUM(oi.qty), 0)::int
  FROM app.orders o
  LEFT JOIN app.order_items oi
    ON oi.order_id = o.id
   AND oi.deleted_at IS NULL
  WHERE o.tenant_id = p_tenant_id
    AND o.deleted_at IS NULL
    AND o.status <> 'cancelled'
    AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_day
  ON CONFLICT (tenant_id, day)
  DO UPDATE SET
    orders_count = EXCLUDED.orders_count,
    buyers_count = EXCLUDED.buyers_count,
    gmv = EXCLUDED.gmv,
    items_count = EXCLUDED.items_count,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_kpi_product_daily(p_tenant_id uuid, p_tenant_product_id uuid, p_day date)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO app.kpi_product_daily (tenant_id, tenant_product_id, day, units_sold, revenue, on_hand)
  SELECT
    p_tenant_id,
    p_tenant_product_id,
    p_day,
    COALESCE(SUM(oi.qty), 0)::int,
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COALESCE((
      SELECT SUM(ti.qty_available)
      FROM app.tenant_inventory ti
      WHERE ti.tenant_product_id = p_tenant_product_id
        AND ti.deleted_at IS NULL
    ), 0)::numeric(14,2)
  FROM app.order_items oi
  JOIN app.orders o ON o.id = oi.order_id
  WHERE o.tenant_id = p_tenant_id
    AND o.deleted_at IS NULL
    AND o.status <> 'cancelled'
    AND oi.tenant_product_id = p_tenant_product_id
    AND oi.deleted_at IS NULL
    AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_day
  ON CONFLICT (tenant_id, tenant_product_id, day)
  DO UPDATE SET
    units_sold = EXCLUDED.units_sold,
    revenue = EXCLUDED.revenue,
    on_hand = EXCLUDED.on_hand,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_kpi_from_orders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_tenant uuid;
  target_day date;
BEGIN
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  target_day := (COALESCE(NEW.placed_at, OLD.placed_at) AT TIME ZONE 'Asia/Kolkata')::date;

  IF target_tenant IS NOT NULL AND target_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_tenant_daily(target_tenant, target_day);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_refresh_kpi ON app.orders;
CREATE TRIGGER trg_orders_refresh_kpi
AFTER INSERT OR UPDATE OR DELETE ON app.orders
FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_kpi_from_orders();

CREATE OR REPLACE FUNCTION app.trg_refresh_kpi_from_order_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_order_id uuid;
  target_product_id uuid;
  target_tenant uuid;
  target_day date;
BEGIN
  target_order_id := COALESCE(NEW.order_id, OLD.order_id);
  target_product_id := COALESCE(NEW.tenant_product_id, OLD.tenant_product_id);

  SELECT o.tenant_id, (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date
    INTO target_tenant, target_day
  FROM app.orders o
  WHERE o.id = target_order_id;

  IF target_tenant IS NOT NULL AND target_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_tenant_daily(target_tenant, target_day);
    IF target_product_id IS NOT NULL THEN
      PERFORM app.refresh_kpi_product_daily(target_tenant, target_product_id, target_day);
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_refresh_kpi ON app.order_items;
CREATE TRIGGER trg_order_items_refresh_kpi
AFTER INSERT OR UPDATE OR DELETE ON app.order_items
FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_kpi_from_order_items();

CREATE OR REPLACE FUNCTION app.trg_refresh_kpi_from_inventory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_product_id uuid;
  target_tenant uuid;
  target_day date;
BEGIN
  target_product_id := COALESCE(NEW.tenant_product_id, OLD.tenant_product_id);
  target_day := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT tp.tenant_id INTO target_tenant
  FROM app.tenant_products tp
  WHERE tp.id = target_product_id;

  IF target_tenant IS NOT NULL AND target_product_id IS NOT NULL THEN
    PERFORM app.refresh_kpi_product_daily(target_tenant, target_product_id, target_day);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_refresh_kpi ON app.tenant_inventory;
CREATE TRIGGER trg_inventory_refresh_kpi
AFTER INSERT OR UPDATE OR DELETE ON app.tenant_inventory
FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_kpi_from_inventory();

CREATE OR REPLACE FUNCTION app.rebuild_kpi_aggregates_for_recent_days(p_days int DEFAULT 62)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT generate_series(
      ((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days),
      (now() AT TIME ZONE 'Asia/Kolkata')::date,
      interval '1 day'
    )::date
  LOOP
    INSERT INTO app.kpi_tenant_daily (tenant_id, day, orders_count, buyers_count, gmv, items_count)
    SELECT
      o.tenant_id,
      d,
      COUNT(DISTINCT o.id)::int,
      COUNT(DISTINCT o.buyer_id)::int,
      COALESCE(SUM(o.total_amount), 0)::numeric(14,2),
      COALESCE(SUM(oi.qty), 0)::int
    FROM app.orders o
    LEFT JOIN app.order_items oi
      ON oi.order_id = o.id
     AND oi.deleted_at IS NULL
    WHERE o.deleted_at IS NULL
      AND o.status <> 'cancelled'
      AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = d
    GROUP BY o.tenant_id
    ON CONFLICT (tenant_id, day)
    DO UPDATE SET
      orders_count = EXCLUDED.orders_count,
      buyers_count = EXCLUDED.buyers_count,
      gmv = EXCLUDED.gmv,
      items_count = EXCLUDED.items_count,
      updated_at = now();
  END LOOP;
END;
$$;

-- Seed recent KPI rows once at migration time.
SELECT app.rebuild_kpi_aggregates_for_recent_days(62);
