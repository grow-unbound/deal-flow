export type ZohoOAuthIntegrationTypeId = 'zoho_books' | 'zoho_inventory';

export const ZOHO_OAUTH_SCOPES_BY_INTEGRATION: Record<ZohoOAuthIntegrationTypeId, string> = {
  zoho_books: [
    'ZohoBooks.fullaccess.all',
    'ZohoInventory.settings.READ',
  ].join(','),
  zoho_inventory: [
    'ZohoInventory.fullaccess.all',
    'ZohoInventory.settings.READ',
  ].join(','),
};

export function getZohoOAuthScopes(integrationTypeId: ZohoOAuthIntegrationTypeId): string {
  return ZOHO_OAUTH_SCOPES_BY_INTEGRATION[integrationTypeId];
}
