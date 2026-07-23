-- Collapse whatsapp_templates.use_case to product buckets and register v2 broadcast templates.

ALTER TABLE app.whatsapp_templates
  DROP CONSTRAINT IF EXISTS whatsapp_templates_use_case_check;

-- Remap existing rows before applying the tighter CHECK (old values would violate it).
UPDATE app.whatsapp_templates
SET
  use_case = CASE meta_template_name
    WHEN 'login_otp' THEN 'otp_login'
    WHEN 'order_received_seller' THEN 'updates'
    WHEN 'order_received_buyer' THEN 'updates'
    WHEN 'request_received_seller' THEN 'updates'
    WHEN 'request_received_buyer' THEN 'updates'
    WHEN 'request_update_buyer' THEN 'updates'
    WHEN 'invoice_update_buyer' THEN 'updates'
    WHEN 'buyer_payment_reminder' THEN 'updates'
    WHEN 'campaign_published_buyer' THEN 'campaigns'
    ELSE use_case
  END,
  updated_at = now()
WHERE tenant_id IS NULL
  AND deleted_at IS NULL;

ALTER TABLE app.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_use_case_check
  CHECK (
    use_case = ANY (
      ARRAY[
        'updates'::text,
        'campaigns'::text,
        'buyer_app'::text,
        'engagement'::text,
        'announcements'::text,
        'otp_login'::text
      ]
    )
  );

-- invoice_update_buyer: transactional (non-broadcast), Meta-approved body (no markdown).
UPDATE app.whatsapp_templates
SET
  use_case = 'updates',
  meta_category = 'utility',
  locale = 'en',
  body = E'Hi {{buyer_name}},\n\nHere is invoice {{invoice_number}} for your review.\n\nAmount: ₹{{total_amount}} ({{item_count}} items)\n\nContact {{seller_name}} ({{seller_phone_number}}) for next steps.',
  variables = '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"invoice_number","description":"Invoice reference number"},{"key":"total_amount","description":"Invoice total in INR"},{"key":"item_count","description":"Number of line items"},{"key":"seller_name","description":"Seller business name"},{"key":"seller_phone_number","description":"Seller phone number"}]'::jsonb,
  button_config = '{"type":"url","url_template":"https://app.useyukti.in/buy/invoices/{{1}}","variable_source":"invoice_id"}'::jsonb,
  header_config = NULL,
  footer_text = 'Powered by Yukti',
  buttons_config = '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/invoices/{{1}}","variable_source":"invoice_id"}]'::jsonb,
  approval_status = 'approved',
  is_platform_managed = true,
  is_broadcast_template = false,
  updated_at = now()
WHERE tenant_id IS NULL
  AND meta_template_name = 'invoice_update_buyer'
  AND deleted_at IS NULL;

-- ── New broadcast templates (idempotent) ─────────────────────────────────────

INSERT INTO app.whatsapp_templates (
  tenant_id,
  meta_template_name,
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
  'beat_route_buyer',
  'utility',
  'engagement',
  'en',
  E'Hi {{buyer_name}},\n\nOur team from {{seller_name}} will be visiting you soon.\n\nVisit window: {{visit_date}} {{visit_time}}\nContact: {{seller_phone_number}}\n\nKeep your payments and any new stock requirements ready. \nYou can also place orders anytime in the app.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"seller_name","description":"Seller business name"},{"key":"visit_date","description":"Visit date, e.g. 26 July"},{"key":"visit_time","description":"Visit time window, e.g. 3:30PM-5:30PM"},{"key":"seller_phone_number","description":"Seller phone number"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/home"}'::jsonb,
  NULL,
  'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/home"}]'::jsonb,
  'approved',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM app.whatsapp_templates
  WHERE tenant_id IS NULL AND meta_template_name = 'beat_route_buyer'
);

