-- Campaign publish + WhatsApp marketing template v2
-- Extends app.whatsapp_templates for header/footer/multi-button templates,
-- updates campaign_announcement seed, adds broadcast header media cache,
-- and enforces whatsapp_consent_at on audience RPCs (spec §4.8).

ALTER TABLE app.whatsapp_templates
  ADD COLUMN IF NOT EXISTS header_config jsonb,
  ADD COLUMN IF NOT EXISTS footer_text text,
  ADD COLUMN IF NOT EXISTS buttons_config jsonb;

ALTER TABLE app.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS meta_header_media_id text,
  ADD COLUMN IF NOT EXISTS header_image_source text;

COMMENT ON COLUMN app.whatsapp_broadcasts.meta_header_media_id IS
  'Meta Cloud API media id for campaign header image, uploaded once per broadcast';
COMMENT ON COLUMN app.whatsapp_broadcasts.header_image_source IS
  'campaign | tenant_logo | platform_default — which fallback supplied the header image';

-- ── campaign_announcement v2 (marketing template with image header + 3 buttons) ─
UPDATE app.whatsapp_templates
SET
  body = E'Hi {{buyer_name}},\n\n{{seller_name}} has a new campaign live — {{campaign_title}}\n\n{{buyer_note}}\n\nContact: {{seller_phone_number}}\n\nCheck it out and place your order in the app.',
  variables = '[
    {"key": "buyer_name", "description": "Buyer''s first name"},
    {"key": "seller_name", "description": "Server-composed display name"},
    {"key": "campaign_title", "description": "Campaign name from app.campaigns.name"},
    {"key": "buyer_note", "description": "Optional seller note from campaigns.message"},
    {"key": "seller_phone_number", "description": "Tenant contact number for WhatsApp/call"}
  ]'::jsonb,
  header_config = '{"format": "image"}'::jsonb,
  footer_text = 'Powered by Yukti',
  buttons_config = '[
    {"type": "url", "index": "0", "label": "View campaign", "url_template": "https://app.yukti.so/buy/catalog?share_token={{1}}", "variable_source": "share_token"},
    {"type": "url", "index": "1", "label": "Enquire now", "url_template": "https://wa.me/{{1}}", "variable_source": "tenant_whatsapp_phone"},
    {"type": "quick_reply", "index": "2", "label": "Unsubscribe"}
  ]'::jsonb,
  button_config = '{"type": "url", "url_template": "https://app.yukti.so/buy/catalog?share_token={{1}}", "variable_source": "share_token"}'::jsonb,
  updated_at = now()
WHERE meta_template_name = 'campaign_announcement'
  AND tenant_id IS NULL
  AND deleted_at IS NULL;

-- ── Audience RPCs: add whatsapp_consent_at filter (spec §4.8) ─────────────────

CREATE OR REPLACE FUNCTION app.resolve_broadcast_audience_cohort(
  p_tenant_id uuid,
  p_cohort_id uuid
)
RETURNS TABLE (buyer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT b.id AS buyer_id
  FROM app.buyers b
  JOIN app.cohort_members cm ON cm.buyer_id = b.id
  JOIN app.cohorts c ON c.id = cm.cohort_id
  WHERE c.id = p_cohort_id
    AND c.tenant_id = p_tenant_id
    AND b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND b.whatsapp_consent_at IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION app.resolve_broadcast_audience_buyer_selection(
  p_tenant_id uuid,
  p_buyer_ids uuid[]
)
RETURNS TABLE (buyer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT b.id AS buyer_id
  FROM app.buyers b
  WHERE b.tenant_id = p_tenant_id
    AND b.id = ANY (COALESCE(p_buyer_ids, ARRAY[]::uuid[]))
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND b.whatsapp_consent_at IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION app.resolve_broadcast_audience_geography(
  p_tenant_id uuid,
  p_filter jsonb
)
RETURNS TABLE (buyer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT b.id AS buyer_id
  FROM app.buyers b
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND b.whatsapp_consent_at IS NOT NULL
    AND (p_filter->>'city' IS NULL OR b.geography->>'city' = p_filter->>'city')
    AND (p_filter->>'state' IS NULL OR b.geography->>'state' = p_filter->>'state')
    AND (p_filter->>'pincode' IS NULL OR b.geography->>'pincode' = p_filter->>'pincode')
    AND (p_filter->>'zone' IS NULL OR b.geography->>'zone' = p_filter->>'zone');
$$;

CREATE OR REPLACE FUNCTION app.resolve_broadcast_audience_dormant(
  p_tenant_id uuid,
  p_filter jsonb
)
RETURNS TABLE (buyer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  WITH last_order AS (
    SELECT o.buyer_id, MAX(o.placed_at) AS last_placed_at
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
    GROUP BY o.buyer_id
  )
  SELECT b.id AS buyer_id
  FROM app.buyers b
  LEFT JOIN last_order lo ON lo.buyer_id = b.id
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND b.whatsapp_consent_at IS NOT NULL
    AND (
      lo.last_placed_at IS NULL
      OR lo.last_placed_at < now() - make_interval(days => COALESCE((p_filter->>'dormant_days_gt')::integer, 45))
    );
$$;

CREATE OR REPLACE FUNCTION app.resolve_broadcast_audience_dues(
  p_tenant_id uuid,
  p_filter jsonb DEFAULT NULL
)
RETURNS TABLE (buyer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT DISTINCT b.id AS buyer_id
  FROM app.buyers b
  JOIN app.invoices i ON i.buyer_id = b.id AND i.tenant_id = b.tenant_id
  WHERE b.tenant_id = p_tenant_id
    AND i.status IN ('sent', 'unpaid', 'partially_paid', 'overdue', 'viewed')
    AND i.outstanding_balance > 0
    AND i.invoice_date + (b.payment_terms_days || ' days')::interval < now()
    AND (
      p_filter IS NULL OR p_filter->>'overdue_days_gt' IS NULL
      OR i.invoice_date + (b.payment_terms_days || ' days')::interval
           < now() - make_interval(days => (p_filter->>'overdue_days_gt')::integer)
    )
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND b.whatsapp_consent_at IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION app.resolve_broadcast_audience_all(
  p_tenant_id uuid
)
RETURNS TABLE (buyer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT b.id AS buyer_id
  FROM app.buyers b
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND b.whatsapp_opt_out_at IS NULL
    AND b.whatsapp_consent_at IS NOT NULL;
$$;
