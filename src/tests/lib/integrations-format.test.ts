import { describe, expect, it } from 'vitest';

import { formatIntegrationDateTimeLabel } from '@/lib/integrations/format';

describe('integration timestamp formatting', () => {
  const now = new Date('2026-06-24T04:30:00.000Z');

  it('prefers today, tomorrow, and yesterday labels', () => {
    expect(formatIntegrationDateTimeLabel('2026-06-24T04:30:00.000Z', now)).toBe('today 10:00AM');
    expect(formatIntegrationDateTimeLabel('2026-06-25T04:30:00.000Z', now)).toBe('tomorrow 10:00AM');
    expect(formatIntegrationDateTimeLabel('2026-06-23T04:30:00.000Z', now)).toBe('yesterday 10:00AM');
  });

  it('falls back to an explicit date and time when the day is outside the relative window', () => {
    expect(formatIntegrationDateTimeLabel('2026-06-20T04:30:00.000Z', now)).toBe('20 Jun 10:00AM');
  });
});
