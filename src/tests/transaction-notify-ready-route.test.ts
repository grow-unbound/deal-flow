import { beforeEach, describe, expect, it, vi } from 'vitest';

const enqueueTransactionReadyNotificationsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/transaction-ready-notifications', () => ({
  parseTransactionNotifyWebhook: (body: unknown) => {
    if (!body || typeof body !== 'object') return null;
    const record = body as Record<string, unknown>;
    const newRecord = (record.record ?? record.new) as Record<string, unknown> | undefined;
    const oldRecord = (record.old_record ?? record.old) as Record<string, unknown> | undefined;
    if (!newRecord?.id) return null;
    if (newRecord.estimate_number !== undefined) {
      return {
        kind: 'estimate' as const,
        entityId: newRecord.id as string,
        numberField: 'estimate_number' as const,
        oldNumber: (oldRecord?.estimate_number as string | null | undefined) ?? null,
        newNumber: (newRecord.estimate_number as string | null | undefined) ?? null,
      };
    }
    if (newRecord.order_number !== undefined) {
      return {
        kind: 'order' as const,
        entityId: newRecord.id as string,
        numberField: 'order_number' as const,
        oldNumber: (oldRecord?.order_number as string | null | undefined) ?? null,
        newNumber: (newRecord.order_number as string | null | undefined) ?? null,
      };
    }
    return null;
  },
  shouldNotifyTransactionReady: (parsed: { oldNumber: string | null; newNumber: string | null }) => {
    const oldTrimmed = parsed.oldNumber?.trim() ?? '';
    const newTrimmed = parsed.newNumber?.trim() ?? '';
    return Boolean(newTrimmed && oldTrimmed !== newTrimmed && !oldTrimmed);
  },
  enqueueTransactionReadyNotifications: (...args: unknown[]) =>
    enqueueTransactionReadyNotificationsMock(...args),
  verifyInternalNotifySecret: vi.fn(() => true),
}));

describe('internal transactions notify-ready route', () => {
  beforeEach(() => {
    enqueueTransactionReadyNotificationsMock.mockReset();
    enqueueTransactionReadyNotificationsMock.mockResolvedValue({ enqueued: true });
  });

  it('enqueues whatsapp when estimate_number transitions from null to a value', async () => {
    const { POST } = await import('../../app/api/internal/transactions/notify-ready/route');
    const request = new Request('http://localhost/api/internal/transactions/notify-ready', {
      method: 'POST',
      headers: { 'x-push-secret': 'test-secret' },
      body: JSON.stringify({
        type: 'UPDATE',
        schema: 'app',
        table: 'estimates',
        old_record: { id: 'est-1', estimate_number: null },
        record: { id: 'est-1', estimate_number: 'EST-000045' },
      }),
    });

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.enqueued).toBe(true);
    expect(enqueueTransactionReadyNotificationsMock).toHaveBeenCalledWith('estimate', 'est-1');
  });

  it('ignores updates that do not assign a new document number', async () => {
    const { POST } = await import('../../app/api/internal/transactions/notify-ready/route');
    const request = new Request('http://localhost/api/internal/transactions/notify-ready', {
      method: 'POST',
      headers: { 'x-push-secret': 'test-secret' },
      body: JSON.stringify({
        type: 'UPDATE',
        schema: 'app',
        table: 'orders',
        old_record: { id: 'ord-1', order_number: 'SO-1' },
        record: { id: 'ord-1', order_number: 'SO-1', status: 'confirmed' },
      }),
    });

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.note).toBe('no_number_transition');
    expect(enqueueTransactionReadyNotificationsMock).not.toHaveBeenCalled();
  });
});
