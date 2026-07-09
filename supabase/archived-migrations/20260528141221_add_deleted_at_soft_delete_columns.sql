-- Soft-delete column rollout for catalog.* and app.* business tables
-- Keeps migration idempotent with IF NOT EXISTS.

ALTER TABLE catalog.brands ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE catalog.categories ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE catalog.products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE catalog.product_aliases ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE app.tenants ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.tenant_users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.tenant_brands ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.locations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.tenant_products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.tenant_inventory ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.buyers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.buyer_users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.cohorts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.price_lists ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.price_list_items ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.price_list_assignments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.campaigns ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.campaign_items ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.order_items ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE app.audit_log ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

