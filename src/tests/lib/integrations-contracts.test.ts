import { describe, expect, it } from 'vitest';
import {
  INTEGRATION_TYPE_IDS,
  IntegrationAuthSchemaSchema,
  IntegrationCapabilitiesSchema,
  IntegrationEntityTypeSchema,
  IntegrationFlowDirectionSchema,
  IntegrationFlowTriggerSchema,
  IntegrationJobProgressSchema,
  IntegrationJobSummarySchema,
  IntegrationTypeIdSchema,
} from '@/types/integrations';

describe('integration type contracts', () => {
  it('locks the supported integration ids', () => {
    expect(INTEGRATION_TYPE_IDS).toEqual(['zoho_books', 'zoho_inventory', 'tally_prime', 'busy']);
    expect(IntegrationTypeIdSchema.safeParse('zoho_books').success).toBe(true);
    expect(IntegrationTypeIdSchema.safeParse('quickbooks').success).toBe(false);
  });

  it('locks entity, direction, and trigger enums', () => {
    expect(IntegrationEntityTypeSchema.safeParse('invoices').success).toBe(true);
    expect(IntegrationEntityTypeSchema.safeParse('warehouse').success).toBe(false);
    expect(IntegrationFlowDirectionSchema.safeParse('bidirectional').success).toBe(true);
    expect(IntegrationFlowDirectionSchema.safeParse('sideways').success).toBe(false);
    expect(IntegrationFlowTriggerSchema.safeParse('webhook').success).toBe(true);
    expect(IntegrationFlowTriggerSchema.safeParse('cron').success).toBe(false);
  });
});

describe('IntegrationAuthSchemaSchema', () => {
  it('accepts manual credential collection schemas', () => {
    const result = IntegrationAuthSchemaSchema.safeParse({
      oauth: false,
      fields: [
        { key: 'client_id', label: 'Client ID', type: 'text', required: true },
        { key: 'region', label: 'Region', type: 'select', required: true, options: [{ label: 'India', value: 'in' }] },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects select fields without options', () => {
    const result = IntegrationAuthSchemaSchema.safeParse({
      oauth: false,
      fields: [{ key: 'region', label: 'Region', type: 'select', required: true }],
    });

    expect(result.success).toBe(false);
  });

  it('requires oauth definitions to declare an auth endpoint', () => {
    const result = IntegrationAuthSchemaSchema.safeParse({
      oauth: true,
      scopes: ['ZohoBooks.fullaccess.all'],
      fields: [],
    });

    expect(result.success).toBe(false);
  });
});

describe('integration runtime payload schemas', () => {
  it('accepts capabilities with known entity families only', () => {
    const result = IntegrationCapabilitiesSchema.safeParse({
      inbound_reference: ['brands', 'products', 'customers'],
      inbound_transactional: ['orders', 'invoices'],
      outbound_reference: ['products', 'customers'],
      outbound_transactional: ['orders'],
      webhooks: true,
      scheduled_sync: true,
      manual_sync: true,
      health_check: true,
    });

    expect(result.success).toBe(true);
  });

  it('rejects unknown capability entity families', () => {
    const result = IntegrationCapabilitiesSchema.safeParse({
      inbound_reference: ['brands', 'payments'],
    });

    expect(result.success).toBe(false);
  });

  it('validates sync progress counters against totals', () => {
    const valid = IntegrationJobProgressSchema.safeParse({
      phase: 'products',
      phase_label: 'Importing products',
      phases_total: 4,
      phase_current: 2,
      items_total: 100,
      items_processed: 60,
      items_failed: 3,
      percent: 60,
      last_entity_type: 'products',
    });
    const invalid = IntegrationJobProgressSchema.safeParse({
      phases_total: 2,
      phase_current: 3,
      items_total: 10,
      items_processed: 11,
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it('accepts job summaries with non-negative aggregate counts', () => {
    const valid = IntegrationJobSummarySchema.safeParse({
      brands: 12,
      products: 240,
      customers: 55,
      orders: 18,
      total_processed: 325,
      total_failed: 2,
      duration_ms: 4_500,
      warnings: ['2 orders skipped because they were cancelled in the source system'],
    });
    const invalid = IntegrationJobSummarySchema.safeParse({
      products: -1,
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});
