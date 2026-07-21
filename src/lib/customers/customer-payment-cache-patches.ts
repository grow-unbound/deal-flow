import { roundMoney } from '@/lib/currency-input';
import type {
  CustomerDocumentPage,
  CustomerOutstandingInvoiceRow,
  TenantCustomerDetailResponse,
} from '@/hooks/useCustomersLanding';

function nextCreditFields(creditUsed: number, creditLimit: number) {
  const nextCreditUsed = roundMoney(Math.max(creditUsed, 0));
  const nextCreditAvailable = roundMoney(Math.max(creditLimit - nextCreditUsed, 0));
  const nextCreditUsedPct = creditLimit > 0 ? Math.round((nextCreditUsed / creditLimit) * 1000) / 10 : 0;

  return {
    credit_used: nextCreditUsed,
    credit_available: nextCreditAvailable,
    credit_used_pct: nextCreditUsedPct,
  };
}

export function patchCustomerDetailAfterPayment(
  prev: TenantCustomerDetailResponse,
  paymentAmount: number,
): TenantCustomerDetailResponse {
  const creditLimit = prev.meta_strip_4.credit_limit;
  const nextCreditUsed = roundMoney(Math.max(prev.meta_strip_4.credit_used - paymentAmount, 0));
  const creditFields = nextCreditFields(nextCreditUsed, creditLimit);

  return {
    ...prev,
    meta_strip_4: {
      ...prev.meta_strip_4,
      ...creditFields,
    },
    performance_v2: {
      ...prev.performance_v2,
      credit_ops: {
        ...prev.performance_v2.credit_ops,
        credit_used: creditFields.credit_used,
        credit_util_pct: creditFields.credit_used_pct,
        payment_behavior_summary:
          creditFields.credit_used > 0
            ? 'Payment behavior - current receivables present'
            : 'Payment behavior - current',
      },
    },
  };
}

export function patchOutstandingInvoicesAfterPayment(
  prev: { invoices: CustomerOutstandingInvoiceRow[] },
  invoiceId: string,
  paymentAmount: number,
): { invoices: CustomerOutstandingInvoiceRow[] } {
  return {
    invoices: prev.invoices.flatMap((invoice) => {
      if (invoice.id !== invoiceId) return [invoice];

      const nextOutstanding = roundMoney(Math.max(invoice.outstanding_amount - paymentAmount, 0));
      if (nextOutstanding < 0.005) return [];

      return [{
        ...invoice,
        outstanding_amount: nextOutstanding,
      }];
    }),
  };
}

export function patchCustomerDocumentsAfterPayment(
  prev: CustomerDocumentPage,
  invoiceId: string,
  paymentAmount: number,
): CustomerDocumentPage {
  return {
    ...prev,
    rows: prev.rows.map((row) => {
      if (row.id !== invoiceId) return row;

      const nextOutstanding = roundMoney(Math.max(row.outstanding_amount - paymentAmount, 0));
      const paidFully = nextOutstanding < 0.005;

      return {
        ...row,
        outstanding_amount: paidFully ? 0 : nextOutstanding,
        status: paidFully ? 'paid' : row.status,
      };
    }),
  };
}

export function patchOutstandingInvoicesWithPaymentResult(
  prev: { invoices: CustomerOutstandingInvoiceRow[] },
  invoiceId: string,
  outstandingBalance: number,
): { invoices: CustomerOutstandingInvoiceRow[] } {
  if (outstandingBalance < 0.005) {
    return {
      invoices: prev.invoices.filter((invoice) => invoice.id !== invoiceId),
    };
  }

  return {
    invoices: prev.invoices.flatMap((invoice) => {
      if (invoice.id !== invoiceId) return [invoice];
      return [{
        ...invoice,
        outstanding_amount: outstandingBalance,
        status: outstandingBalance > 0 ? invoice.status : 'sent',
      }];
    }),
  };
}

export function patchCustomerDocumentsWithPaymentResult(
  prev: CustomerDocumentPage,
  invoiceId: string,
  outstandingBalance: number,
  status: string,
): CustomerDocumentPage {
  return {
    ...prev,
    rows: prev.rows.map((row) => {
      if (row.id !== invoiceId) return row;
      return {
        ...row,
        outstanding_amount: outstandingBalance,
        status,
      };
    }),
  };
}
