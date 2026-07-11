import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendRequestReceivedBuyerMock = vi.hoisted(() => vi.fn());
const sendRequestReceivedSellerMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/whatsapp', () => ({
  sendOrderReceivedBuyer: vi.fn(),
  sendOrderReceivedSeller: vi.fn(),
  sendRequestReceivedBuyer: (...args: unknown[]) => sendRequestReceivedBuyerMock(...args),
  sendRequestReceivedSeller: (...args: unknown[]) => sendRequestReceivedSellerMock(...args),
}));

const baseCtx = {
  sellerPhone: '9001112222',
  sellerName: 'WineYard',
  sellerLocation: 'Mumbai',
  buyerFacingSellerName: 'WineYard',
  buyerPhone: '9876543210',
  buyerName: 'Ravi',
  etaHours: 24,
  tenantId: 'tenant-1',
  buyerId: 'buyer-1',
};

describe('sendBuyerTransactionNotifications', () => {
  beforeEach(() => {
    sendRequestReceivedBuyerMock.mockReset();
    sendRequestReceivedSellerMock.mockReset();
    vi.resetModules();
  });

  it('returns true when at least one estimate notification enqueues', async () => {
    sendRequestReceivedBuyerMock.mockResolvedValue(true);
    sendRequestReceivedSellerMock.mockResolvedValue(false);

    const { sendBuyerTransactionNotifications } = await import('@/lib/server/buyer-transaction-notifications');
    const enqueued = await sendBuyerTransactionNotifications(
      'estimate',
      baseCtx,
      'est-1',
      'EST-2026-0001',
      5000,
      2,
    );

    expect(enqueued).toBe(true);
  });

  it('returns false when both estimate notifications fail to enqueue', async () => {
    sendRequestReceivedBuyerMock.mockResolvedValue(false);
    sendRequestReceivedSellerMock.mockResolvedValue(false);

    const { sendBuyerTransactionNotifications } = await import('@/lib/server/buyer-transaction-notifications');
    const enqueued = await sendBuyerTransactionNotifications(
      'estimate',
      baseCtx,
      'est-1',
      'EST-2026-0001',
      5000,
      2,
    );

    expect(enqueued).toBe(false);
  });
});
