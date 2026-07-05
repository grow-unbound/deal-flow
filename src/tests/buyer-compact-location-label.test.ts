import { describe, expect, it } from 'vitest';
import { formatBuyerCompactLocationLabel } from '@/lib/buyer-delivery-location';

describe('formatBuyerCompactLocationLabel', () => {
  it('uses the first address segment when short enough', () => {
    expect(
      formatBuyerCompactLocationLabel({
        place_id: '1',
        label: 'Andheri West, Mumbai, Maharashtra',
        formatted_address: 'Andheri West, Mumbai, Maharashtra',
        lat: 0,
        lng: 0,
      }),
    ).toBe('Andheri West');
  });

  it('falls back to city when the primary segment is too long', () => {
    expect(
      formatBuyerCompactLocationLabel({
        place_id: '1',
        label: 'Lanco Hills Technology Park, Manikonda, Hyderabad, Telangana',
        formatted_address: 'Lanco Hills Technology Park, Manikonda, Hyderabad, Telangana',
        city: 'Hyderabad',
        lat: 0,
        lng: 0,
      }),
    ).toBe('Hyderabad');
  });
});
