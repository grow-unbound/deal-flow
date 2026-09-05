export type ZohoOAuthIntegrationTypeId = 'zoho_books' | 'zoho_inventory';

export const ZOHO_OAUTH_SCOPES_BY_INTEGRATION: Record<ZohoOAuthIntegrationTypeId, string> = {
  // Single all-modules grant, matching the zoho_inventory pattern below.
  // We were previously requesting a hand-picked module list (contacts,
  // items, salesorders, invoices, estimates, settings) that had to be
  // updated every time a new module's endpoint was called — missing
  // customerpayments there is exactly what 401'd WineYard's
  // customer_payments backfill (Zoho error code 57) on 2026-09-05.
  // fullaccess.all avoids that whole class of bug recurring for future
  // modules. Existing connections need to reconnect (Settings →
  // Integrations → Zoho → Reconnect) to pick up the wider grant — an
  // issued refresh token doesn't gain new scopes on its own.
  zoho_books: [
    'ZohoBooks.fullaccess.all',
  ].join(','),
  zoho_inventory: [
    'ZohoInventory.fullaccess.all',
    'ZohoInventory.settings.READ',
  ].join(','),
};

export function getZohoOAuthScopes(integrationTypeId: ZohoOAuthIntegrationTypeId): string {
  return ZOHO_OAUTH_SCOPES_BY_INTEGRATION[integrationTypeId];
}
