ALTER TABLE app.tenant_brands
  ALTER COLUMN master_brand_id DROP NOT NULL;

ALTER TABLE app.tenant_brands
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS description text;

UPDATE app.tenant_brands tb
SET
  display_name_override = COALESCE(NULLIF(tb.display_name_override, ''), cb.name),
  slug = COALESCE(tb.slug, cb.slug),
  description = COALESCE(tb.description, cb.description)
FROM catalog.brands cb
WHERE tb.master_brand_id = cb.id
  AND (
    tb.display_name_override IS NULL
    OR tb.display_name_override = ''
    OR tb.slug IS NULL
    OR tb.description IS NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_brands_slug_unique
  ON app.tenant_brands(tenant_id, slug)
  WHERE deleted_at IS NULL AND slug IS NOT NULL;

ALTER TABLE app.buyers
  ADD COLUMN IF NOT EXISTS default_cohort_id uuid REFERENCES app.cohorts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_buyers_default_cohort_id
  ON app.buyers(default_cohort_id);