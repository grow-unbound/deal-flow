'use client';

import { useTenantSettings } from '@/hooks/useTenantSettings';

export function useCreateFlags() {
  const { data } = useTenantSettings();
  const f = data?.modules.orders.features;
  return {
    createEstimates:   f?.create_enquiries    ?? false,
    createSalesOrders: f?.create_sales_orders ?? false,
    createInvoices:    f?.create_invoices     ?? false,
  };
}
