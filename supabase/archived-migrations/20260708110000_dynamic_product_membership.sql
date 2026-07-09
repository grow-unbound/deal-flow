-- Phase 3 & 4: Dynamic campaign product membership (inventory-driven) +
-- dynamic price-list product inclusion.
-- Adds stock_in_events audit table, inventory triggers, SECURITY DEFINER
-- evaluation functions, and daily pg_cron sweeps.

-- ─── Part 1: stock_in_events table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.stock_in_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_product_id uuid        NOT NULL REFERENCES app.tenant_products(id) ON DELETE RESTRICT,
  qty_delta         numeric     NOT NULL CHECK (qty_delta > 0),
  event_at          timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_in_events_product_event_at
  ON app.stock_in_events (tenant_product_id, event_at);

CREATE INDEX IF NOT EXISTS idx_stock_in_events_tenant_event_at
  ON app.stock_in_events (tenant_id, event_at);

-- RLS: rows are only visible to the owning tenant
ALTER TABLE app.stock_in_events ENABLE ROW LEVEL SECURITY;

-- Service-role bypass (SECURITY DEFINER functions already bypass RLS, but
-- give service_role an explicit policy so direct queries work too)
CREATE POLICY stock_in_events_service_role
  ON app.stock_in_events
  TO service_role
  USING (true);

CREATE POLICY stock_in_events_seller_select
  ON app.stock_in_events
  FOR SELECT
  TO authenticated
  USING (tenant_id = app.jwt_tenant_id());

-- Purge events older than 30 days daily at 02:30 UTC
SELECT cron.schedule(
  'purge-stock-in-events-daily',
  '30 2 * * *',
  $$DELETE FROM app.stock_in_events WHERE event_at < now() - interval '30 days'$$
);

-- ─── Part 2: is_dynamic + dynamic_rules columns on app.campaigns ─────────────

ALTER TABLE app.campaigns
  ADD COLUMN IF NOT EXISTS is_dynamic    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dynamic_rules jsonb;

-- ─── Part 3: app.evaluate_product_for_campaigns ──────────────────────────────
-- Re-evaluates one product against all dynamic campaigns for its tenant.
-- Called from the tenant_inventory trigger (Part 4) and daily sweep (Part 5).

