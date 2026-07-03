'use client';

import { useTenantSettings } from '@/hooks/useTenantSettings';

export function useCreateFlags() {
  const { data } = useTenantSettings();
  const f = data?.modules.orders.features;
  return {
    createEstimates:   f?.create_enquiries    ?? true,
    createSalesOrders: f?.create_sales_orders ?? true,
    createInvoices:    f?.create_invoices     ?? true,
  };
}
