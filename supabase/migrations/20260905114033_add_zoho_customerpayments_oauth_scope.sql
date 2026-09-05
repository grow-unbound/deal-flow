-- The customer_payments/invoices_outstanding sync phases (2026-09-04 payments-model
-- feature) call Zoho's /customerpayments endpoint, which needs the
-- ZohoBooks.customerpayments.ALL OAuth scope. That scope was never added to the
-- zoho_books integration type's documented scope list, so it was never requested
-- at connect time. Existing tenant connections (e.g. WineYard) authorized before
-- this patch do NOT have the grant — Zoho returns 401 "You are not authorized to
-- perform this operation" (code 57) on /customerpayments until they reconnect via
-- Settings -> Integrations -> Zoho -> Reconnect, which re-runs the OAuth consent
-- flow with the now-complete scope list. This migration only fixes what new
-- connections request going forward; it does not retroactively grant the scope
-- to already-issued refresh tokens.
update catalog.integration_types
set auth_schema = jsonb_set(
  auth_schema,
  '{scopes}',
  auth_schema->'scopes' || '["ZohoBooks.customerpayments.ALL"]'::jsonb
)
where id = 'zoho_books'
  and not (auth_schema->'scopes' @> '["ZohoBooks.customerpayments.ALL"]'::jsonb);
