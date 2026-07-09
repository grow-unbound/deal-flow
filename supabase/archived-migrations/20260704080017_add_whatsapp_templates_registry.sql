-- WhatsApp Broadcast — Phase D: template registry
-- Spec: CLAUDE OUTPUTS/DealFlow/DealFlow_WhatsApp-Broadcast-Spec_v4.md §4.1, §12
--
-- Platform-managed Meta template registry. For MVP every row has
-- tenant_id = NULL and is_platform_managed = true — sellers pick from a
-- fixed menu, they never author or submit templates to Meta themselves
-- (see spec §4.1). Seeds the 6 templates drafted in §12, all
-- approval_status = 'pending' until manually confirmed approved with Meta.

CREATE TABLE app.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES app.tenants(id),

  meta_template_name text NOT NULL,
  meta_template_id text,

  meta_category text NOT NULL
    CHECK (meta_category IN ('marketing', 'utility', 'authentication')),

  use_case text NOT NULL
    CHECK (use_case IN (
      'payment_reminder',
      'new_stock',
      'campaign_announcement',
      'beat_route',
      'buyer_app_nudge',
      'dormant_reengagement',
      'order_notification',
      'otp'
    )),

  locale text DEFAULT 'en',
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]',
  button_config jsonb,

  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'disabled')),
  is_platform_managed boolean DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,

  CONSTRAINT whatsapp_templates_tenant_name_unique UNIQUE (tenant_id, meta_template_name)
);

CREATE TRIGGER whatsapp_templates_updated_at
  BEFORE UPDATE ON app.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Sellers need to see the template menu to build broadcasts later (Phase E).
-- Platform-managed rows (tenant_id IS NULL) are readable by any authenticated
-- seller; per-tenant rows (future, not used in MVP) are scoped to their tenant.
-- No INSERT/UPDATE/DELETE policy for regular roles — template management is
-- platform-admin/service-role only for MVP.
CREATE POLICY whatsapp_templates_select ON app.whatsapp_templates
  FOR SELECT USING (
    app.is_seller() AND (tenant_id IS NULL OR tenant_id = app.jwt_tenant_id())
  );

-- ── FK from Phase A ledger, deferred until this table existed ───────────────
ALTER TABLE app.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_whatsapp_template_id_fkey
  FOREIGN KEY (whatsapp_template_id) REFERENCES app.whatsapp_templates(id);

-- ── Seed: 6 platform-managed templates from spec §12 ────────────────────────
-- tenant_id NULL, approval_status 'pending' (not yet confirmed approved by
-- Meta), is_platform_managed true. meta_template_name = use_case key per
-- Phase D instructions (use_case column keeps the shorter spec-native key
-- where it differs, e.g. 'new_stock' vs meta_template_name 'new_stock_marketing').

