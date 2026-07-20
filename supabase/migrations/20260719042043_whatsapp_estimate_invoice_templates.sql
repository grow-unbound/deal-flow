ALTER TABLE app.whatsapp_templates
  DROP CONSTRAINT IF EXISTS whatsapp_templates_use_case_check;

ALTER TABLE app.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_use_case_check
  CHECK (
    use_case = ANY (
      ARRAY[
        'payment_reminder'::text,
        'new_stock'::text,
        'campaign_announcement'::text,
        'beat_route'::text,
        'buyer_app_nudge'::text,
        'dormant_reengagement'::text,
        'order_notification'::text,
        'estimate_notification'::text,
        'invoice_notification'::text,
        'otp'::text,
        'otp_login'::text
      ]
    )
  );

ALTER TABLE app.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_related_entity_type_check;

ALTER TABLE app.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_related_entity_type_check
  CHECK (
    related_entity_type IS NULL
    OR related_entity_type = ANY (ARRAY['estimates'::text, 'orders'::text, 'invoices'::text])
  );

UPDATE app.whatsapp_templates
SET
  meta_category = 'utility',
  use_case = 'estimate_notification',
  locale = 'en',
  body = E'Hi {{buyer_name}},\n\nHere is your enquiry {{request_number}} for ₹{{total_amount}} ({{item_count}} items).\n\nContact {{seller_name}} ({{seller_phone_number}}) to confirm the order at these prices.',
  variables = '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"request_number","description":"Estimate/request reference number"},{"key":"total_amount","description":"Request total in INR"},{"key":"item_count","description":"Number of line items"},{"key":"seller_name","description":"Seller business name"},{"key":"seller_phone_number","description":"Seller phone number"}]'::jsonb,
  button_config = '{"type":"url","url_template":"https://app.useyukti.in/buy/estimates/{{1}}","variable_source":"estimate_id"}'::jsonb,
  header_config = NULL,
  footer_text = 'Powered by Yukti',
  buttons_config = '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/estimates/{{1}}","variable_source":"estimate_id"}]'::jsonb,
  approval_status = 'approved',
  is_platform_managed = true,
  is_broadcast_template = false,
  updated_at = now()
WHERE tenant_id IS NULL
  AND meta_template_name = 'request_update_buyer';

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
  'request_update_buyer',
  'utility',
  'estimate_notification',
  'en',
  E'Hi {{buyer_name}},\n\nHere is your enquiry {{request_number}} for ₹{{total_amount}} ({{item_count}} items).\n\nContact {{seller_name}} ({{seller_phone_number}}) to confirm the order at these prices.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"request_number","description":"Estimate/request reference number"},{"key":"total_amount","description":"Request total in INR"},{"key":"item_count","description":"Number of line items"},{"key":"seller_name","description":"Seller business name"},{"key":"seller_phone_number","description":"Seller phone number"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/estimates/{{1}}","variable_source":"estimate_id"}'::jsonb,
  NULL,
  'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/estimates/{{1}}","variable_source":"estimate_id"}]'::jsonb,
  'approved',
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM app.whatsapp_templates
  WHERE tenant_id IS NULL
    AND meta_template_name = 'request_update_buyer'
);

UPDATE app.whatsapp_templates
SET
  meta_category = 'utility',
  use_case = 'invoice_notification',
  locale = 'en',
  body = E'Hi {{buyer_name}},\n\nHere is invoice **{{invoice_number}}** for your review.\n\nAmount: **₹{{total_amount}} ({{item_count}} items)**\n\nContact {{seller_name}} ({{seller_phone_number}}) for next steps.',
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
  AND meta_template_name = 'invoice_update_buyer';

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
  'invoice_update_buyer',
  'utility',
  'invoice_notification',
  'en',
  E'Hi {{buyer_name}},\n\nHere is invoice **{{invoice_number}}** for your review.\n\nAmount: **₹{{total_amount}} ({{item_count}} items)**\n\nContact {{seller_name}} ({{seller_phone_number}}) for next steps.',
  '[{"key":"buyer_name","description":"Buyer contact or business name"},{"key":"invoice_number","description":"Invoice reference number"},{"key":"total_amount","description":"Invoice total in INR"},{"key":"item_count","description":"Number of line items"},{"key":"seller_name","description":"Seller business name"},{"key":"seller_phone_number","description":"Seller phone number"}]'::jsonb,
  '{"type":"url","url_template":"https://app.useyukti.in/buy/invoices/{{1}}","variable_source":"invoice_id"}'::jsonb,
  NULL,
  'Powered by Yukti',
  '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/invoices/{{1}}","variable_source":"invoice_id"}]'::jsonb,
  'approved',
  true,
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM app.whatsapp_templates
  WHERE tenant_id IS NULL
    AND meta_template_name = 'invoice_update_buyer'
);
