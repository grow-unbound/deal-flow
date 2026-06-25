import { describe, expect, it } from 'vitest';

import {
  buildIntegrationDataFlowRows,
  getIntegrationWebhookDefinitions,
} from '@/lib/integrations/definitions';
import {
  buildZohoWebhookRegistrationPayload,
  buildZohoWorkflowRegistrationPayload,
  resolveZohoWebhookEventType,
} from '@/lib/integrations/zoho-webhooks';

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

  it('builds a default full-entity payload contract with the shared request header', () => {
    const payload = buildZohoWebhookRegistrationPayload({
      webhookUrl: 'https://example.com/functions/v1/integrations-webhook/token-123',
      entityType: 'contacts',
      providerEntity: 'customer',
      secret: 'abcdefghijkl',
      ruleType: 'add_edit',
    });

    expect(payload.headers).toEqual([{ param_name: 'x-zoho-webhook-token', param_value: 'abcdefghijkl' }]);
    expect(payload).not.toHaveProperty('body_type');
    expect(payload).not.toHaveProperty('is_new_response_format');
    expect(payload).not.toHaveProperty('raw_data');
  });

  it('stamps workflow event metadata and resolves add/edit callbacks to create or update results', () => {
    const workflow = buildZohoWorkflowRegistrationPayload({
      entityType: 'items',
      providerEntity: 'item',
      webhookId: 'wh_123',
      ruleType: 'add_edit',
    });

    expect(workflow.instant_actions[0]).toEqual({ action_id: 'wh_123', action_type: 'webhook' });
    expect(resolveZohoWebhookEventType('items', 'item.add_edit', 'create')).toBe('item.created');
    expect(resolveZohoWebhookEventType('items', 'item.add_edit', 'update')).toBe('item.updated');
  });
});
