-- Superseding the previous migration's append-only customerpayments fix:
-- a hand-picked module scope list has to be updated every time a new Zoho
-- Books module is called (customerpayments was missed, 401'd WineYard's
-- backfill with Zoho error code 57). Replace with the single fullaccess.all
-- grant already used for zoho_inventory, so this class of bug can't recur.
-- Existing tenant connections still need to reconnect (Settings ->
-- Integrations -> Zoho -> Reconnect) to pick up the wider grant.
update catalog.integration_types
set auth_schema = jsonb_set(
  auth_schema,
  '{scopes}',
  '["ZohoBooks.fullaccess.all"]'::jsonb
)
where id = 'zoho_books';
