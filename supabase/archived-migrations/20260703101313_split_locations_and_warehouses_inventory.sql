-- Finalize the branch/warehouse split:
-- app.locations    = branch/document/routing locations
-- app.warehouses   = physical stock nodes
-- app.tenant_inventory references warehouses only

ALTER TABLE app.integration_entity_map
  DROP CONSTRAINT IF EXISTS integration_entity_map_entity_type_check;
ALTER TABLE app.integration_entity_map
  ADD CONSTRAINT integration_entity_map_entity_type_check CHECK (
    entity_type IN (
      -- Canonical sync phases
      'locations', 'warehouses', 'categories', 'brands', 'products',
      'pricelists', 'customers', 'contact_persons', 'estimates', 'orders', 'invoices',
      -- Persisted local/derived entity mappings already used by the integration runtime
      'price_lists', 'price_list_items', 'buyer_users', 'tenant_inventory',
      'estimate_items', 'order_items', 'invoice_items'
    )
  );

ALTER TABLE app.integration_data_flows
  DROP CONSTRAINT IF EXISTS integration_data_flows_entity_type_check;
ALTER TABLE app.integration_data_flows
  ADD CONSTRAINT integration_data_flows_entity_type_check CHECK (
    entity_type IN (
      -- Canonical sync phases
      'locations', 'warehouses', 'categories', 'brands', 'products',
      'pricelists', 'customers', 'contact_persons', 'estimates', 'orders', 'invoices',
      -- Persisted local/derived mapping rows shown in the integrations UI
      'price_lists', 'price_list_items', 'buyer_users', 'tenant_inventory',
      'estimate_items', 'order_items', 'invoice_items'
    )
  );

ALTER TABLE app.warehouses
  ADD COLUMN IF NOT EXISTS lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS lng numeric(10,7);

CREATE INDEX IF NOT EXISTS idx_warehouses_location_id
  ON app.warehouses(location_id);

UPDATE app.warehouses wh
SET
  address = COALESCE(wh.address, loc.address),
  lat = COALESCE(wh.lat, loc.lat),
  lng = COALESCE(wh.lng, loc.lng),
  updated_at = now()
FROM app.locations loc
WHERE wh.location_id = loc.id
  AND (
    wh.address IS NULL
    OR wh.lat IS NULL
    OR wh.lng IS NULL
  );

INSERT INTO app.warehouses (
  tenant_id,
  location_id,
  name,
  address,
  status,
  is_default,
  associated_users,
  lat,
  lng,
  created_at,
  updated_at
)
SELECT
  loc.tenant_id,
  loc.id,
  loc.name,
  loc.address,
  COALESCE(loc.status, 'active'),
  loc.is_default,
  COALESCE(loc.associated_users, '[]'::jsonb),
  loc.lat,
  loc.lng,
  COALESCE(loc.created_at, now()),
  COALESCE(loc.updated_at, now())
FROM app.locations loc
WHERE EXISTS (
  SELECT 1
  FROM app.tenant_inventory ti
  WHERE ti.location_id = loc.id
)
AND NOT EXISTS (
  SELECT 1
  FROM app.warehouses wh
  WHERE wh.location_id = loc.id
);

UPDATE app.tenant_inventory ti
SET warehouse_id = wh.id
FROM app.tenant_products tp,
     app.warehouses wh
WHERE tp.id = ti.tenant_product_id
  AND wh.location_id = ti.location_id
  AND wh.tenant_id = tp.tenant_id
  AND ti.warehouse_id IS NULL
  AND ti.location_id IS NOT NULL;

DELETE FROM app.tenant_inventory
WHERE warehouse_id IS NULL
  AND location_id IS NULL;

ALTER TABLE app.tenant_inventory
  ALTER COLUMN warehouse_id SET NOT NULL;

DROP INDEX IF EXISTS app.idx_tenant_inventory_location_id;
DROP INDEX IF EXISTS app.tenant_inventory_product_location_upsert;

ALTER TABLE app.tenant_inventory
  DROP COLUMN IF EXISTS location_id;

ALTER TABLE app.locations
  DROP CONSTRAINT IF EXISTS locations_type_check;

