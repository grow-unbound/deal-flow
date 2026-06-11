import { describe, expect, it } from 'vitest';
import { previewOrderNumberFormat } from '@/lib/tenant-settings/order-number-format';

describe('previewOrderNumberFormat', () => {
  const ref = new Date('2026-03-09T12:00:00.000Z');

  it('replaces YYYY MM DD and SEQ', () => {
    expect(previewOrderNumberFormat('ORD-{YYYY}-{MM}-{DD}-{SEQ}', ref)).toBe('ORD-2026-03-09-0001');
  });

  it('supports multiple SEQ tokens', () => {
    expect(previewOrderNumberFormat('{SEQ}-{SEQ}', ref)).toBe('0001-0001');
  });

  it('leaves unknown tokens unchanged', () => {
    expect(previewOrderNumberFormat('X-{FOO}-1', ref)).toBe('X-{FOO}-1');
  });
});
