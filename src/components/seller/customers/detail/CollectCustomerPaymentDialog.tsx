'use client';

import { useEffect, useMemo, useState } from 'react';
import { CircleDollarSign } from 'lucide-react';

import {
  type CustomerOutstandingInvoiceRow,
  useCollectCustomerInvoicePayment,
  useCustomerOutstandingInvoices,
} from '@/hooks/useCustomersLanding';
import { toDatetimeLocalValue } from '@/lib/date-utils';
import { formatCompactInr, formatCurrency, formatMetricValue } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface CollectCustomerPaymentDialogProps {
  buyerId: string;
  buyerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function InvoiceOption({
  invoice,
  selected,
}: {
  invoice: CustomerOutstandingInvoiceRow;
  selected: boolean;
}) {
  return (
    <label
      htmlFor={`invoice-${invoice.id}`}
      className={[
        'flex cursor-pointer items-start gap-3 rounded-[14px] border p-4 transition-colors',
        selected ? 'border-teal-500 bg-teal-50' : 'border-cream-300 bg-white hover:border-cream-400',
      ].join(' ')}
    >
      <RadioGroupItem value={invoice.id} id={`invoice-${invoice.id}`} className="mt-1" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm font-semibold text-cream-950">{invoice.invoice_number}</p>
            <p className="text-sm text-cream-700">
              Issued {formatDate(invoice.invoice_date)} · Due {formatDate(invoice.due_date)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-base font-semibold text-cream-950">
              {formatMetricValue('value', invoice.outstanding_amount)}
            </p>
            <p className="text-xs uppercase tracking-[0.1em] text-cream-600">Outstanding</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 text-sm text-cream-700">
          <span>Status {invoice.status === 'overdue' ? 'Overdue' : 'Sent'} · {invoice.location_name ?? 'Unassigned'} · Value {formatCurrency(invoice.total_amount)}</span>
        </div>
      </div>
    </label>
  );
}

export function CollectCustomerPaymentDialog({
  buyerId,
  buyerName,
  open,
  onOpenChange,
}: CollectCustomerPaymentDialogProps) {
  const { data, isLoading, isFetching } = useCustomerOutstandingInvoices(buyerId, open);
  const mutation = useCollectCustomerInvoicePayment(buyerId);
  const invoices = data?.invoices ?? [];

  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [paidAtLocal, setPaidAtLocal] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank transfer');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId],
  );

  useEffect(() => {
    if (!open) return;
    setPaidAtLocal(toDatetimeLocalValue(new Date()));
    setPaymentMethod('Bank transfer');
    setReference('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const defaultInvoiceId = invoices[0]?.id ?? '';
    setSelectedInvoiceId((current) => {
      if (current && invoices.some((invoice) => invoice.id === current)) return current;
      return defaultInvoiceId;
    });
  }, [invoices, open]);

  useEffect(() => {
    if (!selectedInvoice) {
      setAmount('');
      return;
    }
    setAmount(String(selectedInvoice.outstanding_amount));
  }, [selectedInvoice]);

  async function handleSubmit() {
    if (!selectedInvoice) return;
    const parsedDate = new Date(paidAtLocal);
    if (Number.isNaN(parsedDate.getTime())) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;

    try {
      await mutation.mutateAsync({
        invoiceId: selectedInvoice.id,
        amount: parsedAmount,
        payment_method: paymentMethod.trim(),
        payment_reference: reference.trim() || undefined,
        paid_at: parsedDate.toISOString(),
      });
      onOpenChange(false);
    } catch {
      /* mutation surfaces toast */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Collect payment</DialogTitle>
          <DialogDescription>
            Pick any outstanding invoice for {buyerName} and record a payment against it.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex min-h-0 flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <DateTimePicker id="customer-paid-at" label="Paid at" value={paidAtLocal} onChange={setPaidAtLocal} />
            <div className="space-y-2">
              <Label htmlFor="customer-payment-method" className="text-base">
                Payment method
              </Label>
              <Input
                id="customer-payment-method"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                placeholder="Bank transfer / UPI / Cash"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-payment-reference" className="text-base">
                Payment reference <span className="text-cream-500">(optional)</span>
              </Label>
              <Input
                id="customer-payment-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="UPI / NEFT / cheque ref"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-payment-amount" className="text-base">
                Amount
              </Label>
              <Input
                id="customer-payment-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-cream-700">
                  Outstanding invoices
                </h3>
                <p className="mt-1 text-sm text-cream-600">
                  This list includes invoices across all locations for this customer.
                </p>
              </div>
              {isFetching && !isLoading ? <p className="text-sm text-cream-600">Refreshing…</p> : null}
            </div>
            {isLoading ? (
              <div className="rounded-[14px] border border-cream-300 bg-cream-50 p-4 text-sm text-cream-700">
                Loading outstanding invoices…
              </div>
            ) : invoices.length > 0 ? (
              <div className="min-h-0 overflow-y-auto pr-1">
                <RadioGroup value={selectedInvoiceId} onValueChange={setSelectedInvoiceId} className="gap-3">
                  {invoices.map((invoice) => (
                    <InvoiceOption key={invoice.id} invoice={invoice} selected={invoice.id === selectedInvoiceId} />
                  ))}
                </RadioGroup>
              </div>
            ) : (
              <div className="rounded-[14px] border border-cream-300 bg-cream-50 p-4 text-sm text-cream-700">
                No outstanding invoices are available for this customer right now.
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleSubmit()}
            disabled={
              mutation.isPending
              || !selectedInvoice
              || invoices.length === 0
              || !paidAtLocal
              || !paymentMethod.trim()
            }
          >
            <CircleDollarSign className="h-4 w-4" />
            {mutation.isPending ? 'Saving…' : 'Save payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
