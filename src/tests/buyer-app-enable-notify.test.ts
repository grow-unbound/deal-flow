import { describe, expect, it } from 'vitest';

import {
  buildBuyerAppEnabledPreviewMessage,
  resolveBuyerDisplayName,
} from '@/lib/server/buyer-app-enable-notify';

describe('buyer-app-enable-notify', () => {
  it('builds the buyer_app_enabled preview message', () => {
    const message = buildBuyerAppEnabledPreviewMessage('Asha', 'WineYard');
    expect(message).toContain('Hi Asha 👋');
    expect(message).toContain(
      '_Great news!_ WineYard has unlocked direct web-ordering access for your account.',
    );
    expect(message).toContain('No app download required—opens directly in your browser.');
    expect(message).toContain('⚡ *No app download required—opens directly in your browser.*');
    expect(message).toContain('👇 Tap below to log in with 1-click WhatsApp verification:');
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
