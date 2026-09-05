-- Tenant-level storefront branding (distinct from app.tenant_brands.logo_url,
-- which is per-brand-within-a-tenant). Nullable — most tenants won't have
-- one yet; UI falls back to an initials avatar when absent. Public-read via
-- the guest tenant-branding endpoint, so this must never carry anything
-- beyond a public-facing image URL.
ALTER TABLE app.tenants ADD COLUMN IF NOT EXISTS logo_url text;
