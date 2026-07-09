-- Zoho custom field mapping framework (cf_* -> Yukti) + is_buyer_app_* flags.
--
-- Problem: Zoho custom fields (cf_online_catalog_access on Customer,
-- cf_catalog_estimate on Estimate, cf_catalog_invoice on Invoice) carry
-- business meaning Yukti needs, but today source = 'zoho_import' on a synced
-- estimate/order/invoice destroys the "did this originate from the buyer
-- app" signal that source = 'buyer_app' otherwise carries for native rows.
--
-- Fix, in two layers:
--   1. `custom_fields` jsonb on buyers/estimates/invoices — raw capture of
--      every cf_* field synced from Zoho, always populated, no config needed.
--   2. `is_buyer_app_estimate` / `is_buyer_app_order` / `is_buyer_app_invoice`
--      typed boolean flags — the single source of truth for "was this
--      buyer-app business", populated for BOTH native writes (via trigger,
--      derived from `source` / linked-row lineage) and Zoho-imported writes
--      (via `app.tenant_field_mappings` + the sync pipeline).
--
-- `app.tenant_field_mappings` is the generic, per-tenant-integration,
-- per-entity config table so future cf_* fields (for WineYard or later
-- tenants) only need a new config row, not new sync code.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. custom_fields jsonb capture columns
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE app.buyers    ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app.estimates ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app.invoices  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. is_buyer_app_* typed flags
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE app.estimates ADD COLUMN IF NOT EXISTS is_buyer_app_estimate boolean NOT NULL DEFAULT false;
ALTER TABLE app.orders    ADD COLUMN IF NOT EXISTS is_buyer_app_order    boolean NOT NULL DEFAULT false;
ALTER TABLE app.invoices  ADD COLUMN IF NOT EXISTS is_buyer_app_invoice  boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_estimates_is_buyer_app ON app.estimates(tenant_id, is_buyer_app_estimate) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_is_buyer_app     ON app.orders(tenant_id, is_buyer_app_order);
CREATE INDEX IF NOT EXISTS idx_invoices_is_buyer_app   ON app.invoices(tenant_id, is_buyer_app_invoice) WHERE deleted_at IS NULL;

-- Backfill existing rows so native buyer-app history isn't lost: any row
-- whose `source` already says buyer_app becomes true immediately. Rows
-- imported from Zoho before this migration have no cf_* signal captured yet
-- (custom_fields was just added) and stay false until the next sync re-applies
-- app.tenant_field_mappings and flips them explicitly.
UPDATE app.estimates SET is_buyer_app_estimate = true WHERE source = 'buyer_app' AND NOT is_buyer_app_estimate;
UPDATE app.orders    SET is_buyer_app_order    = true WHERE source = 'buyer_app' AND NOT is_buyer_app_order;
UPDATE app.invoices  i SET is_buyer_app_invoice = true
  FROM app.estimates e
  WHERE i.estimate_id = e.id AND e.source = 'buyer_app' AND NOT i.is_buyer_app_invoice;

-- ─────────────────────────────────────────────────────────────────────────────
-- Population triggers for NATIVE writes (non-Zoho path). These are monotonic
-- (OR-in, never flip true -> false) so they never clobber a true value the
-- sync pipeline set from a Zoho custom field, and they no-op harmlessly on
-- UPDATEs that don't touch these columns (NEW carries forward OLD's value).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.set_is_buyer_app_estimate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_buyer_app_estimate := NEW.is_buyer_app_estimate OR (NEW.source = 'buyer_app');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_is_buyer_app_estimate ON app.estimates;
CREATE TRIGGER trg_set_is_buyer_app_estimate
  BEFORE INSERT OR UPDATE ON app.estimates
  FOR EACH ROW EXECUTE FUNCTION app.set_is_buyer_app_estimate();

