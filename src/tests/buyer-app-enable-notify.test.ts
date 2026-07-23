import { describe, expect, it } from 'vitest';

import {
  buildBuyerAppEnabledPreviewMessage,
  resolveBuyerDisplayName,
} from '@/lib/server/buyer-app-enable-notify';

describe('buyer-app-enable-notify', () => {
  it('builds the buyer_app_enabled preview message', () => {
    const message = buildBuyerAppEnabledPreviewMessage('Asha', 'WineYard');
    expect(message).toContain('Hi Asha,');
    expect(message).toContain('WineYard has enabled the catalog app for you.');
    expect(message).toContain('place orders anytime.');
  });

  it('prefers contact name for buyer display name', () => {
    expect(resolveBuyerDisplayName({
      business_name: 'Alpha Retail',
      contact_name: 'Asha Kumar',
    })).toBe('Asha');
  });

  it('falls back to business name when contact name is missing', () => {
    expect(resolveBuyerDisplayName({
      business_name: 'Alpha Retail',
      contact_name: null,
    })).toBe('Alpha');
  });
});
