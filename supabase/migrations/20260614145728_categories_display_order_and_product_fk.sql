-- ─── Categories: display order + R2 image keys ───────────────────────────────

ALTER TABLE app.tenant_categories
  ADD COLUMN IF NOT EXISTS display_order int NOT NULL DEFAULT 0;

ALTER TABLE app.tenant_categories
  ADD COLUMN IF NOT EXISTS r2_image_original_key text,
  ADD COLUMN IF NOT EXISTS r2_image_medium_key   text,
  ADD COLUMN IF NOT EXISTS r2_image_thumb_key    text;

-- ─── Products: FK to tenant_categories ───────────────────────────────────────
-- category_name (text) stays for backward compat but is no longer written by UI

ALTER TABLE app.tenant_products
  ADD COLUMN IF NOT EXISTS tenant_category_id uuid
    REFERENCES app.tenant_categories(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_tenant_products_category_id
  ON app.tenant_products (tenant_category_id);

-- ─── Brands: derived categories (auto-maintained by trigger below) ────────────

ALTER TABLE app.tenant_brands
  ADD COLUMN IF NOT EXISTS categories jsonb NOT NULL DEFAULT '[]';

-- ─── Function: recompute brand.categories from its active products ────────────

CREATE OR REPLACE FUNCTION app.refresh_brand_categories(p_brand_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE app.tenant_brands
  SET
    categories = COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',    tc.id,
          'name',  tc.name,
          'count', cat.cnt
        ) ORDER BY tc.display_order, tc.name
      )
      FROM (
        SELECT tenant_category_id, COUNT(*) AS cnt
        FROM app.tenant_products
        WHERE tenant_brand_id = p_brand_id
          AND tenant_category_id IS NOT NULL
          AND deleted_at IS NULL
        GROUP BY tenant_category_id
      ) cat
      JOIN app.tenant_categories tc ON tc.id = cat.tenant_category_id
    ), '[]'::jsonb),
    updated_at = now()
  WHERE id = p_brand_id;
END;
$$;

-- ─── Trigger: keep brand.categories in sync ───────────────────────────────────

CREATE OR REPLACE FUNCTION app.trg_refresh_brand_categories_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- When brand changes (re-assignment) or product deleted: refresh OLD brand
  IF TG_OP = 'DELETE' OR (
    TG_OP = 'UPDATE' AND
    OLD.tenant_brand_id IS DISTINCT FROM NEW.tenant_brand_id
  ) THEN
    PERFORM app.refresh_brand_categories(OLD.tenant_brand_id);
  END IF;

  -- For inserts and updates: refresh NEW brand
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM app.refresh_brand_categories(NEW.tenant_brand_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_brand_categories ON app.tenant_products;

CREATE TRIGGER trg_refresh_brand_categories
  AFTER INSERT OR UPDATE OF tenant_category_id, tenant_brand_id, deleted_at
  OR DELETE ON app.tenant_products
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_brand_categories_fn();
