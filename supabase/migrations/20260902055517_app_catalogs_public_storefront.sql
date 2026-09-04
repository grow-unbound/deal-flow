-- Public catalog primitive (independent of campaigns) + guest scrape limiter.
-- Canonical storefront host is computed from tenants.slug + useyukti.in; do not
-- store the suffix. Guest APIs use service_role after hostname checks.

CREATE TABLE IF NOT EXISTS app.catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('public', 'named')),
  include_all boolean NOT NULL DEFAULT true,
  pricing_mode text CHECK (pricing_mode IN ('hidden_until_login', 'base_selling_rate', 'assigned_price_list')),
  price_list_id uuid REFERENCES app.price_lists(id) ON DELETE RESTRICT,
  live_at timestamptz,
  name text,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  UNIQUE (tenant_id, external_ref)
);

CREATE UNIQUE INDEX catalogs_one_public_per_tenant
  ON app.catalogs (tenant_id)
  WHERE kind = 'public' AND deleted_at IS NULL;

CREATE INDEX idx_catalogs_tenant_id ON app.catalogs (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_catalogs_live ON app.catalogs (tenant_id, live_at) WHERE kind = 'public' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.catalog_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  catalog_id uuid NOT NULL REFERENCES app.catalogs(id) ON DELETE RESTRICT,
  tenant_product_id uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE RESTRICT,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  UNIQUE (catalog_id, tenant_product_id)
);