INSERT INTO app.whatsapp_templates (
  tenant_id, meta_template_name, meta_category, use_case, locale,
  body, variables, button_config, header_config, footer_text, buttons_config,
  approval_status, is_platform_managed, is_broadcast_template
)
SELECT
  NULL,
  'new_stock_buyer',
  'marketing',
  'campaigns',
  'en',
  E'Hi {{buyer_name}},\n\n{{seller_name}} just added new stock.\n\n{{buyer_note}}\n\nCheck out latest arrivals and place your order in the app before it''s gone.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"seller_name","description":"Seller business name"},{"key":"buyer_note","description":"Seller note to the buyer from campaigns.message"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/home"}'::jsonb,
  NULL,
  'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/home"}]'::jsonb,
  'approved',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM app.whatsapp_templates
  WHERE tenant_id IS NULL AND meta_template_name = 'new_stock_buyer'
);

INSERT INTO app.whatsapp_templates (
  tenant_id, meta_template_name, meta_category, use_case, locale,
  body, variables, button_config, header_config, footer_text, buttons_config,
  approval_status, is_platform_managed, is_broadcast_template
)
SELECT
  NULL,
  'buyer_app_dormant',
  'marketing',
  'buyer_app',
  'en',
  E'Hi {{buyer_name}},\n\nYou''re all set up on the {{seller_name}}''s catalog app.\n\nPlace your first order whenever you''re ready. Until then, explore their products and review prices.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"seller_name","description":"Seller business name"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/home"}'::jsonb,
  NULL,
  'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/home"}]'::jsonb,
  'approved',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM app.whatsapp_templates
  WHERE tenant_id IS NULL AND meta_template_name = 'buyer_app_dormant'
);

INSERT INTO app.whatsapp_templates (
  tenant_id, meta_template_name, meta_category, use_case, locale,
  body, variables, button_config, header_config, footer_text, buttons_config,
  approval_status, is_platform_managed, is_broadcast_template
)
SELECT
  NULL,
  'buyer_app_adoption',
  'marketing',
  'buyer_app',
  'en',
  E'Hi {{buyer_name}},\n\n{{seller_name}} set up the catalog app for you, but it looks like you haven''t logged in yet.\n\nYou can explore their entire catalog, review prices, and place orders easily. It only takes a minute to get started.\n\nTap below to log in.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"seller_name","description":"Seller business name"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/home"}'::jsonb,
  NULL,
  'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/home"}]'::jsonb,
  'approved',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM app.whatsapp_templates
  WHERE tenant_id IS NULL AND meta_template_name = 'buyer_app_adoption'
);

INSERT INTO app.whatsapp_templates (
  tenant_id, meta_template_name, meta_category, use_case, locale,
  body, variables, button_config, header_config, footer_text, buttons_config,
  approval_status, is_platform_managed, is_broadcast_template
)
SELECT
  NULL,
  'buyer_app_enabled',
  'marketing',
  'buyer_app',
  'en',
  E'Hi {{buyer_name}},\n\n{{seller_name}} has enabled the catalog app for you.\n\nYou can now explore their latest stock, check prices, and place orders anytime.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"seller_name","description":"Seller business name"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/home"}'::jsonb,
  '{"format":"text","text":"Catalog enabled for you"}'::jsonb,
  'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/home"}]'::jsonb,
  'approved',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM app.whatsapp_templates
  WHERE tenant_id IS NULL AND meta_template_name = 'buyer_app_enabled'
);

-- Refresh broadcast flags for all platform templates.
UPDATE app.whatsapp_templates
SET
  is_broadcast_template = (
    use_case IN ('campaigns', 'buyer_app', 'engagement', 'announcements')
    OR meta_template_name = 'buyer_payment_reminder'
  ),
  updated_at = now()
WHERE tenant_id IS NULL
  AND deleted_at IS NULL;

-- Backfill historical broadcast rows to consolidated use_case values.
UPDATE app.whatsapp_broadcasts wb
SET
  use_case = wt.use_case,
  updated_at = now()
FROM app.whatsapp_templates wt
WHERE wb.whatsapp_template_id = wt.id
  AND wb.use_case IS DISTINCT FROM wt.use_case
  AND wb.deleted_at IS NULL;
