import { describe, expect, it } from 'vitest';

import {
  buildIntegrationDataFlowRows,
  getIntegrationWebhookDefinitions,
} from '@/lib/integrations/definitions';

describe('Zoho entity-scoped webhook topology', () => {
  it('registers a distinct Zoho Books webhook contract for every supported entity', () => {
    const definitions = getIntegrationWebhookDefinitions('zoho_books');

    expect(definitions.map((definition) => definition.entity_type)).toEqual([
      'contacts',
      'items',
      'estimates',
      'invoices',
      'salesorders',
    ]);
    expect(definitions.every((definition) => definition.event_types.length > 0)).toBe(true);
    expect(definitions.some((definition) => definition.entity_type === 'contact_persons')).toBe(false);
    expect(definitions.some((definition) => definition.entity_type === 'item_locations')).toBe(false);
  });

  it('assigns each webhook-backed data flow to its matching local webhook row', () => {
    const flows = buildIntegrationDataFlowRows({
      tenant_id: 'tenant-id',
      tenant_integration_id: 'integration-id',
      integration_type_id: 'zoho_books',
      webhook_ids_by_entity: {
        contacts: 'contacts-webhook',
        items: 'items-webhook',
        estimates: 'estimates-webhook',
        invoices: 'invoices-webhook',
        salesorders: 'orders-webhook',
      },
    });

    expect(flows.find((flow) => flow.entity_type === 'customers')?.webhook_id).toBe('contacts-webhook');
    expect(flows.find((flow) => flow.entity_type === 'products')?.webhook_id).toBe('items-webhook');
    expect(flows.find((flow) => flow.entity_type === 'estimates')?.webhook_id).toBe('estimates-webhook');
    expect(flows.find((flow) => flow.entity_type === 'orders')?.webhook_id).toBe('orders-webhook');
    expect(flows.find((flow) => flow.entity_type === 'invoices')?.webhook_id).toBe('invoices-webhook');
  });
});
