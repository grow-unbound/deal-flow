import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockSchema = vi.hoisted(() => vi.fn(() => ({ from: mockFrom, rpc: mockRpc })));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { schema: mockSchema },
}));

describe('enqueueWhatsAppMessage', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
    mockSchema.mockClear();
    vi.resetModules();
  });

  it('calls the shared enqueue rpc with transactional priority defaults', async () => {
    mockRpc.mockResolvedValue({
      data: { message_id: 'msg-1', enqueued: true },
      error: null,
    });

    const { enqueueWhatsAppMessage } = await import('@/lib/server/whatsapp-enqueue');
    const result = await enqueueWhatsAppMessage({
      tenantId: 'tenant-1',
      recipientPhone: '919876543210',
      metaCategory: 'utility',
      triggerSource: 'order_placed',
      sendPayload: {
        meta_template_name: 'order_received_buyer',
        locale: 'en',
        body_params: [{ text: 'ORD-1' }],
        button_params: [{ type: 'url', index: '0', text: 'ord-1' }],
      },
      relatedEntityType: 'orders',
      relatedEntityId: 'ord-1',
    });

    expect(result).toEqual({
      messageId: 'msg-1',
      enqueued: true,
      skipped: undefined,
    });
    expect(mockRpc).toHaveBeenCalledWith(
      'enqueue_whatsapp_message',
      expect.objectContaining({
        p_tenant_id: 'tenant-1',
        p_recipient_phone: '919876543210',
        p_trigger_source: 'order_placed',
        p_related_entity_type: 'orders',
        p_related_entity_id: 'ord-1',
        p_priority: 1,
      }),
    );
  });

  it('passes broadcast linkage and explicit schedule to the shared enqueue rpc', async () => {
    mockRpc.mockResolvedValue({
      data: { message_id: 'msg-2', enqueued: true },
      error: null,
    });

    const { enqueueWhatsAppMessage } = await import('@/lib/server/whatsapp-enqueue');
    await enqueueWhatsAppMessage({
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      recipientPhone: '919876543210',
      metaCategory: 'marketing',
      triggerSource: 'broadcast',
      whatsappBroadcastId: 'broadcast-1',
      scheduledSendAt: '2026-07-10T10:00:00.000Z',
      sendPayload: {
        meta_template_name: 'campaign_announcement',
        locale: 'en',
        body_params: [{ text: 'Buyer', parameter_name: 'buyer_name' }],
      },
      priority: 5,
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'enqueue_whatsapp_message',
      expect.objectContaining({
        p_priority: 5,
        p_scheduled_send_at: '2026-07-10T10:00:00.000Z',
        p_whatsapp_broadcast_id: 'broadcast-1',
      }),
    );
  });

  it('surfaces duplicate idempotency responses from the rpc', async () => {
    mockRpc.mockResolvedValue({
      data: { message_id: 'msg-3', enqueued: false, skipped: 'duplicate' },
      error: null,
    });

    const { enqueueWhatsAppMessage } = await import('@/lib/server/whatsapp-enqueue');
    const result = await enqueueWhatsAppMessage({
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      recipientPhone: '919876543210',
      metaCategory: 'utility',
      triggerSource: 'order_placed',
      sendPayload: {
        meta_template_name: 'order_received_buyer',
        locale: 'en',
        body_params: [{ text: 'ORD-1' }],
      },
      relatedEntityType: 'orders',
      relatedEntityId: 'ord-1',
    });

    expect(result).toEqual({
      messageId: 'msg-3',
      enqueued: false,
      skipped: 'duplicate',
    });
  });
});
