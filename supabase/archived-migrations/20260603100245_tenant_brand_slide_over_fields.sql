ALTER TABLE app.tenant_brands
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS principal_name text,
  ADD COLUMN IF NOT EXISTS principal_email text,
  ADD COLUMN IF NOT EXISTS principal_phone text,
  ADD COLUMN IF NOT EXISTS principal_location text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS default_cohort_id uuid REFERENCES app.cohorts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_tenant_brands_default_cohort_id
  ON app.tenant_brands(default_cohort_id);
