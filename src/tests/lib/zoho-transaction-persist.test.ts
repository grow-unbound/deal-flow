import { describe, expect, it, vi } from 'vitest';

// source_payload is written to R2 (not inline jsonb) by batchUpsertEntityMap
// — mock the R2 write so tests don't need a real S3 client / Deno env.
vi.mock('../../../supabase/functions/_shared/r2.ts', () => ({
  putObjectJson: vi.fn().mockResolvedValue(undefined),
}));

import {
  buildChildExternalRef,
  buildTransactionalSourcePayload,
  resolveInternalIdWithFallback,
  resolveInternalIdsWithFallback,
} from '../../../supabase/functions/_shared/integrations-persist';

function createAdminMock(options?: {
  entityMapRows?: Array<Record<string, unknown>>;
  tableRows?: Record<string, Array<Record<string, unknown>>>;
}) {
  const entityMapRows = options?.entityMapRows ?? [];
  const tableRows = options?.tableRows ?? {};

  function queryChain(tableName: string) {
    const state: {
      eq: Record<string, unknown>;
      in: { column: string; values: string[] } | null;
      is: Record<string, unknown>;
    } = {
      eq: {},
      in: null,
      is: {},
    };

    const chain: any = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        state.eq[column] = value;
        return chain;
      },
      in: (column: string, values: string[]) => {
        state.in = { column, values };
        return chain;
      },
      is: (column: string, value: unknown) => {
        state.is[column] = value;
        return chain;
      },
      then: (resolve: (result: { data: Array<Record<string, unknown>>; error: null }) => void) => {
        let data: Array<Record<string, unknown>> = [];

        if (tableName === 'integration_entity_map') {
          data = entityMapRows.filter((row) => {
            if (state.eq.tenant_id && row.tenant_id !== state.eq.tenant_id) return false;
            if (state.eq.tenant_integration_id && row.tenant_integration_id !== state.eq.tenant_integration_id) return false;
            if (state.eq.entity_type && row.entity_type !== state.eq.entity_type) return false;
            if (state.in?.column === 'external_id' && Array.isArray(state.in.values) && !state.in.values.includes(String(row.external_id ?? ''))) return false;
            if (state.is.deleted_at === null && row.deleted_at !== null && row.deleted_at !== undefined) return false;
            return true;
          });
        } else {
          data = (tableRows[tableName] ?? []).filter((row) => {
            if (state.eq.tenant_id && row.tenant_id !== state.eq.tenant_id) return false;
            if (state.in?.column === 'external_ref' && Array.isArray(state.in.values) && !state.in.values.includes(String(row.external_ref ?? ''))) return false;
            if (state.is.deleted_at === null && row.deleted_at !== null && row.deleted_at !== undefined) return false;
            return true;
          });
        }

        resolve({ data, error: null });
      },
    };

    return chain;
  }

  return {
    schema: () => ({
      from: (tableName: string) => queryChain(tableName),
    }),
  };
}

describe('zoho transactional persistence helpers', () => {
  it('keeps parent payloads while dropping embedded line items from the persisted source payload', () => {
    const payload = buildTransactionalSourcePayload({
      estimate_id: 'EST-1',
      status: 'sent',
      notes: 'Hello',
      line_items: [{ item_id: 'SKU-1' }],
    });

    expect(payload).toMatchObject({
      estimate_id: 'EST-1',
      status: 'sent',
      notes: 'Hello',
    });
    expect(payload).not.toHaveProperty('line_items');
  });

  it('builds stable child external refs and respects explicit line ids', async () => {
    const explicit = await buildChildExternalRef('EST-1', { line_item_id: 'Line 42' }, 0);
    const fallbackA = await buildChildExternalRef('EST-1', {
      item_id: 'P-1',
      quantity: 2,
      rate: 100,
      item_total: 200,
    }, 0);
    const fallbackB = await buildChildExternalRef('EST-1', {
      item_id: 'P-1',
      quantity: 2,
      rate: 100,
      item_total: 200,
    }, 0);

    expect(explicit).toBe('EST-1:line:line-42');
    expect(fallbackA).toBe(fallbackB);
    expect(fallbackA).toMatch(/^EST-1:line:0001:/);
  });

  it('prefers entity maps but falls back to persisted parent external refs', async () => {
    const admin = createAdminMock({
      entityMapRows: [
        {
          tenant_id: 'tenant-1',
          tenant_integration_id: 'integration-1',
          entity_type: 'customers',
          external_id: 'CUST-1',
          internal_id: 'buyer-mapped',
          deleted_at: null,
        },
      ],
      tableRows: {
        buyers: [
          {
            tenant_id: 'tenant-1',
            external_ref: 'CUST-2',
            id: 'buyer-table',
            deleted_at: null,
          },
        ],
      },
    });

    const resolved = await resolveInternalIdsWithFallback(
      admin as any,
      'tenant-1',
      'integration-1',
      'customers',
      'buyers',
      ['CUST-1', 'CUST-2'],
    );

    expect(resolved.get('CUST-1')).toBe('buyer-mapped');
    expect(resolved.get('CUST-2')).toBe('buyer-table');
  });

  it('falls back from the entity map to a parent table external_ref when resolving a single id', async () => {
    const admin = createAdminMock({
      tableRows: {
        estimates: [
          {
            tenant_id: 'tenant-1',
            external_ref: 'EST-2',
            id: 'estimate-table',
            deleted_at: null,
          },
        ],
      },
    });

    const resolved = await resolveInternalIdWithFallback(
      admin as any,
      'tenant-1',
      'integration-1',
      'estimates',
      'estimates',
      'EST-2',
    );

    expect(resolved).toBe('estimate-table');
  });
});
