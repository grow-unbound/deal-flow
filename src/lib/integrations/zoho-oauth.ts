export type ZohoOAuthIntegrationTypeId = 'zoho_books' | 'zoho_inventory';

export const ZOHO_OAUTH_SCOPES_BY_INTEGRATION: Record<ZohoOAuthIntegrationTypeId, string> = {
  // Least-privilege, module-by-module — NOT ZohoBooks.fullaccess.all.
  // fullaccess.all was tried and reverted the same day (2026-09-05): it
  // grants R/W across modules this app never touches (banking, vendor
  // bills, expenses, chart of accounts, taxes, user management) — a much
  // larger blast radius on a refresh token held in vault for a live
  // customer's real accounting data than the app's actual footprint
  // justifies, and a consent screen that overstates what the app does is
  // its own trust problem for a freshly-launched product.
  //
  // The real bug this list is prone to — missing a module when a new
  // endpoint gets called (customerpayments was missing, 401'd WineYard's
  // backfill with Zoho error code 57) — is guarded against by
  // src/tests/lib/zoho-scope-coverage.test.ts instead: it scans every
  // Zoho path used across supabase/functions and fails the build if one
  // isn't covered here. Keep both in sync when adding a new endpoint.
  //
  // Existing connections need to reconnect (Settings → Integrations →
  // Zoho → Reconnect) to pick up a scope change — an issued refresh token
  // doesn't gain new scopes on its own.
  zoho_books: [
    'ZohoBooks.contacts.ALL',
    'ZohoBooks.items.ALL',
    'ZohoBooks.salesorders.ALL',
    'ZohoBooks.invoices.ALL',
    'ZohoBooks.estimates.ALL',
    'ZohoBooks.settings.ALL',
    'ZohoBooks.customerpayments.ALL',
    // Read-only, granted ahead of use — no sync code calls /bills yet.
    // For an upcoming costing feature (vendor bill cost tracking). Kept
    // READ (not .ALL) since nothing here needs to write vendor bills.
    'ZohoBooks.bills.READ',
  ].join(','),
  zoho_inventory: [
    'ZohoInventory.fullaccess.all',
    'ZohoInventory.settings.READ',
  ].join(','),
};

export function getZohoOAuthScopes(integrationTypeId: ZohoOAuthIntegrationTypeId): string {
  return ZOHO_OAUTH_SCOPES_BY_INTEGRATION[integrationTypeId];
}
