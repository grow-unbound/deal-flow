import { beforeEach, describe, expect, it, vi } from 'vitest';

const enqueueWhatsAppMessageMock = vi.hoisted(() => vi.fn());
const triggerWhatsAppDispatchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/whatsapp-enqueue', () => ({
  enqueueWhatsAppMessage: (...args: unknown[]) => enqueueWhatsAppMessageMock(...args),
  triggerWhatsAppDispatch: (...args: unknown[]) => triggerWhatsAppDispatchMock(...args),
  getPlatformTenantId: () => 'platform-tenant-1',
  lookupApprovedTemplateMeta: async (templateName: string) => ({
    id: `tpl-${templateName}`,
    locale: templateName.startsWith('order_') ? 'en_IN' : 'en',
  }),
}));

describe('whatsapp enqueue sender', () => {
  beforeEach(() => {
    enqueueWhatsAppMessageMock.mockReset();
    enqueueWhatsAppMessageMock.mockResolvedValue({ messageId: 'msg-1', enqueued: true });
    triggerWhatsAppDispatchMock.mockReset();
    triggerWhatsAppDispatchMock.mockResolvedValue({ ok: true, dispatched: 1, failed: 0, skipped: 0 });
    process.env.WHATSAPP_ADMIN_NUMBER = '919876543210';
    vi.resetModules();
  });

  it('enqueues named body parameters for transactional templates', async () => {
    const { sendOrderReceivedSeller } = await import('@/lib/server/whatsapp');

    await sendOrderReceivedSeller(
      {
        sellerPhone: '9001112222',
        sellerName: 'WineYard',
        sellerLocation: 'Mumbai Warehouse',
        buyerFacingSellerName: 'WineYard (Mumbai Warehouse)',
        buyerPhone: '9876543210',
        buyerName: 'Ravi Traders',
        etaHours: 24,
        tenantId: 'tenant-1',
        buyerId: 'buyer-1',
      },
      'ord-123',
      'ORD-2026-0001',
      12500,
      3,
    );

    expect(enqueueWhatsAppMessageMock).toHaveBeenCalledTimes(1);
    const input = enqueueWhatsAppMessageMock.mock.calls[0]?.[0] as {
      sendPayload: { meta_template_name: string; body_params: Array<{ text: string; parameter_name?: string }> };
      relatedEntityId: string;
    };
    expect(input.sendPayload.meta_template_name).toBe('order_received_seller');
    expect(input.sendPayload.body_params).toEqual([
      { text: 'Mumbai Warehouse', parameter_name: 'seller_location' },
      { text: 'Ravi Traders', parameter_name: 'buyer_name' },
      { text: '9876543210', parameter_name: 'buyer_phone_number' },
      { text: 'ORD-2026-0001', parameter_name: 'order_number' },
      { text: '12500', parameter_name: 'total_amount' },
      { text: '3', parameter_name: 'item_count' },
      { text: '24', parameter_name: 'eta' },
    ]);
    expect(input.relatedEntityId).toBe('ord-123');
    expect(triggerWhatsAppDispatchMock).toHaveBeenCalledWith(['msg-1']);
  });

  it('enqueues buyer order template with seller_name param and en_IN locale', async () => {
    const { sendOrderReceivedBuyer } = await import('@/lib/server/whatsapp');

    await sendOrderReceivedBuyer(
      {
        sellerPhone: '9001112222',
        sellerName: 'WineYard',
        sellerLocation: 'Mumbai Warehouse',
        buyerFacingSellerName: 'WineYard (Mumbai Warehouse)',
        buyerPhone: '9876543210',
        buyerName: 'Ravi Traders',
        etaHours: 24,
        tenantId: 'tenant-1',
        buyerId: 'buyer-1',
      },
      'ord-123',
      'ORD-2026-0001',
      12500,
      3,
    );

    const input = enqueueWhatsAppMessageMock.mock.calls[0]?.[0] as {
      sendPayload: {
        meta_template_name: string;
        locale: string;
        body_params: Array<{ text: string; parameter_name?: string }>;
      };
    };
    expect(input.sendPayload.meta_template_name).toBe('order_received_buyer');
    expect(input.sendPayload.locale).toBe('en_IN');
    expect(input.sendPayload.body_params).toEqual([
      { text: 'Ravi Traders', parameter_name: 'buyer_name' },
      { text: '3', parameter_name: 'item_count' },
      { text: 'ORD-2026-0001', parameter_name: 'order_number' },
      { text: '12500', parameter_name: 'total_amount' },
      { text: 'WineYard (Mumbai Warehouse)', parameter_name: 'seller_name' },
      { text: '24', parameter_name: 'eta' },
    ]);
    expect(input.sendPayload.body_params.some((param) => param.parameter_name === 'seller_location')).toBe(false);
    expect(triggerWhatsAppDispatchMock).toHaveBeenCalledWith(['msg-1']);
  });

  it('enqueues otp with platform tenant and positional parameters', async () => {
    const { sendLoginOtpWhatsapp } = await import('@/lib/server/whatsapp');

    await sendLoginOtpWhatsapp('9490744841', '123456');

    expect(enqueueWhatsAppMessageMock).toHaveBeenCalledTimes(1);
    const input = enqueueWhatsAppMessageMock.mock.calls[0]?.[0] as {
      tenantId: string;
      metaCategory: string;
      triggerSource: string;
      sendPayload: { meta_template_name: string; body_params: Array<{ text: string }> };
    };
    expect(input.tenantId).toBe('platform-tenant-1');
    expect(input.metaCategory).toBe('authentication');
    expect(input.triggerSource).toBe('otp_login');
    expect(input.sendPayload.meta_template_name).toBe('login_otp');
    expect(input.sendPayload.body_params).toEqual([
      { text: '123456' },
      { text: 'Login to Yukti' },
      { text: '919876543210' },
    ]);
    expect(triggerWhatsAppDispatchMock).toHaveBeenCalledWith(['msg-1']);
  });

  it('enqueues the seller activation invite with named params', async () => {
    const { sendSellerTeamActivationInviteWhatsapp } = await import('@/lib/server/whatsapp');

    await sendSellerTeamActivationInviteWhatsapp({
      tenantId: 'tenant-1',
      phone: '9490744841',
      fullName: 'Ravi Kumar',
      tenantName: 'Acme Traders',
    });

    const input = enqueueWhatsAppMessageMock.mock.calls[0]?.[0] as {
      triggerSource: string;
      metaCategory: string;
      sendPayload: {
        meta_template_name: string;
        body_params: Array<{ text: string; parameter_name?: string }>;
      };
    };
    expect(input.triggerSource).toBe('seller_team_invite');
    expect(input.metaCategory).toBe('utility');
    expect(input.sendPayload.meta_template_name).toBe('invite_user_seller');
    expect(input.sendPayload.body_params).toEqual([
      { text: 'Ravi Kumar', parameter_name: 'seller_user' },
      { text: 'Acme Traders', parameter_name: 'seller_name' },
    ]);
  });
});
