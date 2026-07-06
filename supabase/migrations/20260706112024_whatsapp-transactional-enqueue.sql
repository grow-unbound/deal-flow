-- WhatsApp transactional enqueue pipeline
-- Spec: DealFlow_WhatsApp-Broadcast-Spec_v4.md §4.3, §5, §7.1
--
-- Adds send_payload + idempotency columns to app.whatsapp_messages,
-- seeds the 5 live transactional templates, and indexes processing queue rows
-- for the whatsapp-dispatch-worker edge function.
--
-- Meta delivery status webhooks: subscribe to "messages" field with status
-- updates in the Meta App Dashboard (handled by whatsapp-inbound-webhook).

ALTER TABLE app.whatsapp_messages
  ADD COLUMN IF NOT EXISTS send_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS related_entity_type text
    CHECK (related_entity_type IS NULL OR related_entity_type IN ('estimates', 'orders')),
  ADD COLUMN IF NOT EXISTS related_entity_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_transaction_idempotency
  ON app.whatsapp_messages (tenant_id, trigger_source, related_entity_id, recipient_phone)
  WHERE related_entity_id IS NOT NULL
    AND status <> 'failed';

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_queue_processing
  ON app.whatsapp_send_queue (priority, created_at)
  WHERE status = 'processing';

-- Expand use_case enum for transactional templates
ALTER TABLE app.whatsapp_templates
  DROP CONSTRAINT IF EXISTS whatsapp_templates_use_case_check;

ALTER TABLE app.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_use_case_check
  CHECK (use_case IN (
    'payment_reminder',
    'new_stock',
    'campaign_announcement',
    'beat_route',
    'buyer_app_nudge',
    'dormant_reengagement',
    'order_notification',
    'estimate_notification',
    'otp',
    'otp_login'
  ));

-- ── Seed 5 transactional templates (platform-managed, already live with Meta) ──
INSERT INTO app.whatsapp_templates (
  tenant_id,
  meta_template_name,
  meta_category,
  use_case,
  locale,
  body,
  variables,
  button_config,
  approval_status,
  is_platform_managed
) VALUES
(
  NULL,
  'login_otp',
  'authentication',
  'otp_login',
  'en_US',
  E'OTP Code: {{1}}. This is your OTP code for {{2}}. For your security, do not share this code.\n\nIf you have any concerns or questions, contact us at {{3}}.',
  '[
    {"key": "otp", "description": "OTP code"},
    {"key": "product_name", "description": "Product/app name"},
    {"key": "support_number", "description": "Support contact number"}
  ]'::jsonb,
  NULL,
  'approved',
  true
),
(
  NULL,
  'order_received_seller',
  'utility',
  'order_notification',
  'en',
  E'Hello {{seller_location}} team,\n\nThere is a new order for your location. Here are the details.\n\nCustomer Name: {{buyer_name}}\nPhone Number: {{buyer_phone_number}}\nOrder Number: {{order_number}}\nTotal Amount: ₹{{total_amount}} ({{item_count}} items)\n\nPlease contact the buyer in the next {{eta}} hours.',
  '[
    {"key": "seller_location", "description": "Seller location/warehouse name"},
    {"key": "buyer_name", "description": "Buyer contact or business name"},
    {"key": "buyer_phone_number", "description": "Buyer phone number"},
    {"key": "order_number", "description": "Order reference number"},
    {"key": "total_amount", "description": "Order total in INR"},
    {"key": "item_count", "description": "Number of line items"},
    {"key": "eta", "description": "Response time commitment in hours"}
  ]'::jsonb,
  '{"type": "url", "url_template": "https://app.yukti.so/estimates/{{1}}", "variable_source": "order_id"}'::jsonb,
  'approved',
  true
),
(
  NULL,
  'order_received_buyer',
  'utility',
  'order_notification',
  'en',
  E'Hello {{buyer_name}},\n\nWe received your order for {{item_count}} items. Here are your details.\n\nOrder Number: {{order_number}}\nTotal Amount: ₹{{total_amount}}\n\nOur {{seller_name}} team from {{seller_location}} will contact you in {{eta}} hours.',
  '[
    {"key": "buyer_name", "description": "Buyer contact or business name"},
    {"key": "item_count", "description": "Number of line items"},
    {"key": "order_number", "description": "Order reference number"},
    {"key": "total_amount", "description": "Order total in INR"},
    {"key": "seller_name", "description": "Seller business name"},
    {"key": "seller_location", "description": "Seller location/warehouse name"},
    {"key": "eta", "description": "Expected response time in hours"}
  ]'::jsonb,
  '{"type": "url", "url_template": "https://app.yukti.so/buy/estimates/{{1}}", "variable_source": "order_id"}'::jsonb,
  'approved',
  true
),
(
  NULL,
  'request_received_seller',
  'utility',
  'estimate_notification',
  'en',
  E'Hello {{seller_location}} team, ,\n\nThere is a new request for your location. Here are the details.\n\nCustomer Name: {{buyer_name}}\nPhone Number: {{buyer_phone_number}}\nEstimate Number: {{request_number}}\nTotal Amount: ₹{{total_amount}} ({{item_count}} items)\n\nPlease contact the buyer in the next {{eta}} hours.',
  '[
    {"key": "seller_location", "description": "Seller location/warehouse name"},
    {"key": "buyer_name", "description": "Buyer contact or business name"},
    {"key": "buyer_phone_number", "description": "Buyer phone number"},
    {"key": "request_number", "description": "Estimate/request reference number"},
    {"key": "total_amount", "description": "Request total in INR"},
    {"key": "item_count", "description": "Number of line items"},
    {"key": "eta", "description": "Response time commitment in hours"}
  ]'::jsonb,
  '{"type": "url", "url_template": "https://app.yukti.so/orders/{{1}}", "variable_source": "estimate_id"}'::jsonb,
  'approved',
  true
),
(
  NULL,
  'request_received_buyer',
  'utility',
  'estimate_notification',
  'en',
  E'Hello {{buyer_name}},\n\nWe received your request for {{item_count}} items. Here are your details.\n\nRequest Number: {{estimate_number}}\nTotal Amount: ₹{{total_amount}}\n\nOur {{seller_name}} team from {{seller_location}} will contact you in {{eta}} hours.',
  '[
    {"key": "buyer_name", "description": "Buyer contact or business name"},
    {"key": "item_count", "description": "Number of line items"},
    {"key": "estimate_number", "description": "Estimate/request reference number"},
    {"key": "total_amount", "description": "Request total in INR"},
    {"key": "seller_name", "description": "Seller business name"},
    {"key": "seller_location", "description": "Seller location/warehouse name"},
    {"key": "eta", "description": "Expected response time in hours"}
  ]'::jsonb,
  '{"type": "url", "url_template": "https://app.yukti.so/buy/orders/{{1}}", "variable_source": "estimate_id"}'::jsonb,
  'approved',
  true
)
ON CONFLICT (tenant_id, meta_template_name) DO UPDATE SET
  meta_category = EXCLUDED.meta_category,
  use_case = EXCLUDED.use_case,
  locale = EXCLUDED.locale,
  body = EXCLUDED.body,
  variables = EXCLUDED.variables,
  button_config = EXCLUDED.button_config,
  approval_status = EXCLUDED.approval_status,
  is_platform_managed = EXCLUDED.is_platform_managed,
  updated_at = now();
