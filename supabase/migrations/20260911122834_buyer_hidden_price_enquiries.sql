ALTER TABLE app.estimates
  ADD COLUMN IF NOT EXISTS estimate_type text NOT NULL DEFAULT 'with_price',
  ADD COLUMN IF NOT EXISTS catalog_id uuid REFERENCES app.catalogs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS price_visibility text;

ALTER TABLE app.estimates
  DROP CONSTRAINT IF EXISTS estimates_estimate_type_check;

ALTER TABLE app.estimates
  ADD CONSTRAINT estimates_estimate_type_check
  CHECK (estimate_type IN ('with_price', 'without_price'));

ALTER TABLE app.estimates
  DROP CONSTRAINT IF EXISTS estimates_price_visibility_check;

ALTER TABLE app.estimates
  ADD CONSTRAINT estimates_price_visibility_check
  CHECK (price_visibility IS NULL OR price_visibility IN ('show_price', 'hide_price'));

ALTER TABLE app.estimate_items
  ALTER COLUMN unit_price DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS buyer_target_unit_price_min numeric,
  ADD COLUMN IF NOT EXISTS buyer_target_unit_price_max numeric,
  ADD COLUMN IF NOT EXISTS buyer_note text;

ALTER TABLE app.estimate_items
  DROP CONSTRAINT IF EXISTS estimate_items_buyer_target_unit_price_range_check;

ALTER TABLE app.estimate_items
  ADD CONSTRAINT estimate_items_buyer_target_unit_price_range_check
  CHECK (
    (
      buyer_target_unit_price_min IS NULL
      AND buyer_target_unit_price_max IS NULL
    )
    OR (
      buyer_target_unit_price_min IS NOT NULL
      AND buyer_target_unit_price_max IS NOT NULL
      AND buyer_target_unit_price_min >= 0
      AND buyer_target_unit_price_max >= buyer_target_unit_price_min
    )
  );

CREATE INDEX IF NOT EXISTS idx_estimates_catalog_id
  ON app.estimates(catalog_id)
  WHERE deleted_at IS NULL AND catalog_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_without_price
  ON app.estimates(tenant_id, created_at DESC)
  WHERE deleted_at IS NULL AND estimate_type = 'without_price';
