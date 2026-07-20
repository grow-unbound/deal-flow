import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendRequestUpdateBuyerMock = vi.hoisted(() => vi.fn());
const sendInvoiceUpdateBuyerMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/whatsapp', () => ({
  sendRequestUpdateBuyer: (...args: unknown[]) => sendRequestUpdateBuyerMock(...args),
  sendInvoiceUpdateBuyer: (...args: unknown[]) => sendInvoiceUpdateBuyerMock(...args),
}));

function createDb({
  creditsBalance = 10,
  buyerPhone = '9876543210',
  sellerPhone = '9876543210',
  templatePresent = true,
}: {
  creditsBalance?: number;
  buyerPhone?: string | null;
  sellerPhone?: string | null;
  templatePresent?: boolean;
} = {}) {
  return {
    schema: () => ({
      from: (table: string) => {
        if (table === 'tenants') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    business_name: 'Tenant Co',
                    settings: { business: { phone: sellerPhone } },
                    whatsapp_credits_balance: creditsBalance,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'buyers') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: 'buyer-1',
                        business_name: 'Acme',
                        contact_name: 'Priya',
                        phone: buyerPhone,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'whatsapp_templates') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    is: () => ({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: templatePresent ? { id: 'tpl-1' } : null,
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'whatsapp_rate_card') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { credits_per_message: 1 },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      },
    }),
  };
}

describe('whatsapp document send helper', () => {
  beforeEach(() => {
    sendRequestUpdateBuyerMock.mockReset();
    sendInvoiceUpdateBuyerMock.mockReset();
  });

  it('blocks when tenant credits are insufficient', async () => {
    const { getBuyerDocumentSendState } = await import('@/lib/server/whatsapp-document-send');
    const state = await getBuyerDocumentSendState(createDb({ creditsBalance: 0 }) as any, {
      kind: 'estimate',
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
    });

    expect(state.can_send).toBe(false);
    expect(state.block_reason).toBe('insufficient_credits');
  });

  it('blocks when buyer phone is missing', async () => {
    const { getBuyerDocumentSendState } = await import('@/lib/server/whatsapp-document-send');
    const state = await getBuyerDocumentSendState(createDb({ buyerPhone: null }) as any, {
      kind: 'invoice',
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
    });

    expect(state.can_send).toBe(false);
    expect(state.block_reason).toBe('missing_buyer_phone');
  });

  it('sends estimate WhatsApp and returns recipient linkage', async () => {
    sendRequestUpdateBuyerMock.mockResolvedValue(true);
    const { sendBuyerDocumentWhatsApp } = await import('@/lib/server/whatsapp-document-send');
    const result = await sendBuyerDocumentWhatsApp(createDb() as any, {
      kind: 'estimate',
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      documentId: 'est-1',
      documentNumber: 'EST-1',
      totalAmount: 1200,
      itemCount: 2,
    });

    expect(result.ok).toBe(true);
    expect(sendRequestUpdateBuyerMock).toHaveBeenCalledWith(
      expect.any(Object),
      'est-1',
      'EST-1',
      1200,
      2,
    );
  });

  it('sends invoice WhatsApp and returns recipient linkage', async () => {
    sendInvoiceUpdateBuyerMock.mockResolvedValue(true);
    const { sendBuyerDocumentWhatsApp } = await import('@/lib/server/whatsapp-document-send');
    const result = await sendBuyerDocumentWhatsApp(createDb() as any, {
      kind: 'invoice',
      tenantId: 'tenant-1',
      buyerId: 'buyer-1',
      documentId: 'inv-1',
      documentNumber: 'INV-1',
      totalAmount: 2400,
      itemCount: 3,
    });

    expect(result.ok).toBe(true);
    expect(sendInvoiceUpdateBuyerMock).toHaveBeenCalledWith(
      expect.any(Object),
      'inv-1',
      'INV-1',
      2400,
      3,
    );
  });
});