CREATE OR REPLACE FUNCTION app.evaluate_product_for_campaigns(p_tenant_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_tenant_id         uuid;
  v_brand_name        text;
  v_category_name     text;
  v_qty_available     numeric;
  v_availability      text;
  v_is_new_in_stock   boolean;
  v_last_order_at     timestamptz;
  v_gmv_90d           numeric;
  v_last_order_bucket text;
  v_gmv_90d_bucket    text;
  v_campaign          record;
  v_rules             jsonb;
  v_brand_names       text[];
  v_category_names    text[];
  v_avail_filter      text;
  v_lob_filter        text;
  v_gmv_filter        text;
  v_matches           boolean;
BEGIN
  -- ── Fetch product basics ────────────────────────────────────────────────────
  SELECT tp.tenant_id, tp.brand_name, tp.category_name
  INTO v_tenant_id, v_brand_name, v_category_name
  FROM app.tenant_products tp
  WHERE tp.id = p_tenant_product_id AND tp.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN; -- product deleted; nothing to evaluate
  END IF;

  -- ── Fetch inventory qty ─────────────────────────────────────────────────────
  SELECT COALESCE(ti.qty_available, 0)
  INTO v_qty_available
  FROM app.tenant_inventory ti
  WHERE ti.tenant_product_id = p_tenant_product_id
    AND ti.deleted_at IS NULL
  ORDER BY ti.updated_at DESC
  LIMIT 1;

  v_qty_available := COALESCE(v_qty_available, 0);

  -- ── Derive availability status ──────────────────────────────────────────────
  v_availability := CASE
    WHEN v_qty_available <= 0  THEN 'out_of_stock'
    WHEN v_qty_available <= 10 THEN 'low_stock'
    ELSE                            'in_stock'
  END;

  -- ── Check new_in_stock_7d ───────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM app.stock_in_events sie
    WHERE sie.tenant_product_id = p_tenant_product_id
      AND sie.event_at >= now() - interval '7 days'
  ) INTO v_is_new_in_stock;

  -- ── Compute order-derived metrics for this product ──────────────────────────
  SELECT MAX(o.placed_at)
  INTO v_last_order_at
  FROM app.orders o
  JOIN app.order_items oi ON oi.order_id = o.id
  WHERE oi.tenant_product_id = p_tenant_product_id
    AND o.status   != 'cancelled'
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL;

  SELECT COALESCE(SUM(oi.qty * oi.unit_price), 0)
  INTO v_gmv_90d
  FROM app.order_items oi
  JOIN app.orders o ON o.id = oi.order_id
  WHERE oi.tenant_product_id = p_tenant_product_id
    AND o.placed_at >= now() - interval '90 days'
    AND o.status   != 'cancelled'
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL;

  v_last_order_bucket := app.derive_last_order_bucket(v_last_order_at);
  v_gmv_90d_bucket    := app.derive_gmv_90d_bucket(v_gmv_90d);

  -- ── Evaluate each dynamic campaign for this tenant ──────────────────────────
  FOR v_campaign IN
    SELECT c.id, c.dynamic_rules
    FROM app.campaigns c
    WHERE c.tenant_id  = v_tenant_id
      AND c.is_dynamic = true
      AND c.deleted_at IS NULL
  LOOP
    v_rules   := v_campaign.dynamic_rules;
    v_matches := true;

    -- brand_names filter (empty array = no restriction)
    SELECT array_agg(x) INTO v_brand_names
    FROM jsonb_array_elements_text(COALESCE(v_rules -> 'brand_names', '[]'::jsonb)) x;

    IF v_brand_names IS NOT NULL AND array_length(v_brand_names, 1) > 0 THEN
      IF NOT (lower(COALESCE(v_brand_name, '')) = ANY(
        SELECT lower(unnest(v_brand_names))
      )) THEN
        v_matches := false;
      END IF;
    END IF;

    -- category_names filter
    IF v_matches THEN
      SELECT array_agg(x) INTO v_category_names
      FROM jsonb_array_elements_text(COALESCE(v_rules -> 'category_names', '[]'::jsonb)) x;

      IF v_category_names IS NOT NULL AND array_length(v_category_names, 1) > 0 THEN
        IF NOT (lower(COALESCE(v_category_name, '')) = ANY(
          SELECT lower(unnest(v_category_names))
        )) THEN
          v_matches := false;
        END IF;
      END IF;
    END IF;

    -- availability filter
    IF v_matches THEN
      v_avail_filter := v_rules ->> 'availability';
      IF v_avail_filter IS NOT NULL AND v_avail_filter != 'show_everything' THEN
        IF v_avail_filter = 'new_in_stock_today' THEN
          IF NOT v_is_new_in_stock THEN
            v_matches := false;
          END IF;
        ELSIF v_avail_filter != v_availability THEN
          v_matches := false;
        END IF;
      END IF;
    END IF;

    -- last_ordered_bucket filter
    IF v_matches THEN
      v_lob_filter := v_rules ->> 'last_ordered_bucket';
      IF v_lob_filter IS NOT NULL THEN
        IF v_lob_filter = 'within_30_days' AND v_last_order_bucket != 'within_30_days' THEN
          v_matches := false;
        ELSIF v_lob_filter = 'within_90_days'
          AND v_last_order_bucket NOT IN ('within_30_days', 'within_90_days') THEN
          v_matches := false;
        ELSIF v_lob_filter = 'dormant_90_plus_days'
          AND v_last_order_bucket != 'dormant_90_plus_days' THEN
          v_matches := false;
        -- 'anytime' always passes
        END IF;
      END IF;
    END IF;

    -- gmv_90d_bucket filter
    IF v_matches THEN
      v_gmv_filter := v_rules ->> 'gmv_90d_bucket';
      IF v_gmv_filter IS NOT NULL AND v_gmv_filter != v_gmv_90d_bucket THEN
        v_matches := false;
      END IF;
    END IF;

    -- Apply membership change
    IF v_matches THEN
      INSERT INTO app.campaign_items (campaign_id, tenant_product_id)
      VALUES (v_campaign.id, p_tenant_product_id)
      ON CONFLICT (campaign_id, tenant_product_id) DO NOTHING;

      -- Un-soft-delete if previously removed
      UPDATE app.campaign_items
      SET deleted_at = NULL
      WHERE campaign_id        = v_campaign.id
        AND tenant_product_id  = p_tenant_product_id
        AND deleted_at IS NOT NULL;
    ELSE
      -- Soft-delete if currently active
      UPDATE app.campaign_items
      SET deleted_at = now()
      WHERE campaign_id        = v_campaign.id
        AND tenant_product_id  = p_tenant_product_id
        AND deleted_at IS NULL;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION app.evaluate_product_for_campaigns(uuid) TO service_role;

