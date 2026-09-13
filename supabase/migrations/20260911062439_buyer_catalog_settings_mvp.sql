-- Buyer Catalog Settings MVP: keep one public catalog row per tenant and add
-- only the tenant-level behavior fields needed by the v2 setup flow.

ALTER TABLE app.catalogs
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'public_link',
  ADD COLUMN IF NOT EXISTS collect_target_unit_price_range boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS product_display_mode text NOT NULL DEFAULT 'sku_list';

ALTER TABLE app.catalogs
  DROP CONSTRAINT IF EXISTS catalogs_pricing_mode_check,
  DROP CONSTRAINT IF EXISTS catalogs_access_mode_check,
  DROP CONSTRAINT IF EXISTS catalogs_product_display_mode_check;

ALTER TABLE app.catalogs
  ADD CONSTRAINT catalogs_pricing_mode_check
    CHECK (pricing_mode IN ('hidden_until_login', 'hide_price_collect_enquiry', 'base_selling_rate', 'assigned_price_list')),
  ADD CONSTRAINT catalogs_access_mode_check
    CHECK (access_mode IN ('public_link', 'approved_buyers_only')),
  ADD CONSTRAINT catalogs_product_display_mode_check
    CHECK (product_display_mode IN ('sku_list', 'group_variants'));

CREATE OR REPLACE FUNCTION app.catalogs_validate_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'app'
AS $$
BEGIN
  IF NEW.kind = 'public' AND NEW.live_at IS NOT NULL AND NEW.pricing_mode IS NULL THEN
    RAISE EXCEPTION 'public catalog requires pricing_mode before going live';
  END IF;

  IF NEW.pricing_mode = 'assigned_price_list' THEN
    IF NEW.price_list_id IS NULL THEN
      RAISE EXCEPTION 'price_list_id is required when pricing_mode is assigned_price_list';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM app.price_lists pl
      WHERE pl.id = NEW.price_list_id
        AND pl.tenant_id = NEW.tenant_id
        AND pl.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'assigned price list must belong to the tenant and not be deleted';
    END IF;
  ELSIF NEW.price_list_id IS NOT NULL THEN
    RAISE EXCEPTION 'price_list_id is only valid when pricing_mode is assigned_price_list';
  END IF;

  IF COALESCE(NEW.collect_target_unit_price_range, false)
     AND NEW.pricing_mode IS DISTINCT FROM 'hide_price_collect_enquiry' THEN
    RAISE EXCEPTION 'target unit price range is only valid for hidden-price enquiries';
  END IF;

  RETURN NEW;
END;
$$;
