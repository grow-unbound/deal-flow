import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const canAccessDocumentLocationMock = vi.fn();
const sendInvoiceReminderWhatsAppMock = vi.fn();
const tableData = vi.hoisted(() => ({
  entries: [] as any[],
  invoices: [] as any[],
  entryUpdates: [] as any[],
  invoiceUpdates: [] as any[],
  eventInsert: null as any,
  auditInsert: null as any,
}));

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));
vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));
vi.mock('@/lib/server/seller-location-access', () => ({
  canAccessDocumentLocation: (...args: unknown[]) => canAccessDocumentLocationMock(...args),
}));
vi.mock('@/lib/server/whatsapp-document-send', () => ({
  sendInvoiceReminderWhatsApp: (...args: unknown[]) => sendInvoiceReminderWhatsAppMock(...args),
}));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      from: (table: string) => {
        if (table === 'entries' || table === 'invoices') {
          return {
            select: () => ({
              in: () => ({
                is: vi.fn().mockResolvedValue({ data: tableData[table as 'entries' | 'invoices'], error: null }),
              }),
            }),
            update: (payload: unknown) => {
              const record = { table, payload };
              if (table === 'entries') tableData.entryUpdates.push(record);
              if (table === 'invoices') tableData.invoiceUpdates.push(record);
              return {
                in: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
                eq: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
              };
            },
          };
        }
        if (table === 'entry_events') {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              tableData.eventInsert = payload;
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'audit_log') {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              tableData.auditInsert = payload;
              return Promise.resolve({ error: null });
            }),
          };
        }
        return { select: vi.fn(), update: vi.fn(), insert: vi.fn() };
      },
    }),
  },
}));

import { POST } from '../../app/api/tenant/entries/collections/remind/route';

const tenantId = '11111111-1111-1111-1111-111111111111';
const buyerId = '22222222-2222-2222-2222-222222222222';
const entry1 = '33333333-3333-3333-3333-333333333333';
const entry2 = '44444444-4444-4444-4444-444444444444';
const invoice1 = '55555555-5555-5555-5555-555555555555';
const invoice2 = '66666666-6666-6666-6666-666666666666';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/tenant/entries/collections/remind', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function seedRows(status = 'new') {
  tableData.entries = [
    {
      id: entry1, tenant_id: tenantId, buyer_id: buyerId, location_id: null,
      entry_type: 'invoice_due', status, source_entity_type: 'invoice', source_entity_id: invoice1,
      metadata: { invoice_number: 'INV-1' },
    },
    {
      id: entry2, tenant_id: tenantId, buyer_id: buyerId, location_id: null,
      entry_type: 'invoice_overdue', status, source_entity_type: 'invoice', source_entity_id: invoice2,
      metadata: { invoice_number: 'INV-2' },
    },
  ];
  tableData.invoices = [
    { id: invoice1, tenant_id: tenantId, buyer_id: buyerId, status: 'sent', due_date: '2026-09-18T00:00:00Z', invoice_number: 'INV-1' },
    { id: invoice2, tenant_id: tenantId, buyer_id: buyerId, status: 'sent', due_date: '2026-09-01T00:00:00Z', invoice_number: 'INV-2' },
  ];
}

describe('POST /api/tenant/entries/collections/remind', () => {
  beforeEach(() => {
    tableData.entries = [];
    tableData.invoices = [];
    tableData.entryUpdates = [];
    tableData.invoiceUpdates = [];
    tableData.eventInsert = null;
    tableData.auditInsert = null;
    getVerifiedClaimsMock.mockReset();
    getFlagMock.mockReset();
    canAccessDocumentLocationMock.mockReset();
    sendInvoiceReminderWhatsAppMock.mockReset();
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: tenantId, sub: 'user-1', role: 'seller_admin' });
    getFlagMock.mockResolvedValue(true);
    canAccessDocumentLocationMock.mockReturnValue(true);
    sendInvoiceReminderWhatsAppMock.mockResolvedValue({ ok: true, state: {}, recipientPhone: '9876543210' });
  });

  it('sends one buyer reminder and records one event per selected invoice entry', async () => {
    seedRows();
    const res = await POST(request({ buyer_id: buyerId, entry_ids: [entry1, entry2] }));
    expect(res.status).toBe(200);
    expect(sendInvoiceReminderWhatsAppMock).toHaveBeenCalledTimes(1);
    expect(tableData.invoiceUpdates).toHaveLength(1);
    expect(tableData.entryUpdates).toHaveLength(2);
    expect(tableData.eventInsert).toHaveLength(2);
    expect(tableData.eventInsert.map((event: any) => event.action)).toEqual(['send_reminder', 'send_reminder']);
    expect(tableData.auditInsert.action).toBe('invoice_reminder_batch');
  });

  it('rejects waiting invoice entries', async () => {
    seedRows('waiting');
    const res = await POST(request({ buyer_id: buyerId, entry_ids: [entry1, entry2] }));
    expect(res.status).toBe(400);
    expect(sendInvoiceReminderWhatsAppMock).not.toHaveBeenCalled();
  });
});
