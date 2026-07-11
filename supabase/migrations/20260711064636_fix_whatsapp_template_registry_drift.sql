-- Align app.whatsapp_templates registry with live Meta template parameter names.

-- order_received_buyer: Meta expects {{seller_team}}, not {{seller_name}}
UPDATE app.whatsapp_templates
SET
  body_text = replace(body_text, '{{seller_name}}', '{{seller_team}}'),
  variables = (
    SELECT coalesce(
      jsonb_agg(
        CASE
          WHEN elem->>'key' = 'seller_name' THEN jsonb_set(elem, '{key}', '"seller_team"')
          ELSE elem
        END
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(variables) AS elem
  ),
  updated_at = now()
WHERE meta_template_name = 'order_received_buyer'
  AND tenant_id IS NULL
  AND deleted_at IS NULL;

-- campaign_announcement use_case: Meta name is campaign_published_buyer
UPDATE app.whatsapp_templates
SET
  meta_template_name = 'campaign_published_buyer',
  variables = CASE
    WHEN variables @> '[{"key":"seller_name"}]'::jsonb THEN variables
    ELSE coalesce(variables, '[]'::jsonb) || '[{"key":"seller_name","description":"Seller business name"}]'::jsonb
  END,
  buttons_config = '[{"type":"url","index":"0","url_template":"https://app.useyukti.in/buy/catalog?share_token={{1}}","variable_source":"share_token"}]'::jsonb,
  updated_at = now()
WHERE use_case = 'campaign_announcement'
  AND tenant_id IS NULL
  AND deleted_at IS NULL
  AND meta_template_name IS DISTINCT FROM 'campaign_published_buyer';
