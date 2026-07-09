-- Post-sync rebuild framework.
--
-- Creates per-tenant rebuild functions for every KPI daily table, an umbrella
-- function that rebuilds all snapshots + KPI tables for one tenant in a single
-- pass, and a trigger on integration_sync_jobs that fires it automatically
-- whenever a job transitions to 'completed'.
--
-- Design:
--   - Each rebuild function is a bulk INSERT/UPSERT per day (not per-row calls)
--     using the same GROUP BY SQL as the all-tenant versions, filtered to p_tenant_id.
--   - Day window is adaptive: 90 days for initial_* jobs, 2 days for incremental/manual.
--   - Cross-tenant safe: trigger fires with NEW.tenant_id so only that tenant is touched.
--   - Idempotent: all functions use ON CONFLICT DO UPDATE, safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════
-- PER-TENANT DAILY KPI REBUILD FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- rebuild_kpi_tenant_daily_for_tenant
-- Per-tenant variant of rebuild_kpi_aggregates_for_recent_days.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.rebuild_kpi_tenant_daily_for_tenant(
  p_tenant_id uuid,
  p_days      int DEFAULT 62
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
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
      p_tenant_id,
      d,
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
      AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = d
    ON CONFLICT (tenant_id, day) DO UPDATE SET
      orders_count = EXCLUDED.orders_count,
      buyers_count = EXCLUDED.buyers_count,
      gmv          = EXCLUDED.gmv,
      items_count  = EXCLUDED.items_count,
      updated_at   = now();
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- rebuild_kpi_brand_daily_for_tenant
-- Per-tenant variant of rebuild_kpi_brand_daily_recent.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.rebuild_kpi_brand_daily_for_tenant(
  p_tenant_id uuid,
  p_days      int DEFAULT 62
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
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
    INSERT INTO app.kpi_brand_daily (
      tenant_id, tenant_brand_id, day,
      gmv, orders_count, buyers_count, units_sold, updated_at
    )
    SELECT
      o.tenant_id,
      tp.tenant_brand_id,
      d,
      COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
      COUNT(DISTINCT o.id)::bigint,
      COUNT(DISTINCT o.buyer_id)::bigint,
      COALESCE(SUM(oi.qty), 0)::bigint,
      now()
    FROM app.order_items oi
    JOIN app.orders o          ON o.id  = oi.order_id
    JOIN app.tenant_products tp ON tp.id = oi.tenant_product_id
    WHERE o.tenant_id          = p_tenant_id
      AND o.deleted_at         IS NULL
      AND oi.deleted_at        IS NULL
      AND tp.deleted_at        IS NULL
      AND tp.tenant_brand_id   IS NOT NULL
      AND o.status NOT IN ('cancelled', 'draft')
      AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = d
    GROUP BY o.tenant_id, tp.tenant_brand_id
    ON CONFLICT (tenant_id, tenant_brand_id, day) DO UPDATE SET
      gmv          = EXCLUDED.gmv,
      orders_count = EXCLUDED.orders_count,
      buyers_count = EXCLUDED.buyers_count,
      units_sold   = EXCLUDED.units_sold,
      updated_at   = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- rebuild_kpi_category_daily_for_tenant
-- Per-tenant variant of rebuild_kpi_category_daily_recent.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.rebuild_kpi_category_daily_for_tenant(
  p_tenant_id uuid,
  p_days      int DEFAULT 62
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
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
    INSERT INTO app.kpi_category_daily (
      tenant_id, tenant_category_id, day,
      gmv, units_sold, orders_count, buyers_count, updated_at
    )
    SELECT
      o.tenant_id,
      tp.tenant_category_id,
      d,
      COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
      COALESCE(SUM(oi.qty), 0)::bigint,
      COUNT(DISTINCT o.id)::bigint,
      COUNT(DISTINCT o.buyer_id)::bigint,
      now()
    FROM app.order_items oi
    JOIN app.orders o          ON o.id  = oi.order_id
    JOIN app.tenant_products tp ON tp.id = oi.tenant_product_id
    WHERE o.tenant_id             = p_tenant_id
      AND o.deleted_at            IS NULL
      AND oi.deleted_at           IS NULL
      AND tp.deleted_at           IS NULL
      AND tp.tenant_category_id   IS NOT NULL
      AND o.status NOT IN ('cancelled', 'draft')
      AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = d
    GROUP BY o.tenant_id, tp.tenant_category_id
    ON CONFLICT (tenant_id, tenant_category_id, day) DO UPDATE SET
      gmv          = EXCLUDED.gmv,
      units_sold   = EXCLUDED.units_sold,
      orders_count = EXCLUDED.orders_count,
      buyers_count = EXCLUDED.buyers_count,
      updated_at   = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- rebuild_kpi_product_daily_for_tenant  (new — no all-tenant version exists)
-- Bulk UPSERT per day for products with sales activity. on_hand reflects current
-- inventory (same limitation as refresh_kpi_product_daily). Products with only
-- inventory changes (no sales) are kept current by the webhook dispatch path.
-- Sparse: only writes rows where units_sold > 0 or revenue > 0.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.rebuild_kpi_product_daily_for_tenant(
  p_tenant_id uuid,
  p_days      int DEFAULT 62
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
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
    INSERT INTO app.kpi_product_daily (
      tenant_id, tenant_product_id, day,
      units_sold, revenue, on_hand, updated_at
    )
    SELECT
      p_tenant_id,
      oi.tenant_product_id,
      d,
      COALESCE(SUM(oi.qty), 0)::int,
      COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
      COALESCE((
        SELECT SUM(ti.qty_available)
        FROM app.tenant_inventory ti
        WHERE ti.tenant_product_id = oi.tenant_product_id
          AND ti.deleted_at IS NULL
      ), 0)::numeric(14,2),
      now()
    FROM app.order_items oi
    JOIN app.orders o ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.status <> 'cancelled'
      AND oi.deleted_at IS NULL
      AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = d
    GROUP BY oi.tenant_product_id
    HAVING COALESCE(SUM(oi.qty), 0) > 0
        OR COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0) > 0
    ON CONFLICT (tenant_id, tenant_product_id, day) DO UPDATE SET
      units_sold = EXCLUDED.units_sold,
      revenue    = EXCLUDED.revenue,
      on_hand    = EXCLUDED.on_hand,
      updated_at = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- rebuild_kpi_location_daily_for_tenant  (new — no all-tenant version exists)
-- Bulk UPSERT per day for locations with order activity. Sparse: HAVING ensures
-- zero-order location-days are not written.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.rebuild_kpi_location_daily_for_tenant(
  p_tenant_id uuid,
  p_days      int DEFAULT 62
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
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
    INSERT INTO app.kpi_location_daily (
      tenant_id, location_id, day,
      orders_count, buyers_count, gmv, items_count, updated_at
    )
    SELECT
      p_tenant_id,
      o.location_id,
      d,
      COUNT(DISTINCT o.id)::int,
      COUNT(DISTINCT o.buyer_id)::int,
      COALESCE(SUM(o.total_amount), 0)::numeric(14,2),
      COALESCE(SUM(oi.qty), 0)::int,
      now()
    FROM app.orders o
    LEFT JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
    WHERE o.tenant_id    = p_tenant_id
      AND o.location_id  IS NOT NULL
      AND o.deleted_at   IS NULL
      AND o.status NOT IN ('cancelled', 'draft')
      AND (o.placed_at AT TIME ZONE 'Asia/Kolkata')::date = d
    GROUP BY o.location_id
    HAVING COUNT(DISTINCT o.id) > 0
    ON CONFLICT (tenant_id, location_id, day) DO UPDATE SET
      orders_count = EXCLUDED.orders_count,
      buyers_count = EXCLUDED.buyers_count,
      gmv          = EXCLUDED.gmv,
      items_count  = EXCLUDED.items_count,
      updated_at   = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- rebuild_buyer_app_daily_for_tenant
-- Loops N days calling refresh_buyer_app_daily. The existing function already
-- does a full UPSERT so no bulk-SQL rewrite is needed here.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.rebuild_buyer_app_daily_for_tenant(
  p_tenant_id uuid,
  p_days      int DEFAULT 2
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
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
    PERFORM app.refresh_buyer_app_daily(p_tenant_id, d);
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- UMBRELLA FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════

-- post_sync_rebuild: rebuild all snapshots and daily KPI tables for one tenant.
-- Called by the trigger below; can also be called manually for ad-hoc backfills.
--
-- Execution order:
--   1. Tenant-scoped snapshots (fast, single UPSERT each)
--   2. Location snapshots (one UPSERT per location — loop)
--   3. Daily KPI tables (bulk SQL per day × p_days iterations each)
--
-- p_days defaults to 2 (yesterday + today) for incremental syncs. Pass 90 for
-- initial syncs or a manual full backfill.
CREATE OR REPLACE FUNCTION app.post_sync_rebuild(p_tenant_id uuid, p_days int DEFAULT 2)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  loc RECORD;
BEGIN
  -- 7 tenant-scoped snapshots
  PERFORM app.refresh_estimates_snapshot(p_tenant_id);
  PERFORM app.refresh_invoices_snapshot(p_tenant_id);
  PERFORM app.refresh_customers_snapshot(p_tenant_id);
  PERFORM app.refresh_products_snapshot(p_tenant_id);
  PERFORM app.refresh_categories_snapshot(p_tenant_id);
  PERFORM app.refresh_brands_snapshot(p_tenant_id);
  PERFORM app.refresh_buyer_app_snapshot(p_tenant_id);

  -- Location snapshots (location-scoped, one per location)
  FOR loc IN
    SELECT id FROM app.locations
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_locations_snapshot(loc.id);
  END LOOP;

  -- Daily KPI tables (bulk per-day rebuilds)
  PERFORM app.rebuild_kpi_tenant_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_brand_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_category_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_product_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_location_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_buyer_app_daily_for_tenant(p_tenant_id, p_days);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: fire post_sync_rebuild on job completion
-- ═══════════════════════════════════════════════════════════════════════════

-- Adaptive day window:
--   initial_reference / initial_transactional → 90 days (full history on first load)
--   incremental / manual                      → 2 days  (yesterday + today, fast)
CREATE OR REPLACE FUNCTION app.trg_post_sync_rebuild()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
    PERFORM app.post_sync_rebuild(
      NEW.tenant_id,
      CASE NEW.job_type
        WHEN 'initial_reference'     THEN 90
        WHEN 'initial_transactional' THEN 90
        ELSE 2
      END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_integration_sync_jobs_post_rebuild ON app.integration_sync_jobs;
CREATE TRIGGER trg_integration_sync_jobs_post_rebuild
  AFTER UPDATE ON app.integration_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION app.trg_post_sync_rebuild();
