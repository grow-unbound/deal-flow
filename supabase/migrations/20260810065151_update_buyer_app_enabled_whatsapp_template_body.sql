-- Align buyer_app_enabled registry body with live Meta template copy.

UPDATE app.whatsapp_templates
SET
  body = E'Hi {{buyer_name}} 👋\n\n_Great news!_ {{seller_name}} has unlocked direct web-ordering access for your account.\n\n⚡ *No app download required—opens directly in your browser.*\n\nWhat you can do right now:\n•\tView your locked-in custom rates & real-time stock availability\n•\tEnjoy automatic volume discounts as your quantities grow\n•\tPlace orders 24/7 without waiting for quote replies\n•\tTrack past orders and bills instantly\n\n👇 Tap below to log in with 1-click WhatsApp verification:',
  updated_at = now()
WHERE tenant_id IS NULL
  AND meta_template_name = 'buyer_app_enabled'
  AND deleted_at IS NULL;