CREATE OR REPLACE FUNCTION app.set_is_buyer_app_order()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_buyer_app_order := NEW.is_buyer_app_order
    OR (NEW.source = 'buyer_app')
    OR (NEW.estimate_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM app.estimates e
          WHERE e.id = NEW.estimate_id AND e.is_buyer_app_estimate
        ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_is_buyer_app_order ON app.orders;
CREATE TRIGGER trg_set_is_buyer_app_order
  BEFORE INSERT OR UPDATE ON app.orders
  FOR EACH ROW EXECUTE FUNCTION app.set_is_buyer_app_order();

CREATE OR REPLACE FUNCTION app.set_is_buyer_app_invoice()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_buyer_app_invoice := NEW.is_buyer_app_invoice
    OR (NEW.order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM app.orders o
          WHERE o.id = NEW.order_id AND o.is_buyer_app_order
        ))
    OR (NEW.estimate_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM app.estimates e
          WHERE e.id = NEW.estimate_id AND e.is_buyer_app_estimate
        ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_is_buyer_app_invoice ON app.invoices;
CREATE TRIGGER trg_set_is_buyer_app_invoice
  BEFORE INSERT OR UPDATE ON app.invoices
  FOR EACH ROW EXECUTE FUNCTION app.set_is_buyer_app_invoice();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. app.tenant_field_mappings — generic cf_* -> target column config
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app.tenant_field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_integration_id uuid NOT NULL REFERENCES app.tenant_integrations(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  zoho_field_name text NOT NULL,
  target_column text NOT NULL,
  transform_type text NOT NULL DEFAULT 'boolean_from_zoho',
  transform_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT tenant_field_mappings_entity_type_check CHECK (
    entity_type IN ('customers', 'estimates', 'invoices')
  ),
  CONSTRAINT tenant_field_mappings_transform_type_check CHECK (
    transform_type IN ('boolean_from_zoho', 'copy', 'enum_map')
  ),
  CONSTRAINT tenant_field_mappings_unique UNIQUE (tenant_integration_id, entity_type, zoho_field_name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_field_mappings_lookup
  ON app.tenant_field_mappings (tenant_id, tenant_integration_id, entity_type)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS tenant_field_mappings_updated_at ON app.tenant_field_mappings;
CREATE TRIGGER tenant_field_mappings_updated_at
  BEFORE UPDATE ON app.tenant_field_mappings
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.tenant_field_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_field_mappings_seller_select ON app.tenant_field_mappings;
CREATE POLICY tenant_field_mappings_seller_select ON app.tenant_field_mappings
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS tenant_field_mappings_seller_admin_insert ON app.tenant_field_mappings;
CREATE POLICY tenant_field_mappings_seller_admin_insert ON app.tenant_field_mappings
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS tenant_field_mappings_seller_admin_update ON app.tenant_field_mappings;
CREATE POLICY tenant_field_mappings_seller_admin_update ON app.tenant_field_mappings
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS tenant_field_mappings_seller_admin_delete ON app.tenant_field_mappings;
CREATE POLICY tenant_field_mappings_seller_admin_delete ON app.tenant_field_mappings
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the 3 known WineYard-driven system mappings for every zoho_books
-- tenant_integration, present and future, so this applies cross-tenant
-- without per-tenant setup.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.seed_system_field_mappings(p_tenant_integration_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM app.tenant_integrations WHERE id = p_tenant_integration_id;

  IF v_tenant_id IS NULL THEN RETURN; END IF;

  INSERT INTO app.tenant_field_mappings
    (tenant_id, tenant_integration_id, entity_type, zoho_field_name, target_column, transform_type, is_system)
  VALUES
    (v_tenant_id, p_tenant_integration_id, 'customers', 'cf_online_catalog_access', 'buyer_app_enabled', 'boolean_from_zoho', true),
    (v_tenant_id, p_tenant_integration_id, 'estimates', 'cf_catalog_estimate',      'is_buyer_app_estimate', 'boolean_from_zoho', true),
    (v_tenant_id, p_tenant_integration_id, 'invoices',  'cf_catalog_invoice',       'is_buyer_app_invoice',  'boolean_from_zoho', true)
  ON CONFLICT (tenant_integration_id, entity_type, zoho_field_name) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_tenant_integrations_seed_field_mappings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
BEGIN
  IF NEW.integration_type_id = 'zoho_books' THEN
    PERFORM app.seed_system_field_mappings(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_integrations_seed_field_mappings ON app.tenant_integrations;
CREATE TRIGGER trg_tenant_integrations_seed_field_mappings
  AFTER INSERT ON app.tenant_integrations
  FOR EACH ROW EXECUTE FUNCTION app.trg_tenant_integrations_seed_field_mappings();

-- Backfill: any zoho_books tenant_integration that already exists (e.g. WineYard).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM app.tenant_integrations WHERE integration_type_id = 'zoho_books'
  LOOP
    PERFORM app.seed_system_field_mappings(r.id);
  END LOOP;
END;
$$;
