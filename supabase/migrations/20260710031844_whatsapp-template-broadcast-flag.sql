-- WhatsApp template broadcast flag for Meta-aligned template registry.

ALTER TABLE app.whatsapp_templates
  ADD COLUMN IF NOT EXISTS is_broadcast_template boolean NOT NULL DEFAULT false;

UPDATE app.whatsapp_templates
SET is_broadcast_template = true
WHERE tenant_id IS NULL
  AND (
    meta_template_name = 'buyer_payment_reminder'
    OR use_case IN (
      'payment_reminder',
      'new_stock',
      'campaign_announcement',
      'beat_route',
      'dormant_reengagement'
    )
  );
