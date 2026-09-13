import { describe, expect, it } from 'vitest';
import { ALL_MISSING_FIELD_KEYS, MISSING_FIELD_LABELS, missingFieldKeysForEntryType } from '@/lib/inbox/missing-field-labels';

describe('missingFieldKeysForEntryType', () => {
  it('offers all 6 fields for business_approval', () => {
    expect(missingFieldKeysForEntryType('business_approval')).toEqual(ALL_MISSING_FIELD_KEYS);
  });

  it('offers only contact_name and address for new_user_login (no business/document fields)', () => {
    const fields = missingFieldKeysForEntryType('new_user_login');
    expect(fields).toEqual(['contact_name', 'address']);
    expect(fields).not.toContain('gstin');
    expect(fields).not.toContain('business_name');
    expect(fields).not.toContain('gst_certificate');
    expect(fields).not.toContain('shop_image');
  });

  it('has a human-readable label for every vocabulary key', () => {
    for (const key of ALL_MISSING_FIELD_KEYS) {
      expect(MISSING_FIELD_LABELS[key]).toBeTruthy();
    }
  });
});
