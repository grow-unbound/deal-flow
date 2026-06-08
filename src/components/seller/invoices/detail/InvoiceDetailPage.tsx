'use client';

import { Ban, Edit2, IndianRupee, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { FeatureDisabledState } from '@/components/FeatureGate';
import {
  BuyerCardFilled,
  DocComposerFrame,
  DocStatusBandInvoice,
  DocStrip,
  DocTitleRow,
  DocTop,
  InsightsCard,
  LinesTable,
  TotalsCard,
  type EstimateComposerLineRow,
} from '@/components/seller/document-composer';
import { ModalMarkInvoicePaid, ModalSendInvoice, ModalVoidInvoice } from '@/components/seller/invoices/modals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { INDIAN_STATES, ROLES } from '@/constants';
import { useFlagState } from '@/hooks/useFeatureFlag';
import {
  useInvoiceDetail,
  useMarkInvoicePaid,
  useSendInvoiceReminder,
  useVoidInvoice,
} from '@/hooks/useInvoiceDetail';
import { formatCompactInr } from '@/lib/utils';
import type { EstimateComposerBuyerContext, EstimateComposerProductSearchRow, EstimateComposerTotals } from '@/types/estimate-composer';

const noop = () => {};

function defaultPaymentTerms(days: number) {
  return days > 0 ? `Net ${days}` : 'Due on receipt';
}

export function InvoiceDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const invoicesFlag = useFlagState('INVOICES');
  const { data, isLoading, isError, error } = useInvoiceDetail(id);
  const payMut = useMarkInvoicePaid(id);
  const voidMut = useVoidInvoice(id);
  const remindMut = useSendInvoiceReminder(id);

  const [payOpen, setPayOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const buyerContext: EstimateComposerBuyerContext | null = useMemo(() => {
    if (!data?.buyer?.id) return null;
    const b = data.buyer;
    const creditAvailable = Math.max(b.credit_limit - b.credit_used, 0);
    return {
      id: b.id,
      business_name: b.name,
      contact_name: b.contact_name,
      phone: b.phone,
      email: b.email,
      gstin: b.gstin,
      bill_address: b.bill_address,
      city: b.city,
      state: b.state,
      pincode: b.pincode,
      place_of_supply: data.place_of_supply,
      seller_state: b.seller_state,
      payment_terms_days: b.payment_terms_days,
      credit_limit: b.credit_limit,
      credit_used: b.credit_used,
      credit_available: creditAvailable,
      active_pricelist: b.active_pricelist,
      sales_agent_name: b.sales_agent_name,
    };
  }, [data]);

  const diffLines: EstimateComposerLineRow[] = useMemo(() => {
    if (!data) return [];
    return data.items.map((line, index) => ({
      id: `inv-line-${index}`,
      tenant_product_id: '',
      product_name: line.product_name,
      sku: '',
      brand_name: '',
      brand_initials: '',
      brand_hue: 'cream',
      hsn_code: line.hsn,
      on_hand: 0,
      qty: line.qty,
      unit_price: line.rate,
      disc_pct: line.discount_pct,
      tax_pct: line.tax_pct ?? 0,
      line_total: line.line_total,
      scheme_tag: null,
      diff: 'clean',
    }));
  }, [data]);

  const totals: EstimateComposerTotals = useMemo(() => {
    if (!data) {
      return {
        subtotal: 0,
        discount_flat: 0,
        freight: 0,
        taxable_amount: 0,
        tax_amount: 0,
        round_off: 0,
        grand_total: 0,
        total_units: 0,
      };
    }
    const t = data.totals;
    return {
      subtotal: t.subtotal,
      discount_flat: t.discount_amt,
      freight: t.freight,
      taxable_amount: t.taxable,
      tax_amount: t.tax_amount,
      round_off: t.round_off,
      grand_total: t.grand_total,
      total_units: diffLines.reduce((sum, line) => sum + line.qty, 0),
    };
  }, [data, diffLines]);

  const isInterState = useMemo(() => {
    if (!data) return false;
    if (data.gstin_locked) return !data.intra_state_tax;
    const st = data.buyer.state?.toLowerCase().trim();
    const seller = data.buyer.seller_state?.toLowerCase().trim();
    if (!st || !seller) return false;
    return st !== seller;
  }, [data]);

  const taxRows = useMemo(() => {
    if (!data?.gstin_locked || !data.totals.gst_rows.length) return undefined;
    return data.totals.gst_rows.map((row) => ({
      label: row.label,
      value: row.amount,
      previous: null as number | null,
      rowClassName: `tax-row--${row.token}`,
    }));
  }, [data]);

  const paymentTermsLabel = buyerContext ? defaultPaymentTerms(buyerContext.payment_terms_days) : 'Due on receipt';

  const overLimitBy = buyerContext ? totals.grand_total - buyerContext.credit_available : 0;
  const creditWarning = buyerContext && overLimitBy > 0 ? `Over limit by ${formatCompactInr(overLimitBy)}.` : null;

  const expiringSoon = (() => {
    if (!data?.due_date) return false;
    const today = new Date();
    const due = new Date(`${data.due_date}T12:00:00.000Z`);
    return (due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000) <= 3;
  })();

  if (orderManagement === false || invoicesFlag === false) {
    return <FeatureDisabledState />;
  }

  if (isLoading) {
    return null;
  }

  if (isError) {
    if (error instanceof Error && error.message === 'forbidden') {
      return <FeatureDisabledState />;
    }
    return (
      <div className="mx-auto w-full max-w-[1440px] px-8 py-6">
        <p className="text-[13px] text-danger-700">{error instanceof Error ? error.message : 'Failed to load invoice.'}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const terminalPaidOrVoid = data.status === 'paid' || data.status === 'void';
  const showEdit = !terminalPaidOrVoid;
  const showPayRemind = data.status === 'sent' || data.status === 'overdue';
  const showVoidBtn =
    data.viewer_role === ROLES.SELLER_ADMIN && (data.status === 'draft' || data.status === 'sent' || data.status === 'overdue');

  const placeOptions = Array.from(new Set([...INDIAN_STATES, data.place_of_supply, 'Unknown']));

  return (
    <>
      <DocComposerFrame
        mode="view"
        kind="invoice"
        statusBand={(
          <DocStatusBandInvoice
            dbStatus={data.db_status}
            dueDate={data.due_date}
            sentAt={data.sent_at}
            viewedAt={data.viewed_at}
            viewedByName={data.viewed_by_name}
            paidAt={data.paid_at}
            paymentMethod={data.payment_method}
            paymentReference={data.payment_reference}
            amountOutstanding={data.amount_outstanding}
            grandTotal={data.totals.grand_total}
            voidedAt={data.voided_at}
          />
        )}
        top={(
          <DocTop kind="invoice" docNumber={data.doc_number} onClose={() => router.push('/invoices')} />
        )}
        titleRow={(
          <DocTitleRow
            title={(
              <span className="flex flex-wrap items-center gap-2">
                <span>{`${data.doc_number} · ${data.buyer.name}`}</span>
                {data.version > 1 ? (
                  <Badge variant="warning" className="text-xs font-medium">
                    v
                    {data.version}
                  </Badge>
                ) : null}
              </span>
            )}
            subtitle={buyerContext ? `${data.place_of_supply} · ${buyerContext.bill_address}` : 'No buyer on this invoice.'}
            rightActions={(
              <>
                {showEdit ? (
                  <Button type="button" size="sm" className="gap-2" onClick={() => router.push(`/invoices/${id}/edit`)}>
                    <Edit2 className="h-4 w-4" />
                    Edit invoice
                  </Button>
                ) : null}
                {showPayRemind ? (
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setPayOpen(true)}>
                    <IndianRupee className="h-4 w-4" />
                    Mark as paid
                  </Button>
                ) : null}
                {showPayRemind ? (
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setRemindOpen(true)}>
                    <Mail className="h-4 w-4" />
                    Send reminder
                  </Button>
                ) : null}
                {showVoidBtn ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setVoidOpen(true)}
                    disabled={voidMut.isPending}
                  >
                    <Ban className="h-4 w-4" />
                    Void invoice
                  </Button>
                ) : null}
              </>
            )}
          />
        )}
        strip={(
          <DocStrip
            kind="invoice"
            readOnly
            docNumber={data.doc_number}
            dateIssued={data.invoice_date}
            validUntil={data.due_date ?? ''}
            buyerPoRef={data.buyer_po_ref ?? ''}
            placeOfSupply={data.place_of_supply}
            placeOptions={placeOptions}
            onDocNumberChange={noop}
            onDateIssuedChange={noop}
            onValidUntilChange={noop}
            onBuyerPoRefChange={noop}
            onPlaceOfSupplyChange={noop}
          />
        )}
        left={buyerContext
          ? (
              <BuyerCardFilled
                buyer={buyerContext}
                previewTotal={totals.grand_total}
                paymentTermsValue={paymentTermsLabel}
                readOnly
                onPaymentTermsChange={noop}
                onSwap={noop}
              />
            )
          : (
              <aside className="rounded-[14px] border border-dashed border-cream-400 bg-cream-50 p-4 text-[13px] text-cream-700">
                No buyer on this invoice.
              </aside>
            )}
        center={(
          <LinesTable
            kind="invoice"
            buyerSelected={Boolean(data.buyer_id)}
            readOnly
            lines={diffLines}
            productQuery=""
            productResults={[]}
            searchOpen={false}
            notesExpanded={false}
            freightExpanded={false}
            internalExpanded={false}
            singleNoteMode
            notesValue={data.seller_note}
            freightValue={String(data.totals.freight)}
            internalValue=""
            onProductQueryChange={noop}
            onSearchOpenChange={noop}
            onAddProduct={((_product: EstimateComposerProductSearchRow) => {})}
            onLineChange={noop}
            onRemoveLine={noop}
            onNotesValueChange={noop}
            onFreightValueChange={noop}
            onInternalValueChange={noop}
            onToggleNotes={noop}
            onToggleFreight={noop}
            onToggleInternal={noop}
          />
        )}
        right={(
          <div className="space-y-4">
            <TotalsCard
              totals={totals}
              previousTotals={null}
              creditWarning={creditWarning}
              isInterState={isInterState}
              lineCount={diffLines.length}
              taxRows={taxRows}
            />
            <InsightsCard buyer={buyerContext} expiringSoon={expiringSoon} readOnly />
          </div>
        )}
      />

      <ModalMarkInvoicePaid
        open={payOpen}
        onOpenChange={setPayOpen}
        amountOutstanding={data.amount_outstanding}
        isPending={payMut.isPending}
        onConfirm={async (payload) => {
          await payMut.mutateAsync(payload);
          toast.success('Payment recorded');
        }}
      />

      <ModalSendInvoice
        open={remindOpen}
        onOpenChange={setRemindOpen}
        docNumber={data.doc_number}
        grandTotal={data.totals.grand_total}
        dueDateYmd={data.due_date}
        isPending={remindMut.isPending}
        onConfirm={async (payload) => {
          await remindMut.mutateAsync(payload);
          toast.success('Reminder logged');
        }}
      />

      <ModalVoidInvoice
        open={voidOpen}
        onOpenChange={setVoidOpen}
        confirmToken={data.doc_number}
        isPending={voidMut.isPending}
        onConfirm={async () => {
          await voidMut.mutateAsync();
          toast.success('Invoice voided');
        }}
      />
    </>
  );
}