DROP INDEX IF EXISTS app.locations_tenant_external_ref_unique;

ALTER TABLE app.locations
  DROP COLUMN IF EXISTS type,
  DROP COLUMN IF EXISTS inventory_tracking;

CREATE UNIQUE INDEX IF NOT EXISTS locations_tenant_external_ref_unique
  ON app.locations (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.refresh_locations_snapshot(p_location_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  INSERT INTO app.locations_snapshot (
    location_id, tenant_id,
    sku_count, oos_sku_count, low_stock_sku_count,
    outstanding_dues, oldest_unpaid_days, invoice_count,
    refreshed_at
  )
  SELECT
    l.id,
    l.tenant_id,
    COUNT(DISTINCT ti.tenant_product_id),
    COUNT(DISTINCT ti.tenant_product_id) FILTER (WHERE ti.qty_available <= 0),
    COUNT(DISTINCT ti.tenant_product_id) FILTER (
      WHERE ti.qty_available > 0
        AND ti.reorder_point IS NOT NULL
        AND ti.qty_available <= ti.reorder_point
    ),
    COALESCE(SUM(inv.outstanding_balance) FILTER (
      WHERE inv.status IN ('issued', 'partially_paid') AND inv.deleted_at IS NULL
    ), 0),
    MAX(
      EXTRACT(DAY FROM now() - inv.invoice_date)::integer
    ) FILTER (
      WHERE inv.status IN ('issued', 'partially_paid') AND inv.deleted_at IS NULL
    ),
    COUNT(inv.id) FILTER (
      WHERE inv.status IN ('issued', 'partially_paid') AND inv.deleted_at IS NULL
    ),
    now()
  FROM app.locations l
  LEFT JOIN app.warehouses wh
    ON wh.location_id = l.id
   AND wh.deleted_at IS NULL
  LEFT JOIN app.tenant_inventory ti
    ON ti.warehouse_id = wh.id
   AND ti.deleted_at IS NULL
  LEFT JOIN app.invoices inv
    ON inv.location_id = l.id
   AND inv.tenant_id = l.tenant_id
  WHERE l.id = p_location_id
  GROUP BY l.id, l.tenant_id
  ON CONFLICT (location_id) DO UPDATE SET
    tenant_id           = EXCLUDED.tenant_id,
    sku_count           = EXCLUDED.sku_count,
    oos_sku_count       = EXCLUDED.oos_sku_count,
    low_stock_sku_count = EXCLUDED.low_stock_sku_count,
    outstanding_dues    = EXCLUDED.outstanding_dues,
    oldest_unpaid_days  = EXCLUDED.oldest_unpaid_days,
    invoice_count       = EXCLUDED.invoice_count,
    refreshed_at        = EXCLUDED.refreshed_at;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_locations_snapshot_from_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_location uuid;
BEGIN
  SELECT location_id
    INTO target_location
  FROM app.warehouses
  WHERE id = COALESCE(NEW.warehouse_id, OLD.warehouse_id);

  IF target_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(target_location);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_product_id uuid;
  v_location uuid;
  v_tenant uuid;
  v_today date;
BEGIN
  v_product_id := COALESCE(NEW.tenant_product_id, OLD.tenant_product_id);
  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT tp.tenant_id INTO v_tenant
  FROM app.tenant_products tp
  WHERE tp.id = v_product_id;

  SELECT wh.location_id INTO v_location
  FROM app.warehouses wh
  WHERE wh.id = COALESCE(NEW.warehouse_id, OLD.warehouse_id);

  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  IF v_product_id IS NOT NULL THEN
    PERFORM app.refresh_kpi_product_daily(v_tenant, v_product_id, v_today);
  END IF;

  PERFORM app.refresh_products_snapshot(v_tenant);
  PERFORM app.refresh_categories_snapshot(v_tenant);

  IF v_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_location);
  END IF;

  RETURN NULL;
END;
$$;

DO $$
DECLARE
  loc RECORD;
BEGIN
  FOR loc IN SELECT id FROM app.locations WHERE deleted_at IS NULL LOOP
    PERFORM app.refresh_locations_snapshot(loc.id);
  END LOOP;
END;
$$;
