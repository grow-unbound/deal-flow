-- Human-readable template labels for seller UI (unique per meta_template_name).

ALTER TABLE app.whatsapp_templates
  ADD COLUMN IF NOT EXISTS display_name text;

UPDATE app.whatsapp_templates
SET display_name = CASE meta_template_name
  WHEN 'request_received_buyer' THEN 'Estimate sent'
  WHEN 'buyer_payment_reminder' THEN 'Payment reminder'
  WHEN 'campaign_published_buyer' THEN 'Campaign announcement'
  WHEN 'invoice_update_buyer' THEN 'Invoice sent'
  WHEN 'order_received_seller' THEN 'Order received'
  WHEN 'new_stock_buyer' THEN 'New stock arrived'
  WHEN 'request_update_buyer' THEN 'Send estimate'
  WHEN 'buyer_app_dormant' THEN 'App order reminder'
  WHEN 'beat_route_buyer' THEN 'Agent visit reminder'
  WHEN 'order_received_buyer' THEN 'Order submitted'
  WHEN 'buyer_app_enabled' THEN 'Buyer app enabled'
  WHEN 'login_otp' THEN 'Login OTP'
  WHEN 'buyer_app_adoption' THEN 'App login reminder'
  WHEN 'request_received_seller' THEN 'Estimate received'
  ELSE display_name
END
WHERE deleted_at IS NULL;

UPDATE app.whatsapp_templates
SET display_name = initcap(replace(meta_template_name, '_', ' '))
WHERE display_name IS NULL
  AND deleted_at IS NULL;

ALTER TABLE app.whatsapp_templates
  ALTER COLUMN display_name SET NOT NULL;