-- ─── Part 4: Trigger on tenant_inventory for campaigns ───────────────────────
-- Fires on INSERT or UPDATE of qty_available.
-- Logs a stock_in_event when qty increases, then re-evaluates campaign
-- membership for the affected product.

CREATE OR REPLACE FUNCTION app.trg_inventory_campaign_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  -- Log stock-in event if qty increased
  IF NEW.qty_available > COALESCE(OLD.qty_available, 0) THEN
    INSERT INTO app.stock_in_events (tenant_id, tenant_product_id, qty_delta)
    SELECT tp.tenant_id,
           NEW.tenant_product_id,
           NEW.qty_available - COALESCE(OLD.qty_available, 0)
    FROM app.tenant_products tp
    WHERE tp.id = NEW.tenant_product_id;
  END IF;

  -- Re-evaluate campaign membership for this product
  PERFORM app.evaluate_product_for_campaigns(NEW.tenant_product_id);

  -- Re-evaluate price-list membership for this product (Part 7)
  PERFORM app.evaluate_product_for_price_lists(NEW.tenant_product_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_campaign_refresh ON app.tenant_inventory;
CREATE TRIGGER trg_inventory_campaign_refresh
  AFTER INSERT OR UPDATE OF qty_available ON app.tenant_inventory
  FOR EACH ROW EXECUTE FUNCTION app.trg_inventory_campaign_refresh();

-- ─── Part 5: app.refresh_all_dynamic_campaigns ───────────────────────────────
-- Daily sweep: re-evaluates every product belonging to a tenant that has at
-- least one dynamic campaign. Catches drift from bulk imports, cron-based
-- order status changes, or direct DB edits.

CREATE OR REPLACE FUNCTION app.refresh_all_dynamic_campaigns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_product record;
BEGIN
  FOR v_product IN
    SELECT DISTINCT tp.id
    FROM app.tenant_products tp
    WHERE tp.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM app.campaigns c
        WHERE c.tenant_id  = tp.tenant_id
          AND c.is_dynamic = true
          AND c.deleted_at IS NULL
      )
  LOOP
    PERFORM app.evaluate_product_for_campaigns(v_product.id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION app.refresh_all_dynamic_campaigns() TO service_role;

SELECT cron.schedule(
  'refresh-campaign-products-daily',
  '15 2 * * *',
  $$SELECT app.refresh_all_dynamic_campaigns()$$
);

-- ─── Part 6: app.evaluate_product_for_price_lists ────────────────────────────
-- Re-evaluates one product against all dynamic price lists for its tenant.
-- Upserts into price_list_items using the list's pricing_strategy / strategy_value
-- when the product matches; soft-deletes the item when it no longer matches.
-- Skips price lists with pricing_strategy = 'edit_each' (no auto-price rule).

CREATE OR REPLACE FUNCTION app.evaluate_product_for_price_lists(p_tenant_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_tenant_id         uuid;
  v_brand_name        text;
  v_category_name     text;
  v_base_price        numeric;
  v_mrp               numeric;
  v_qty_available     numeric;
  v_availability      text;
  v_is_new_in_stock   boolean;
  v_last_order_at     timestamptz;
  v_gmv_90d           numeric;
  v_last_order_bucket text;
  v_gmv_90d_bucket    text;
  v_price_list        record;
  v_filters           jsonb;
  v_brand_names       text[];
  v_category_names    text[];
  v_avail_filter      text;
  v_lob_filter        text;
  v_gmv_filter        text;
  v_matches           boolean;
  v_computed_price    numeric;
BEGIN
  -- ── Fetch product basics ────────────────────────────────────────────────────
  SELECT tp.tenant_id, tp.brand_name, tp.category_name,
         tp.base_selling_price, tp.mrp
  INTO v_tenant_id, v_brand_name, v_category_name, v_base_price, v_mrp
  FROM app.tenant_products tp
  WHERE tp.id = p_tenant_product_id AND tp.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- ── Fetch inventory qty ─────────────────────────────────────────────────────
  SELECT COALESCE(ti.qty_available, 0)
  INTO v_qty_available
  FROM app.tenant_inventory ti
  WHERE ti.tenant_product_id = p_tenant_product_id
    AND ti.deleted_at IS NULL
  ORDER BY ti.updated_at DESC
  LIMIT 1;

  v_qty_available := COALESCE(v_qty_available, 0);

  v_availability := CASE
    WHEN v_qty_available <= 0  THEN 'out_of_stock'
    WHEN v_qty_available <= 10 THEN 'low_stock'
    ELSE                            'in_stock'
  END;

  -- ── new_in_stock_7d ─────────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM app.stock_in_events sie
    WHERE sie.tenant_product_id = p_tenant_product_id
      AND sie.event_at >= now() - interval '7 days'
  ) INTO v_is_new_in_stock;

  -- ── Order-derived metrics ───────────────────────────────────────────────────
  SELECT MAX(o.placed_at)
  INTO v_last_order_at
  FROM app.orders o
  JOIN app.order_items oi ON oi.order_id = o.id
  WHERE oi.tenant_product_id = p_tenant_product_id
    AND o.status   != 'cancelled'
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL;

  SELECT COALESCE(SUM(oi.qty * oi.unit_price), 0)
  INTO v_gmv_90d
  FROM app.order_items oi
  JOIN app.orders o ON o.id = oi.order_id
  WHERE oi.tenant_product_id = p_tenant_product_id
    AND o.placed_at >= now() - interval '90 days'
    AND o.status   != 'cancelled'
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL;

  v_last_order_bucket := app.derive_last_order_bucket(v_last_order_at);
  v_gmv_90d_bucket    := app.derive_gmv_90d_bucket(v_gmv_90d);

  -- ── Evaluate each price list for this tenant ────────────────────────────────
  FOR v_price_list IN
    SELECT pl.id, pl.filters, pl.pricing_strategy, pl.strategy_value
    FROM app.price_lists pl
    WHERE pl.tenant_id = v_tenant_id
      AND pl.deleted_at IS NULL
      AND pl.filters IS NOT NULL
  LOOP
    -- Skip lists that require manual per-item pricing
    IF v_price_list.pricing_strategy = 'edit_each' THEN
      CONTINUE;
    END IF;

    v_filters := v_price_list.filters;
    v_matches := true;

    -- brand_names filter
    SELECT array_agg(x) INTO v_brand_names
    FROM jsonb_array_elements_text(COALESCE(v_filters -> 'brand_names', '[]'::jsonb)) x;

    IF v_brand_names IS NOT NULL AND array_length(v_brand_names, 1) > 0 THEN
      IF NOT (lower(COALESCE(v_brand_name, '')) = ANY(
        SELECT lower(unnest(v_brand_names))
      )) THEN
        v_matches := false;
      END IF;
    END IF;

    -- category_names filter
    IF v_matches THEN
      SELECT array_agg(x) INTO v_category_names
      FROM jsonb_array_elements_text(COALESCE(v_filters -> 'category_names', '[]'::jsonb)) x;

      IF v_category_names IS NOT NULL AND array_length(v_category_names, 1) > 0 THEN
        IF NOT (lower(COALESCE(v_category_name, '')) = ANY(
          SELECT lower(unnest(v_category_names))
        )) THEN
          v_matches := false;
        END IF;
      END IF;
    END IF;

    -- availability filter
    IF v_matches THEN
      v_avail_filter := v_filters ->> 'availability';
      IF v_avail_filter IS NOT NULL AND v_avail_filter != 'show_everything' THEN
        IF v_avail_filter = 'new_in_stock_today' THEN
          IF NOT v_is_new_in_stock THEN
            v_matches := false;
          END IF;
        ELSIF v_avail_filter != v_availability THEN
          v_matches := false;
        END IF;
      END IF;
    END IF;

    -- last_ordered_bucket filter
    IF v_matches THEN
      v_lob_filter := v_filters ->> 'last_ordered_bucket';
      IF v_lob_filter IS NOT NULL THEN
        IF v_lob_filter = 'within_30_days' AND v_last_order_bucket != 'within_30_days' THEN
          v_matches := false;
        ELSIF v_lob_filter = 'within_90_days'
          AND v_last_order_bucket NOT IN ('within_30_days', 'within_90_days') THEN
          v_matches := false;
        ELSIF v_lob_filter = 'dormant_90_plus_days'
          AND v_last_order_bucket != 'dormant_90_plus_days' THEN
          v_matches := false;
        END IF;
      END IF;
    END IF;

    -- gmv_90d_bucket filter
    IF v_matches THEN
      v_gmv_filter := v_filters ->> 'gmv_90d_bucket';
      IF v_gmv_filter IS NOT NULL AND v_gmv_filter != v_gmv_90d_bucket THEN
        v_matches := false;
      END IF;
    END IF;

    -- Apply membership change
    IF v_matches THEN
      -- Compute price from strategy
      v_computed_price := CASE v_price_list.pricing_strategy
        WHEN 'margin_from_mrp'  THEN COALESCE(v_mrp, 0) * (1 - COALESCE(v_price_list.strategy_value, 0) / 100)
        WHEN 'flat_off_base'    THEN COALESCE(v_base_price, 0) - COALESCE(v_price_list.strategy_value, 0)
        WHEN 'percentage'       THEN COALESCE(v_base_price, 0) * (1 - COALESCE(v_price_list.strategy_value, 0) / 100)
        WHEN 'per_item'         THEN COALESCE(v_price_list.strategy_value, 0)
        ELSE                         COALESCE(v_base_price, 0)
      END;

      -- Ensure price is non-negative
      v_computed_price := GREATEST(v_computed_price, 0);

      -- Upsert: insert with min_qty=1 or restore a soft-deleted row
      INSERT INTO app.price_list_items (
        price_list_id, tenant_product_id, price, min_qty
      )
      VALUES (
        v_price_list.id, p_tenant_product_id, v_computed_price, 1
      )
      ON CONFLICT (price_list_id, tenant_product_id, min_qty)
      DO UPDATE SET
        price      = EXCLUDED.price,
        deleted_at = NULL;

    ELSE
      -- Soft-delete the item for min_qty=1 (the auto-managed tier)
      UPDATE app.price_list_items
      SET deleted_at = now()
      WHERE price_list_id      = v_price_list.id
        AND tenant_product_id  = p_tenant_product_id
        AND min_qty            = 1
        AND deleted_at IS NULL;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION app.evaluate_product_for_price_lists(uuid) TO service_role;

-- ─── Part 8: app.refresh_all_dynamic_price_lists ─────────────────────────────
-- Daily sweep: re-evaluates every product for tenants that have at least one
-- price list with a non-null filters jsonb.

CREATE OR REPLACE FUNCTION app.refresh_all_dynamic_price_lists()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_product record;
BEGIN
  FOR v_product IN
    SELECT DISTINCT tp.id
    FROM app.tenant_products tp
    WHERE tp.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM app.price_lists pl
        WHERE pl.tenant_id  = tp.tenant_id
          AND pl.deleted_at IS NULL
          AND pl.filters    IS NOT NULL
          AND pl.pricing_strategy != 'edit_each'
      )
  LOOP
    PERFORM app.evaluate_product_for_price_lists(v_product.id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION app.refresh_all_dynamic_price_lists() TO service_role;

SELECT cron.schedule(
  'refresh-pricelist-products-daily',
  '45 2 * * *',
  $$SELECT app.refresh_all_dynamic_price_lists()$$
);