INSERT INTO app.whatsapp_templates (
  tenant_id, meta_template_name, meta_category, use_case, locale, body, variables, button_config, approval_status, is_platform_managed
) VALUES
(
  NULL,
  'payment_reminder',
  'utility',
  'payment_reminder',
  'en',
  E'Hi {{buyer_name}},\n\nThis is a payment reminder from {{seller_name}}.\n\nAmount due: ₹{{outstanding_amount}}\nOverdue by: {{overdue_days}} days\nContact: {{seller_phone_number}}\n\nView and pay your dues anytime in the app.',
  '[
    {"key": "buyer_name", "description": "Buyer''s first name, truncated at render time, not full contact/business name"},
    {"key": "seller_name", "description": "server-composed display name, plain or with location suffix for routing contexts", "source_field": "tenant_settings.whatsapp_display_name or business_name fallback"},
    {"key": "outstanding_amount", "description": "Sum of app.invoices.outstanding_balance for this buyer, INR"},
    {"key": "overdue_days", "description": "Days since invoice_date + payment_terms_days, computed at send time"},
    {"key": "seller_phone_number", "description": "Distributor''s contact number (repurposed Settings field)"}
  ]'::jsonb,
  '{"type": "url", "url_template": "https://app.yukti.so/buy/invoices/{{1}}", "variable_source": "buyer_id_or_invoice_list_reference"}'::jsonb,
  'pending',
  true
),
(
  NULL,
  'new_stock_marketing',
  'marketing',
  'new_stock',
  'en',
  E'Hi {{buyer_name}},\n\n{{seller_name}} just added new stock — {{highlight_text}}\n\nCheck out the latest arrivals and place your order in the app before it''s gone.\n\nReply STOP to stop marketing messages.',
  '[
    {"key": "buyer_name", "description": "Buyer''s first name"},
    {"key": "seller_name", "description": "server-composed display name, plain or with location suffix for routing contexts", "source_field": "tenant_settings.whatsapp_display_name or business_name fallback"},
    {"key": "highlight_text", "description": "Short free-text line the seller fills in per broadcast, e.g. \"New arrivals in Brand X CCTV cameras\""}
  ]'::jsonb,
  '{"type": "url", "url_template": "https://app.yukti.so/buy/campaigns/{{1}}", "variable_source": "campaign_id"}'::jsonb,
  'pending',
  true
),
(
  NULL,
  'campaign_announcement',
  'marketing',
  'campaign_announcement',
  'en',
  E'Hi {{buyer_name}},\n\n{{seller_name}} has a new campaign live — {{campaign_title}}\n\nCheck it out and place your order in the app.\n\nReply STOP to stop marketing messages.',
  '[
    {"key": "buyer_name", "description": "Buyer''s first name"},
    {"key": "seller_name", "description": "server-composed display name, plain or with location suffix for routing contexts", "source_field": "tenant_settings.whatsapp_display_name or business_name fallback"},
    {"key": "campaign_title", "description": "The actual name/title of the Campaign the seller published, pulled from app.campaigns.name, not free-typed per send"}
  ]'::jsonb,
  '{"type": "url", "url_template": "https://app.yukti.so/buy/campaigns/{{1}}", "variable_source": "campaign_id"}'::jsonb,
  'pending',
  true
),
(
  NULL,
  'beat_route_arrival',
  'utility',
  'beat_route',
  'en',
  E'Hi {{buyer_name}},\n\nOur team from {{seller_name}} will be visiting you soon.\n\nVisit window: {{visit_window}}\nContact: {{seller_phone_number}}\n\nKeep your payments and any new stock requirements ready. You can also place orders anytime in the app.',
  '[
    {"key": "buyer_name", "description": "Buyer''s first name"},
    {"key": "seller_name", "description": "server-composed display name, plain or with location suffix for routing contexts — this is exactly the routing scenario where the location suffix earns its keep", "source_field": "tenant_settings.whatsapp_display_name or business_name fallback"},
    {"key": "visit_window", "description": "Free-text the seller fills in per broadcast, e.g. \"Tuesday\" or \"the next 2-3 days\""},
    {"key": "seller_phone_number", "description": "Distributor''s contact number, for the call-to-coordinate use case"}
  ]'::jsonb,
  NULL,
  'pending',
  true
),
(
  NULL,
  'buyer_app_nudge',
  'utility',
  'buyer_app_nudge',
  'en',
  E'Hi {{buyer_name}},\n\nYou can now order directly from {{seller_name}} anytime through the app — see live stock, prices, and place orders in seconds.\n\nTap below to get started.',
  '[
    {"key": "buyer_name", "description": "Buyer''s first name"},
    {"key": "seller_name", "description": "server-composed display name, plain — no location needed, this isn''t a routing context", "source_field": "tenant_settings.whatsapp_display_name or business_name fallback"}
  ]'::jsonb,
  '{"type": "url", "url_template": "https://app.yukti.so/buy/{{1}}", "variable_source": "buyer_app_access_link_reference_share_token_or_persistent_login"}'::jsonb,
  'pending',
  true
),
(
  NULL,
  'dormant_reengagement',
  'marketing',
  'dormant_reengagement',
  'en',
  E'Hi {{buyer_name}},\n\nIt''s been a while! {{seller_name}} has new arrivals and fresh pricing waiting for you.\n\nCheck out what''s new and place your next order in the app today.\n\nReply STOP to stop marketing messages.',
  '[
    {"key": "buyer_name", "description": "Buyer''s first name"},
    {"key": "seller_name", "description": "server-composed display name, plain — no location for marketing sends", "source_field": "tenant_settings.whatsapp_display_name or business_name fallback"}
  ]'::jsonb,
  '{"type": "url", "url_template": "https://app.yukti.so/buy/catalog/{{1}}", "variable_source": "catalog_or_campaign_reference"}'::jsonb,
  'pending',
  true
);
