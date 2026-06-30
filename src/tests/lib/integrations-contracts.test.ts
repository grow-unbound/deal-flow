import { describe, expect, it } from 'vitest';
import {
  INTEGRATION_TYPE_IDS,
  IntegrationAuthSchemaSchema,
  IntegrationCapabilitiesSchema,
  IntegrationEntityTypeSchema,
  IntegrationDataFlowRecordSchema,
  IntegrationFlowDirectionSchema,
  IntegrationFlowTriggerSchema,
  IntegrationJobRecordSchema,
  IntegrationJobProgressSchema,
  IntegrationJobSummarySchema,
  IntegrationSyncRequestSchema,
  IntegrationTypeIdSchema,
} from '@/types/integrations';

describe('integration type contracts', () => {
  it('locks the supported integration ids', () => {
    expect(INTEGRATION_TYPE_IDS).toEqual(['zoho_books', 'zoho_inventory', 'tally_prime', 'busy']);
    expect(IntegrationTypeIdSchema.safeParse('zoho_books').success).toBe(true);
    expect(IntegrationTypeIdSchema.safeParse('quickbooks').success).toBe(false);
  });

  it('locks entity, direction, and trigger enums', () => {
    expect(IntegrationEntityTypeSchema.safeParse('locations').success).toBe(true);
    expect(IntegrationEntityTypeSchema.safeParse('categories').success).toBe(true);
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
      version: 1,
      provider: 'zoho',
      scope: 'reference',
      since: '2026-06-01T00:00:00.000Z',
      phases: ['locations', 'customers', 'products'],
      phases_total: 3,
      phase_current: 1,
      phase: 'locations',
      phase_label: 'Importing locations from Zoho Books',
      items_total: null,
      items_processed: 0,
      items_failed: 0,
      pages_processed: 0,
      cursor: {
        phase: 'locations',
        entity_type: 'locations',
        page: 1,
        per_page: 200,
        has_more: true,
        since: '2026-06-01T00:00:00.000Z',
      },
      counts: {
        locations: {
          entity_type: 'locations',
          processed: 0,
          failed: 0,
          pages: 0,
        },
      },
      started_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:05:00.000Z',
      meta: {
        max_pages: 3,
      },
      note: 'Initial import in progress',
    });
    const invalid = IntegrationJobProgressSchema.safeParse({
      phase: 'locations',
      items_total: '10',
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it('accepts date-only since values for YTD and FYTD sync windows', () => {
    const result = IntegrationJobProgressSchema.safeParse({
      version: 1,
      provider: 'zoho',
      scope: 'transactional',
      since: '2026-04-01',
      phases: ['estimates', 'orders', 'invoices'],
      phases_total: 3,
      phase_current: 1,
      phase: 'estimates',
      phase_label: 'Importing estimates from Zoho Books',
      items_total: null,
      items_processed: 0,
      items_failed: 0,
      pages_processed: 0,
      cursor: {
        phase: 'estimates',
        entity_type: 'estimates',
        page: 1,
        per_page: 1000,
        has_more: true,
        since: '2026-04-01',
      },
      started_at: '2026-06-25T14:00:00.000Z',
      updated_at: '2026-06-25T14:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('allows sync requests to carry a temporary page cap', () => {
    const result = IntegrationSyncRequestSchema.safeParse({
      tenant_integration_id: '11111111-1111-1111-1111-111111111111',
      job_type: 'manual',
      phase: 'customers',
      since: '2026-06-01',
      run_origin: 'manual',
      sync_window: 'Last 24 hours',
      max_pages: 3,
    });

    expect(result.success).toBe(true);
  });

  it('accepts integration job records with run origin metadata', () => {
    const result = IntegrationJobRecordSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      tenant_integration_id: '22222222-2222-2222-2222-222222222222',
      job_type: 'incremental',
      status: 'completed',
      run_origin: 'scheduled',
      sync_window: 'Last 24 hours',
      progress: {
        version: 1,
        provider: 'zoho',
        scope: 'transactional',
        since: '2026-06-01T00:00:00.000Z',
        phases: ['orders'],
        phase: 'orders',
        phase_label: 'Importing sales orders from Zoho Books',
        phases_total: 1,
        phase_current: 1,
        items_total: 10,
        items_processed: 10,
        items_failed: 0,
        pages_processed: 1,
        counts: {
          orders: {
            entity_type: 'orders',
            processed: 10,
            failed: 0,
            pages: 1,
          },
        },
        started_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:05:00.000Z',
      },
      error_log: [],
      summary: {
        provider: 'zoho',
        scope: 'transactional',
        since: '2026-06-01T00:00:00.000Z',
        run_origin: 'scheduled',
        sync_window: 'Last 24 hours',
        phases_completed: ['orders'],
        counts: {
          orders: {
            entity_type: 'orders',
            processed: 10,
            failed: 0,
            pages: 1,
          },
        },
        last_synced_at: '2026-06-01T00:05:00.000Z',
      },
      started_at: '2026-06-01T00:00:00.000Z',
      completed_at: '2026-06-01T00:05:00.000Z',
      created_at: '2026-06-01T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('accepts job summaries with non-negative aggregate counts', () => {
    const valid = IntegrationJobSummarySchema.safeParse({
      provider: 'zoho',
      scope: 'transactional',
      since: '2026-06-01T00:00:00.000Z',
      phases_completed: ['locations', 'customers'],
      counts: {
        locations: {
          entity_type: 'locations',
          processed: 1,
          failed: 0,
          pages: 1,
        },
      },
      last_synced_at: '2026-06-12T09:07:00.000Z',
      note: 'Transactional sync complete',
    });
    const invalid = IntegrationJobSummarySchema.safeParse({
      products: -1,
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it('accepts integration data flows with mapping metadata', () => {
    const result = IntegrationDataFlowRecordSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      tenant_integration_id: '22222222-2222-2222-2222-222222222222',
      entity_type: 'orders',
      direction: 'outbound',
      trigger_type: 'event',
      schedule: '0 5 * * *',
      webhook_id: null,
      field_mappings: {
        operational_mode: 'webhook_backed',
        source_system: 'Zoho Books',
      },
      filters: {
        region: 'West',
      },
      is_active: true,
      last_run_at: null,
    });

    expect(result.success).toBe(true);
  });

  it('accepts category flow records in the integration settings payload', () => {
    const result = IntegrationDataFlowRecordSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      tenant_integration_id: '22222222-2222-2222-2222-222222222222',
      entity_type: 'categories',
      direction: 'inbound',
      trigger_type: 'event',
      schedule: '0 5 * * *',
      webhook_id: null,
      field_mappings: {
        operational_mode: 'derived_local',
        source_system: 'Zoho Books',
      },
      filters: {},
      is_active: true,
      last_run_at: null,
    });

    expect(result.success).toBe(true);
  });
});
