import { describe, expect, it } from 'vitest';

import type { TenantCustomerDetailResponse } from '@/hooks/useCustomersLanding';
import {
  patchCustomerDetailAfterPayment,
  patchCustomerDocumentsAfterPayment,
  patchCustomerDocumentsWithPaymentResult,
  patchOutstandingInvoicesAfterPayment,
  patchOutstandingInvoicesWithPaymentResult,
} from '@/lib/customers/customer-payment-cache-patches';

function makeCustomerDetail(creditUsed: number): TenantCustomerDetailResponse {
  return {
    header: {
      id: 'buyer-1',
      buyer_name: 'Acme',
      initials: 'AC',
      hue: 'teal',
      status_label: 'Active',
      status_tone: 'success',
      buyer_app_enabled: true,
      whatsapp_opted_out: false,
      city: 'Mumbai',
      buyer_since: null,
      years_label: '—',
      net_terms_days: 30,
      subtitle_meta: {
        buyer_app_status_label: 'Buyer App enabled',
        city: 'Mumbai',
        phone: null,
        last_activity_at: null,
        last_activity_kind: null,
        last_activity_days_ago: null,
        last_activity_date_label: '—',
      },
    },
    meta_strip_4: {
      invoiced_sales_90d: 0,
      invoice_count_90d: 0,
      primary_demand_kind: 'none',
      demand_90d: 0,
      demand_order_count_90d: 0,
      demand_estimate_count_90d: 0,
      credit_used: creditUsed,
      credit_available: 1000 - creditUsed,
      credit_limit: 1000,
      credit_used_pct: creditUsed / 10,
      last_invoice_value: 0,
      last_invoice_date: null,
    },
    details: {
      business_name: 'Acme',
      contact_name: null,
      phone: null,
      email: null,
      gstin: null,
      gst_treatment: null,
      city: null,
      state: null,
      pincode: null,
      zone: null,
      billing_address: null,
      shipping_address: null,
      payment_terms_days: null,
      credit_limit: 1000,
      default_price_list_id: null,
      assigned_price_list: null,
      buyer_users: [],
      contacts: [],
      is_active: true,
      buyer_app_enabled: true,
    },
    performance: {
      monthly_spend_trend: [],
      brand_affinity: [],
      order_frequency: [],
    },
    performance_v2: {
      headline: { spend_mtd: 0, growth_pct: 0, orders_mtd: 0, aov_mtd: 0 },
      brand_mix: { total_spend: 0, rows: [] },
      top_skus: [],
      credit_ops: {
        last_order_days_ago: '—',
        last_order_value: 0,
        catalog_opens_mtd: 0,
        credit_used: creditUsed,
        credit_limit: 1000,
        credit_util_pct: creditUsed / 10,
        payment_behavior_summary: 'Payment behavior - current receivables present',
      },
    },
    tab_badges: {
      orders_90d: 0,
      estimates_90d: 0,
      invoices_90d: 0,
      price_lists_assigned: 0,
    },
    cohorts_summary: { rows: [] },
    price_lists: { assigned_count: 0 },
    role: 'seller_admin',
  };
}

describe('customer payment cache patches', () => {
  it('reduces credit used on customer detail after payment', () => {
    const next = patchCustomerDetailAfterPayment(makeCustomerDetail(500), 200);

    expect(next.meta_strip_4.credit_used).toBe(300);
    expect(next.meta_strip_4.credit_available).toBe(700);
    expect(next.meta_strip_4.credit_used_pct).toBe(30);
    expect(next.performance_v2.credit_ops.credit_used).toBe(300);
  });

  it('removes fully paid invoices from outstanding list', () => {
    const next = patchOutstandingInvoicesAfterPayment({
      invoices: [{
        id: 'inv-1',
        invoice_number: 'INV-1',
        invoice_date: null,
        due_date: null,
        total_amount: 500,
        outstanding_amount: 500,
        location_id: null,
        location_name: null,
        place_of_supply: null,
        status: 'overdue',
      }],
    }, 'inv-1', 500);

    expect(next.invoices).toEqual([]);
  });

  it('marks invoice as paid in customer documents list', () => {
    const next = patchCustomerDocumentsAfterPayment({
      rows: [{
        id: 'inv-1',
        number: 'INV-1',
        placed_at: null,
        created_at: null,
        expires_at: null,
        due_date: null,
        location_name: null,
        place_of_supply: null,
        source_kind: 'direct',
        source_label: null,
        campaign_name: null,
        items_count: 1,
        total_amount: 500,
        outstanding_amount: 500,
        status: 'overdue',
      }],
      total: 1,
      limit: 200,
      offset: 0,
    }, 'inv-1', 500);

    expect(next.rows[0]?.status).toBe('paid');
    expect(next.rows[0]?.outstanding_amount).toBe(0);
  });

  it('uses server payment result for partial payments', () => {
    const next = patchCustomerDocumentsWithPaymentResult({
      rows: [{
        id: 'inv-1',
        number: 'INV-1',
        placed_at: null,
        created_at: null,
        expires_at: null,
        due_date: null,
        location_name: null,
        place_of_supply: null,
        source_kind: 'direct',
        source_label: null,
        campaign_name: null,
        items_count: 1,
        total_amount: 500,
        outstanding_amount: 500,
        status: 'overdue',
      }],
      total: 1,
      limit: 200,
      offset: 0,
    }, 'inv-1', 300, 'overdue');

    expect(next.rows[0]?.status).toBe('overdue');
    expect(next.rows[0]?.outstanding_amount).toBe(300);
  });

  it('removes fully paid invoices using server payment result', () => {
    const next = patchOutstandingInvoicesWithPaymentResult({
      invoices: [{
        id: 'inv-1',
        invoice_number: 'INV-1',
        invoice_date: null,
        due_date: null,
        total_amount: 500,
        outstanding_amount: 500,
        location_id: null,
        location_name: null,
        place_of_supply: null,
        status: 'overdue',
      }],
    }, 'inv-1', 0);

    expect(next.invoices).toEqual([]);
  });
});
