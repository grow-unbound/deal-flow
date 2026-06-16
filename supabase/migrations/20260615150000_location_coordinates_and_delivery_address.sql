-- lat/lng on seller locations (nullable — existing rows have no coordinates)
ALTER TABLE app.locations
  ADD COLUMN IF NOT EXISTS lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS lng numeric(10,7);

-- buyer's chosen delivery address snapshot stored at order/estimate creation time
ALTER TABLE app.orders
  ADD COLUMN IF NOT EXISTS delivery_address jsonb;

ALTER TABLE app.estimates
  ADD COLUMN IF NOT EXISTS delivery_address jsonb;

-- seed default delivery routing threshold for all existing tenants that don't have it yet
UPDATE app.tenant_settings
  SET settings = app.jsonb_deep_merge(settings, '{"delivery_routing_threshold_km": 300}'::jsonb)
  WHERE NOT (settings ? 'delivery_routing_threshold_km');
