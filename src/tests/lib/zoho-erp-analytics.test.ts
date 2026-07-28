import { describe, expect, it } from 'vitest';

import {
  buildZohoAnalyticsEventKey,
  coerceAnalyticsBoolean,
  isZohoBuyerAccessEnabledCandidate,
  isZohoCatalogTransactionCandidate,
} from '../../../supabase/functions/_shared/posthog-erp-analytics';

describe('zoho ERP analytics helpers', () => {
  it('builds deterministic event keys for transaction and buyer access events', () => {
    expect(buildZohoAnalyticsEventKey('integration-1', 'orders', 'SO-1', 'created'))
      .toBe('zoho:integration-1:order:SO-1:created');
    expect(buildZohoAnalyticsEventKey('integration-1', 'customers', 'CUST-1', 'buyer_access_enabled'))
      .toBe('zoho:integration-1:customer:CUST-1:buyer_access_enabled');
  });

  it.each([
    ['true', true],
    ['1', true],
    ['yes', true],
    [true, true],
    ['false', false],
    ['0', false],
    [false, false],
    [null, false],
  ])('coerces Zoho booleans (%s)', (value, expected) => {
    expect(coerceAnalyticsBoolean(value)).toBe(expected);
  });

  it('classifies catalog-assisted transaction signals without raw payload storage', () => {
    expect(isZohoCatalogTransactionCandidate({
      entityType: 'estimates',
      sourceRecord: { custom_fields: [{ api_name: 'cf_catalog_estimate', value: 'true' }] },
      persistedRow: {},
    })).toBe(true);

    expect(isZohoCatalogTransactionCandidate({
      entityType: 'orders',
      sourceRecord: null,
      persistedRow: { estimate_id: 'estimate-1' },
    })).toBe(true);

    expect(isZohoCatalogTransactionCandidate({
      entityType: 'invoices',
      sourceRecord: null,
      persistedRow: { order_id: 'order-1' },
    })).toBe(true);

    expect(isZohoCatalogTransactionCandidate({
      entityType: 'orders',
      sourceRecord: { custom_fields: [{ api_name: 'cf_catalog_order', value: false }] },
      persistedRow: { estimate_id: null, is_buyer_app_order: false },
    })).toBe(false);
  });

  it('emits buyer access only on first observed enablement', () => {
    expect(isZohoBuyerAccessEnabledCandidate({
      sourceRecord: { custom_fields: [{ api_name: 'cf_online_catalogue_access', value: true }] },
      persistedRow: { buyer_app_enabled: true },
      existingRow: { buyer_app_enabled: false },
    })).toBe(true);

    expect(isZohoBuyerAccessEnabledCandidate({
      sourceRecord: { custom_fields: [{ api_name: 'cf_online_catalogue_access', value: true }] },
      persistedRow: { buyer_app_enabled: true },
      existingRow: { buyer_app_enabled: true },
    })).toBe(false);
  });
});
