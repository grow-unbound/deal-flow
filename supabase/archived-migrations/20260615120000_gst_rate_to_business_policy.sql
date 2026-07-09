-- Move default GST rate from settings.product_defaults to settings.business_policy.

UPDATE app.tenant_settings
SET settings = jsonb_set(
  CASE
    WHEN (settings->'product_defaults') ? 'gst_rate' THEN settings #-'{product_defaults,gst_rate}'
    ELSE settings
  END,
  '{business_policy}',
  coalesce(settings->'business_policy', '{}'::jsonb)
    || jsonb_build_object(
      'gst_rate',
      coalesce(
        settings #> '{business_policy,gst_rate}',
        settings #> '{product_defaults,gst_rate}',
        '18'::jsonb
      )
    ),
  true
);
