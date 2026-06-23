import { describe, expect, it } from 'vitest';

import { sanitizeZohoPhone } from '../../../supabase/functions/_shared/integrations-persist';

describe('sanitizeZohoPhone', () => {
  it('keeps only the last 10 digits from Zoho phone values', () => {
    expect(sanitizeZohoPhone('+91-98765-43210')).toBe('9876543210');
    expect(sanitizeZohoPhone('919876543210')).toBe('9876543210');
    expect(sanitizeZohoPhone('09876 543 210')).toBe('9876543210');
    expect(sanitizeZohoPhone('9876543210')).toBe('9876543210');
  });

  it('returns null for values without ten digits', () => {
    expect(sanitizeZohoPhone('12345')).toBe(null);
    expect(sanitizeZohoPhone(null)).toBe(null);
  });
});
