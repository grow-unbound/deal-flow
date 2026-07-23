-- Align beat_route_buyer registry with live Meta template (visit_date + visit_window).

UPDATE app.whatsapp_templates
SET
  body = E'Hi {{buyer_name}},\n\nOur team from {{seller_name}} will be visiting you soon.\n\nVisit window: {{visit_date}} {{visit_window}}\nContact: {{seller_phone_number}}\n\nKeep your payments and any new stock requirements ready. \nYou can also place orders anytime in the app.',
  variables = '[
    {"key":"buyer_name","description":"Buyer contact or business name"},
    {"key":"seller_name","description":"Seller business name"},
    {"key":"visit_date","description":"Visit date, e.g. 26 July"},
    {"key":"visit_window","description":"Visit time window, e.g. 3:30PM–5:30PM"},
    {"key":"seller_phone_number","description":"Seller phone number"}
  ]'::jsonb,
  updated_at = now()
WHERE tenant_id IS NULL
  AND meta_template_name = 'beat_route_buyer'
  AND deleted_at IS NULL;
