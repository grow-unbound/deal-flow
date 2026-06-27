import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
  NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID: process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_ADMIN_NUMBER: process.env.WHATSAPP_ADMIN_NUMBER,
};

describe('whatsapp sender payloads', () => {
  beforeEach(() => {
    process.env.WHATSAPP_TOKEN = 'test-token';
    process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID = '123456789';
    process.env.WHATSAPP_ADMIN_NUMBER = '919876543210';
  });

  afterEach(() => {
    process.env.WHATSAPP_TOKEN = originalEnv.WHATSAPP_TOKEN;
    process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID = originalEnv.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID;
    process.env.WHATSAPP_ADMIN_NUMBER = originalEnv.WHATSAPP_ADMIN_NUMBER;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('sends named body parameters for transactional templates', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { sendOrderReceivedSeller } = await import('@/lib/server/whatsapp');

    await sendOrderReceivedSeller(
      {
        sellerPhone: '9001112222',
        sellerName: 'WineYard',
        sellerLocation: 'Mumbai Warehouse',
        buyerPhone: '9876543210',
        buyerName: 'Ravi Traders',
        etaHours: 24,
      },
      'ord-123',
      'ORD-2026-0001',
      125000,
      3,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(requestInit.body));

    expect(payload.template.components[0].parameters).toEqual([
      { type: 'text', text: 'Mumbai Warehouse', parameter_name: 'seller_location' },
      { type: 'text', text: 'Ravi Traders', parameter_name: 'buyer_name' },
      { type: 'text', text: '9876543210', parameter_name: 'buyer_phone_number' },
      { type: 'text', text: 'ORD-2026-0001', parameter_name: 'order_number' },
      { type: 'text', text: '1250', parameter_name: 'total_amount' },
      { type: 'text', text: '3', parameter_name: 'item_count' },
      { type: 'text', text: '24', parameter_name: 'eta' },
    ]);
  });

  it('keeps otp parameters positional', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { sendLoginOtpWhatsapp } = await import('@/lib/server/whatsapp');

    await sendLoginOtpWhatsapp('9490744841', '123456');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(requestInit.body));

    expect(payload.template.components[0].parameters).toEqual([
      { type: 'text', text: '123456' },
      { type: 'text', text: 'Login to Yukti' },
      { type: 'text', text: '919876543210' },
    ]);
  });
});