CREATE UNIQUE INDEX catalog_exclusions_tenant_external_ref
  ON app.catalog_exclusions (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL;

CREATE INDEX idx_catalog_exclusions_catalog ON app.catalog_exclusions (catalog_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.public_catalog_rate_limits (
  key text PRIMARY KEY,
  hit_count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

  RETURN NEW;
END;
$$;

CREATE TRIGGER catalogs_validate_pricing
  BEFORE INSERT OR UPDATE ON app.catalogs
  FOR EACH ROW EXECUTE FUNCTION app.catalogs_validate_pricing();

CREATE OR REPLACE FUNCTION app.catalogs_prevent_public_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'app'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.kind = 'public' THEN
      RAISE EXCEPTION 'system public catalog cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.kind = 'public' AND NEW.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'system public catalog cannot be deleted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER catalogs_prevent_public_delete
  BEFORE UPDATE OR DELETE ON app.catalogs
  FOR EACH ROW EXECUTE FUNCTION app.catalogs_prevent_public_delete();

CREATE TRIGGER catalogs_updated_at
  BEFORE UPDATE ON app.catalogs
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER catalog_exclusions_updated_at
  BEFORE UPDATE ON app.catalog_exclusions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.catalog_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.public_catalog_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalogs_seller_select ON app.catalogs
  FOR SELECT TO authenticated
  USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY catalogs_seller_insert ON app.catalogs
  FOR INSERT TO authenticated
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY catalogs_seller_update ON app.catalogs
  FOR UPDATE TO authenticated
  USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY catalog_exclusions_seller_select ON app.catalog_exclusions
  FOR SELECT TO authenticated
  USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY catalog_exclusions_seller_insert ON app.catalog_exclusions
  FOR INSERT TO authenticated
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY catalog_exclusions_seller_update ON app.catalog_exclusions
  FOR UPDATE TO authenticated
  USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY catalog_exclusions_seller_delete ON app.catalog_exclusions
  FOR DELETE TO authenticated
  USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY catalogs_service_role_all ON app.catalogs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY catalog_exclusions_service_role_all ON app.catalog_exclusions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY public_catalog_rate_limits_service_role_only ON app.public_catalog_rate_limits
  AS RESTRICTIVE
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE app.catalogs FROM anon;
REVOKE ALL ON TABLE app.catalog_exclusions FROM anon;
REVOKE ALL ON TABLE app.public_catalog_rate_limits FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE app.catalogs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.catalog_exclusions TO authenticated;
GRANT ALL ON TABLE app.catalogs TO service_role;
GRANT ALL ON TABLE app.catalog_exclusions TO service_role;
GRANT ALL ON TABLE app.public_catalog_rate_limits TO service_role;

INSERT INTO app.catalogs (tenant_id, kind, include_all, created_at, updated_at)
SELECT t.id, 'public', true, now(), now()
FROM app.tenants t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM app.catalogs c
    WHERE c.tenant_id = t.id AND c.kind = 'public' AND c.deleted_at IS NULL
  );

CREATE OR REPLACE FUNCTION app.create_tenant_and_admin(
  p_user_id uuid,
  p_slug text,
  p_business_name text,
  p_business_phone text DEFAULT NULL::text,
  p_business_email text DEFAULT NULL::text,
  p_whatsapp_phone text DEFAULT NULL::text,
  p_primary_state text DEFAULT NULL::text,
  p_gstin text DEFAULT NULL::text,
  p_initial_settings jsonb DEFAULT '{}'::jsonb,
  p_user_email text DEFAULT NULL::text,
  p_user_phone text DEFAULT NULL::text,
  p_user_full_name text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_subdomain text;
  v_settings jsonb;
BEGIN
  -- Store the DNS label only. Canonical host is {slug}.useyukti.in in app code.
  v_subdomain := p_slug;

  INSERT INTO app.tenants (
    slug, business_name, gstin, primary_state,
    subdomain, created_by, updated_by
  ) VALUES (
    p_slug, p_business_name, p_gstin, p_primary_state,
    v_subdomain, p_user_id, p_user_id
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO app.tenant_users (
    tenant_id, user_id, full_name, email, phone, role, joined_at, created_by, updated_by
  ) VALUES (
    v_tenant_id,
    p_user_id,
    p_user_full_name,
    COALESCE(p_user_email, p_business_email),
    COALESCE(p_user_phone, p_business_phone),
    'seller_admin',
    now(),
    p_user_id,
    p_user_id
  );

  v_settings := app.jsonb_deep_merge(
    jsonb_build_object(
      'business', jsonb_build_object(
        'company_name', p_business_name,
        'gstin', '',
        'logo_url', NULL,
        'address', jsonb_build_object(
          'line1', '',
          'line2', '',
          'city', '',
          'state', '',
          'pincode', ''
        ),
        'phone', COALESCE(p_business_phone, ''),
        'email', COALESCE(p_business_email, '')
      ),
      'product_defaults', jsonb_build_object('uom', 'PCS'),
      'orders', jsonb_build_object(
        'enquiry_number_format', 'EST-{YYYY}-{SEQ}',
        'sales_order_number_format', 'SO-{YYYY}-{SEQ}',
        'invoice_number_format', 'INV-{YYYY}-{SEQ}',
        'inventory_lock_stage', 'sales_order',
        'invoice_pdf_enabled', false,
        'features', jsonb_build_object(
          'enquiries', false,
          'sales_orders', false,
          'invoices', false,
          'create_enquiries', true,
          'create_sales_orders', true,
          'create_invoices', true
        )
      ),
      'buyer_app', jsonb_build_object(
        'enabled', false,
        'whatsapp_number', COALESCE(p_whatsapp_phone, COALESCE(p_business_phone, '')),
        'share_link_expiry_enabled', false,
        'share_link_expiry_days', 90,
        'credit_limit_visible', true,
        'show_out_of_stock', true,
        'stock_visibility_enabled', false,
        'block_order_on_oos', false
      ),
      'catalog', jsonb_build_object(
        'price_lists_enabled', false,
        'cohort_pricing_enabled', false,
        'price_visibility', 'discounted_only',
        'catalog_publishing_enabled', false,
        'default_catalog_expiry_days', 0
      ),
      'notifications', jsonb_build_object(
        'whatsapp', jsonb_build_object(
          'enquiry_received', true,
          'order_placed', true,
          'order_confirmed_to_buyer', true,
          'dispatch_to_buyer', true,
          'catalog_shared_to_buyer', true,
          'response_eta_hours', 24
        )
      ),
      'business_policy', jsonb_build_object(
        'credit_enabled', true,
        'gst_inclusive', false,
        'gst_rate', 18
      ),
      'delivery_routing_threshold_km', 50
    ),
    COALESCE(p_initial_settings, '{}'::jsonb)
  );

  INSERT INTO app.tenant_settings (tenant_id, settings, updated_by)
  VALUES (v_tenant_id, v_settings, p_user_id)
  ON CONFLICT (tenant_id) DO UPDATE SET
    settings = EXCLUDED.settings,
    updated_at = now(),
    updated_by = p_user_id;

  INSERT INTO app.catalogs (tenant_id, kind, include_all, created_by, updated_by)
  VALUES (v_tenant_id, 'public', true, p_user_id, p_user_id);

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'slug', p_slug,
    'subdomain', p_slug || '.useyukti.in'
  );
END;
$function$;

GRANT ALL ON FUNCTION app.create_tenant_and_admin(
  uuid, text, text, text, text, text, text, text, jsonb, text, text, text
) TO service_role;
