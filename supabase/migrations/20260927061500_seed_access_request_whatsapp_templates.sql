-- Seed the 6 buyer-approval-flow WhatsApp templates (Yukti_Public-Signup_Backend-Plan_v1.md §5).
-- Copy/components below are the exact live definitions pulled from Meta (GET
-- /{waba_id}/message_templates); all 6 are Meta-APPROVED as of this migration (2026-09-27),
-- not the structural drafts in the spec doc. See src/lib/server/buyer-approval-notify.ts for
-- the send path (lookupApprovedTemplateMeta() only matches approval_status='approved').

INSERT INTO app.whatsapp_templates (
  tenant_id, meta_template_name, meta_template_id, meta_category, use_case, locale,
  body, variables, button_config, header_config, footer_text, buttons_config,
  approval_status, is_platform_managed, is_broadcast_template
)
SELECT
  NULL,
  'access_request_received_buyer',
  '1563941444952117',
  'utility',
  'buyer_app',
  'en',
  E'Hi {{buyer_name}},\n\nYour request to access *{{seller_name}}*''s catalog has been received. Someone from the team will review it, usually within 1-2 business days.',
  '[{"key":"buyer_name","description":"Buyer contact name"},{"key":"seller_name","description":"Tenant display name"}]'::jsonb,
  NULL,
  NULL,
  'Powered by Yukti',
  NULL,
  'approved',
  true,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM app.whatsapp_templates
  WHERE tenant_id IS NULL AND meta_template_name = 'access_request_received_buyer'
);

INSERT INTO app.whatsapp_templates (
  tenant_id, meta_template_name, meta_template_id, meta_category, use_case, locale,
  body, variables, button_config, header_config, footer_text, buttons_config,
  approval_status, is_platform_managed, is_broadcast_template
)
SELECT
  NULL,
  'access_request_received_seller_business',
  '1954714822581647',
  'utility',
  'buyer_app',
  'en',
  E'Hi {{seller_name}} team,\n\n*{{buyer_name}}* wants access to your catalog as a registered dealer. Review the request in your Yukti inbox.',
  '[{"key":"seller_name","description":"Seller contact/admin name"},{"key":"buyer_name","description":"Buyer business name"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/today/{{1}}","variable_source":"buyer_id"}'::jsonb,
  '{"format":"text","text":"New Access Request - Dealer"}'::jsonb,
  'Powered by Yukti',
  '[{"type":"url","index":"0","text":"Review Request","url_template":"https://app.useyukti.in/today/{{1}}","variable_source":"buyer_id"}]'::jsonb,
  'approved',
  true,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM app.whatsapp_templates
  WHERE tenant_id IS NULL AND meta_template_name = 'access_request_received_seller_business'
);

INSERT INTO app.whatsapp_templates (
  tenant_id, meta_template_name, meta_template_id, meta_category, use_case, locale,
  body, variables, button_config, header_config, footer_text, buttons_config,
  approval_status, is_platform_managed, is_broadcast_template
)
SELECT
  NULL,
  'access_request_received_seller_individual',
  '2359442588130512',
  'utility',
  'buyer_app',
  'en',
  E'Hi {{seller_name}},\n\n*{{buyer_name}}* wants access to your catalog. Review the request in your Yukti inbox.',
  '[{"key":"seller_name","description":"Seller contact/admin name"},{"key":"buyer_name","description":"Buyer contact name"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/today/{{1}}","variable_source":"buyer_id"}'::jsonb,
  '{"format":"text","text":"New Access Request - Customer"}'::jsonb,
  'Powered by Yukti',
  '[{"type":"url","index":"0","text":"Review Request","url_template":"https://app.useyukti.in/today/{{1}}","variable_source":"buyer_id"}]'::jsonb,
  'approved',
  true,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM app.whatsapp_templates
  WHERE tenant_id IS NULL AND meta_template_name = 'access_request_received_seller_individual'
);

INSERT INTO app.whatsapp_templates (
  tenant_id, meta_template_name, meta_template_id, meta_category, use_case, locale,
  body, variables, button_config, header_config, footer_text, buttons_config,
  approval_status, is_platform_managed, is_broadcast_template
)
SELECT
  NULL,
  'access_request_approved_buyer',
  '1621969106252150',
  'utility',
  'buyer_app',
  'en',
  E'Hi {{buyer_name}},\n\nYour account with *{{seller_name}} is now active*. You can log in and start browsing their catalog.',
  '[{"key":"buyer_name","description":"Buyer contact name"},{"key":"seller_name","description":"Tenant display name"}]'::jsonb,
  '{"type":"url","url_template":"https://catalog.useyukti.in/"}'::jsonb,
  '{"format":"text","text":"Account activated"}'::jsonb,
  'Powered by Yukti',
  '[{"type":"url","index":"0","text":"Login","url_template":"https://catalog.useyukti.in/"}]'::jsonb,
  'approved',
  true,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM app.whatsapp_templates
  WHERE tenant_id IS NULL AND meta_template_name = 'access_request_approved_buyer'
);

INSERT INTO app.whatsapp_templates (
  tenant_id, meta_template_name, meta_template_id, meta_category, use_case, locale,
  body, variables, button_config, header_config, footer_text, buttons_config,
  approval_status, is_platform_managed, is_broadcast_template
)
SELECT
  NULL,
  'access_more_info_needed_buyer',
  '1251707673781919',
  'utility',
  'buyer_app',
  'en',
  E'Hi {{buyer_name}},\n\n*{{seller_name}}* needs a bit more information before your account can be approved: {{missing_fields}}. \n\nLog in to add the details.',
  '[{"key":"buyer_name","description":"Buyer contact name"},{"key":"seller_name","description":"Tenant display name"},{"key":"missing_fields","description":"Comma-joined list of missing fields"}]'::jsonb,
  '{"type":"url","url_template":"https://catalog.useyukti.in/"}'::jsonb,
  '{"format":"text","text":"More details requested"}'::jsonb,
  'Powered by Yukti',
  '[{"type":"url","index":"0","text":"Login","url_template":"https://catalog.useyukti.in/"}]'::jsonb,
  'approved',
  true,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM app.whatsapp_templates
  WHERE tenant_id IS NULL AND meta_template_name = 'access_more_info_needed_buyer'
);

INSERT INTO app.whatsapp_templates (
  tenant_id, meta_template_name, meta_template_id, meta_category, use_case, locale,
  body, variables, button_config, header_config, footer_text, buttons_config,
  approval_status, is_platform_managed, is_broadcast_template
)
SELECT
  NULL,
  'access_request_declined_buyer',
  '1842535146743068',
  'utility',
  'buyer_app',
  'en',
  E'Hi {{buyer_name}},\n\nYour access request for *{{seller_name}} was not approved*. \n\nYou can contact {{seller_phone_number}} for more details.',
  '[{"key":"buyer_name","description":"Buyer contact name"},{"key":"seller_name","description":"Tenant display name"},{"key":"seller_phone_number","description":"Seller contact phone number"}]'::jsonb,
  NULL,
  NULL,
  'Powered by Yukti',
  NULL,
  'approved',
  true,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM app.whatsapp_templates
  WHERE tenant_id IS NULL AND meta_template_name = 'access_request_declined_buyer'
);
