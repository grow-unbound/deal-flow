import { describe, expect, it } from 'vitest';

import { buildBroadcastMessageQueue } from '@/lib/server/whatsapp-broadcast-send';

type QueryResult<T> = Promise<{ data: T; error: null }>;

function createQueryBuilder<T>(data: T) {
  return {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    in() {
      return this;
    },
    is() {
      return this;
    },
    maybeSingle(): QueryResult<T> {
      return Promise.resolve({ data, error: null });
    },
    then(resolve: (value: { data: T; error: null }) => unknown) {
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
}

function createMockDb() {
  return {
    schema(schemaName: string) {
      expect(schemaName).toBe('app');

      return {
        from(table: string) {
          switch (table) {
            case 'tenants':
              return createQueryBuilder({
                id: 'tenant-1',
                business_name: 'Wine Yard Technologies',
                settings: {
                  buyer_app: {
                    whatsapp_display_name: 'Wine Yard Technologies',
                    whatsapp_number: '9490744841',
                  },
                },
              });
            case 'buyers':
              return createQueryBuilder([
                {
                  id: 'buyer-1',
                  business_name: 'Catalog Customer',
                  contact_name: 'Catalog Customer',
                  phone: '9490744841',
                },
              ]);
            case 'invoices':
              return createQueryBuilder([
                {
                  buyer_id: 'buyer-1',
                  due_date: '2026-04-09T00:00:00+00:00',
                  outstanding_balance: 332,
                  status: 'overdue',
                },
              ]);
            default:
              throw new Error(`Unexpected table: ${table}`);
          }
        },
      };
    },
  };
}

describe('buildBroadcastMessageQueue', () => {
  it('does not require CTA button params for buyer payment reminder static links', async () => {
    const queue = await buildBroadcastMessageQueue(createMockDb(), {
      tenantId: 'tenant-1',
      whatsappBroadcastId: 'broadcast-1',
      buyerIds: ['buyer-1'],
      variableBindings: {},
      template: {
        id: 'template-1',
        meta_template_name: 'buyer_payment_reminder',
        meta_category: 'utility',
        approval_status: 'approved',
        use_case: 'payment_reminder',
        locale: 'en',
        variables: [
          { key: 'buyer_name' },
          { key: 'seller_name' },
          { key: 'due_invoice_count' },
          { key: 'outstanding_amount' },
          { key: 'due_status' },
          { key: 'seller_phone_number' },
        ],
        button_config: {
          type: 'url',
          url_template: 'https://app.useyukti.in/buy/orders',
        },
        buttons_config: [
          {
            type: 'url',
            index: '0',
            url_template: 'https://app.useyukti.in/buy/orders',
          },
        ],
        header_config: { format: 'text' },
      },
    });

    expect(queue).toHaveLength(1);
    expect(queue[0]?.sendPayload.meta_template_name).toBe('buyer_payment_reminder');
    expect(queue[0]?.sendPayload.body_params).toEqual([
      { text: 'Catalog', parameter_name: 'buyer_name' },
      { text: 'Wine Yard Technologies', parameter_name: 'seller_name' },
      { text: '1', parameter_name: 'due_invoice_count' },
      { text: '332', parameter_name: 'outstanding_amount' },
      { text: 'overdue by 105 days', parameter_name: 'due_status' },
      { text: '9490744841', parameter_name: 'seller_phone_number' },
    ]);
    expect(queue[0]?.sendPayload.button_params).toBeUndefined();
  });
});
