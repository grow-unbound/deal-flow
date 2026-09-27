-- Reverts the previous migration's ZohoBooks.fullaccess.all grant, same day.
-- fullaccess.all was too broad for this app's actual footprint (banking,
-- vendor bills, expenses, chart of accounts, taxes, user management are all
-- granted but never used) — a security-review call on 2026-09-05. Back to
-- the least-privilege module list plus the customerpayments scope that was
-- actually missing. src/tests/lib/zoho-scope-coverage.test.ts now guards
-- against a required module silently going missing again.
--
-- No tenant has reconnected under fullaccess.all yet (WineYard's reconnect
-- attempt predated this being deployed), so this is a clean revert with no
-- live exposure to walk back.
update catalog.integration_types
set auth_schema = jsonb_set(
  auth_schema,
  '{scopes}',
  '[
    "ZohoBooks.contacts.ALL",
    "ZohoBooks.items.ALL",
    "ZohoBooks.salesorders.ALL",
    "ZohoBooks.invoices.ALL",
    "ZohoBooks.estimates.ALL",
    "ZohoBooks.settings.ALL",
    "ZohoBooks.customerpayments.ALL"
  ]'::jsonb
)
where id = 'zoho_books';
