ALTER TABLE app.tenant_users
  ADD COLUMN IF NOT EXISTS full_name text;

UPDATE app.tenant_users tu
SET full_name = COALESCE(
  NULLIF(au.raw_user_meta_data->>'full_name', ''),
  NULLIF(au.raw_user_meta_data->>'display_name', ''),
  NULLIF(trim(concat_ws(' ', au.raw_user_meta_data->>'first_name', au.raw_user_meta_data->>'last_name')), ''),
  au.email
)
FROM auth.users au
WHERE tu.user_id = au.id
  AND tu.full_name IS NULL;

DROP FUNCTION IF EXISTS app.create_tenant_and_admin(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text
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
  v_subdomain := p_slug || '.yukti.so';

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
        'show_out_of_stock', true
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

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'slug', p_slug,
    'subdomain', v_subdomain
  );
END;
$function$;

GRANT ALL ON FUNCTION app.create_tenant_and_admin(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text,
  text
) TO service_role;

INSERT INTO app.whatsapp_templates (
  tenant_id,
  meta_template_name,
  display_name,
  meta_category,
  use_case,
  locale,
  body,
  variables,
  button_config,
  header_config,
  footer_text,
  buttons_config,
  approval_status,
  is_platform_managed,
  is_broadcast_template
)
SELECT
  NULL,
  'invite_user_seller',
  'Invite seller user',
  'utility',
  'updates',
  'en',
  E'Hi {{seller_user}},\n\n{{seller_name}} has invited you to join Yukti.\n\nTo activate your account, tap the button below. You will verify your phone number and then create a password for alternate email login.\n\nIf you were not expecting this invite, please ignore this message.',
  '[{"key":"seller_user","description":"Teammate first name or full name"},{"key":"seller_name","description":"Tenant or business name"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/activate"}'::jsonb,
  '{"format":"text","text":"Welcome to Yukti"}'::jsonb,
  'Powered by Yukti',
  '[{"type":"url","url_template":"https://app.useyukti.in/activate"}]'::jsonb,
  'approved',
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM app.whatsapp_templates
  WHERE tenant_id IS NULL
    AND meta_template_name = 'invite_user_seller'
);
