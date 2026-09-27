-- Reserve read-only vendor-bills access ahead of an upcoming costing
-- feature, so a future feature launch doesn't also need a scope-driven
-- tenant reconnect on top of it. READ-only, not .ALL — nothing writes bills.
update catalog.integration_types
set auth_schema = jsonb_set(
  auth_schema,
  '{scopes}',
  auth_schema->'scopes' || '["ZohoBooks.bills.READ"]'::jsonb
)
where id = 'zoho_books'
  and not (auth_schema->'scopes' @> '["ZohoBooks.bills.READ"]'::jsonb);
