import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());
const mockSchema = vi.hoisted(() => vi.fn(() => ({ from: mockFrom })));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { schema: mockSchema },
}));

describe('enqueueWhatsAppMessage', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSchema.mockClear();
    vi.resetModules();
  });

  it('inserts queued message and queue row', async () => {
    const templateSingle = vi.fn().mockResolvedValue({ data: { id: 'tpl-1' }, error: null });
    const messageSingle = vi.fn().mockResolvedValue({ data: { id: 'msg-1' }, error: null });
    const queueInsert = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'whatsapp_templates') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    maybeSingle: templateSingle,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'whatsapp_messages') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: messageSingle,
            }),
          }),
        };
      }
      if (table === 'whatsapp_send_queue') {
        return { insert: queueInsert };
      }
      return {};
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

    expect(result.enqueued).toBe(true);
    expect(result.messageId).toBe('msg-1');
    expect(queueInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        whatsapp_message_id: 'msg-1',
        priority: 1,
        scheduled_send_at: expect.any(String),
      }),
    );
  });

  it('passes broadcast linkage and explicit schedule to the queue', async () => {
    const templateSingle = vi.fn().mockResolvedValue({ data: { id: 'tpl-1' }, error: null });
    const messageSingle = vi.fn().mockResolvedValue({ data: { id: 'msg-2' }, error: null });
    const queueInsert = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'whatsapp_templates') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    maybeSingle: templateSingle,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'whatsapp_messages') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: messageSingle,
            }),
          }),
        };
      }
      if (table === 'whatsapp_send_queue') {
        return { insert: queueInsert };
      }
      return {};
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

    expect(queueInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: 5,
        scheduled_send_at: '2026-07-10T10:00:00.000Z',
      }),
    );
  });
});
