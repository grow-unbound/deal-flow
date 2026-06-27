import { describe, expect, it } from 'vitest';

import { formatIntegrationJobError, normalizeIntegrationJobErrorLog } from './job-error-log';

describe('integration job error log helpers', () => {
  it('normalizes array and legacy entries payloads', () => {
    const arrayLog = normalizeIntegrationJobErrorLog([
      { message: 'First error' },
      { message: 'Second error' },
    ]);
    const objectLog = normalizeIntegrationJobErrorLog({
      entries: [
        { message: 'Legacy error' },
        { message: 'Legacy error 2' },
      ],
    });

    expect(arrayLog).toHaveLength(2);
    expect(objectLog).toHaveLength(2);
    expect(formatIntegrationJobError(objectLog[0])).toBe('Legacy error');
  });

  it('prefers explicit error text when available', () => {
    expect(formatIntegrationJobError({ entity_type: 'products', external_id: 'SKU-1', error: 'Missing price' })).toBe(
      '[products] SKU-1: Missing price',
    );
  });

  it('falls back to entity error_reason for newer integration map logs', () => {
    expect(formatIntegrationJobError({
      entity_type: 'orders',
      external_id: 'SO-1',
      error_reason: 'Unable to resolve product ITEM-1 for order SO-1.',
    })).toBe('[orders] SO-1: Unable to resolve product ITEM-1 for order SO-1.');
  });
});
