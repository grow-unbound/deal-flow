'use client';

import { ArrowRightCircle, Copy, Edit2, Loader2, Send, Ban } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { FeatureDisabledState } from '@/components/FeatureGate';
import { PermissionDenied } from '@/components/auth/PermissionDenied';
import { ComposerSidebarCard } from '@/components/seller/composer/ComposerLayout';
import { DocumentBasicsStrip } from '@/components/seller/composer/DocumentBasicsStrip';
import { DocumentComposerShell } from '@/components/seller/composer/DocumentComposerShell';
import {
  BuyerCardFilled,
  DocumentMetaCard,
  LinesTable,
  estimateBandChipClass,
  resolveEstimateBandStatus,
  TotalsCard,
  type EstimateComposerLineRow,
} from '@/components/seller/document-composer';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ROLES } from '@/constants';
import {
  useConvertEstimateToOrder,
  useConvertEstimateToInvoice,
  useDuplicateEstimate,
  useEstimateDetail,
  useSendEstimateDetailWhatsApp,
  useVoidEstimate,
  seedEstimateComposerCache,
} from '@/hooks/useEstimates';
import { useCreateFlags } from '@/hooks/useCreateFlags';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { defaultPaymentTerms } from '@/lib/documents/composer-math';
import type { EstimateComposerProductSearchRow } from '@/types/estimate-composer';
import { formatNumberValue } from '@/lib/utils';

import { ModalConvertEstimate } from '@/components/seller/estimates/modals/ModalConvertEstimate';
import { DocumentComposerLoadingSkeleton as SharedDocumentComposerLoadingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { SendDocumentWhatsAppDialog } from '@/components/seller/shared/SendDocumentWhatsAppDialog';

const noop = () => {};

export function EstimateDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const estimatesFlag = useFlagState('ESTIMATES');
  const { createSalesOrders, createInvoices } = useCreateFlags();
  const { data, isLoading, isError, error } = useEstimateDetail(id);
  const convertMut = useConvertEstimateToOrder(id);
  const convertToInvoiceMut = useConvertEstimateToInvoice(id);
  const voidMut = useVoidEstimate(id);
  const dupMut = useDuplicateEstimate(id);
  const sendMut = useSendEstimateDetailWhatsApp(id);

  const [convertOpen, setConvertOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const diffLines: EstimateComposerLineRow[] = useMemo(() => {
    if (!data) return [];
    return data.items.map((line, index) => ({
      ...line,
      diff: 'clean' as const,
      line_total: data.historical_items?.[index]?.line_total ?? line.line_total,
    }));
  }, [data]);

  const totals = useMemo(() => {
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
        gst_inclusive: false,
      };
    }
    const subtotal = data.subtotal ?? 0;
    const discountFlat = data.discount_flat ?? 0;
    const freight = data.freight ?? 0;
    const roundOff = data.round_off ?? 0;
    return {
      subtotal,
      discount_flat: discountFlat,
      freight,
      taxable_amount: Math.max(subtotal - discountFlat, 0),
      tax_amount: data.tax_amount ?? 0,
      grand_total: data.total_amount ?? 0,
      round_off: roundOff,
      total_units: data.items.reduce((sum, line) => sum + line.qty, 0),
      gst_inclusive: (data.tax_amount ?? 0) === 0,
    };
  }, [data]);

  if (orderManagement === false || estimatesFlag === false) {
    return <FeatureDisabledState />;
  }

  if (isLoading) {
    return <SharedDocumentComposerLoadingSkeleton />;
  }

  if (isError) {
    if (error instanceof Error && error.message === 'forbidden') {
      return <PermissionDenied />;
    }
    return (
      <div className="mx-auto w-full max-w-[1920px] px-8 pt-7 pb-6">
        <ErrorState
          heading="Couldn't load estimate"
          description={error instanceof Error ? error.message : 'Failed to load estimate.'}
          onRetry={() => void queryClient.invalidateQueries({ queryKey: ['tenant-estimate-detail', id] })}
        />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const buyer = data.buyer_context;
  const bandStatus = resolveEstimateBandStatus(data.status, data.valid_until);
  const paymentTermsLabel = buyer ? defaultPaymentTerms(buyer.payment_terms_days) : 'Due on receipt';
  const isAdmin = data.viewer_role === ROLES.SELLER_ADMIN;
  const terminal = data.status === 'converted' || data.status === 'void' || data.status === 'expired';
  const showEdit = !terminal;
  const showVoid = isAdmin && (data.status === 'draft' || data.status === 'sent');
  const showDuplicate = false; // data.status !== 'void' && data.status !== 'converted';
  const showSend = data.status === 'draft' || data.status === 'sent';

  const overLimitBy = buyer ? totals.grand_total - buyer.credit_available : 0;
  const creditWarning = buyer && overLimitBy > 0
    ? `Over limit by ${formatNumberValue(overLimitBy, 'CURRENCY_EXACT')}.`
    : null;
  const isInterState = Boolean(
    buyer?.seller_state
    && buyer?.place_of_supply
    && buyer.seller_state.toLowerCase() !== buyer.place_of_supply.toLowerCase(),
  );

  const statusTone = data.status === 'sent' || data.status === 'converted' ? 'live' : 'draft';

  function handleDuplicate() {
    dupMut.mutate(undefined, {
      onSuccess: (res) => {
        const newId = res.data?.estimate_id;
        const newIdStr = typeof newId === 'string' ? newId : null;
        if (!newIdStr) {
          toast.error('Duplicate succeeded but no id returned');
          return;
        }
        router.push(`/estimates/${newIdStr}/edit`);
      },
    });
  }

  function handleConvertToSO(payload: { line_ids: string[]; qty_overrides: Record<string, number>; delivery_date: string; order_number?: string; added_lines?: { tenant_product_id: string; qty: number; unit_price: number; disc_pct: number; tax_pct: number }[] }) {
    convertMut.mutate(payload, {
      onSuccess: (res) => {
        const orderId = typeof res.data.order_id === 'string' ? res.data.order_id : null;
        setConvertOpen(false);
        toast.success('Sales order created');
        if (orderId) {
          router.push(`/sales-orders/${orderId}`);
        } else {
          router.push(`/estimates/${id}`);
        }
      },
    });
  }

  function handleConvertToInvoice(payload: { line_ids: string[]; qty_overrides: Record<string, number>; invoice_date: string; invoice_number?: string; added_lines?: { tenant_product_id: string; qty: number; unit_price: number; disc_pct: number; tax_pct: number }[] }) {
    convertToInvoiceMut.mutate(payload, {
      onSuccess: (res) => {
        const invoiceId = typeof res.data.invoice_id === 'string' ? res.data.invoice_id : null;
        setConvertOpen(false);
        toast.success('Invoice created');
        if (invoiceId) {
          router.push(`/invoices/${invoiceId}`);
        } else {
          router.push(`/estimates/${id}`);
        }
      },
    });
  }

  function confirmVoid() {
    voidMut.mutate(undefined, {
      onSuccess: () => {
        setVoidOpen(false);
      },
    });
  }

  return (
    <>
      <DocumentComposerShell
        mode="view"
        kind="estimate"
        breadcrumbItems={[
          { label: 'Estimates', href: '/estimates' },
          { label: data.estimate_number, current: true },
        ]}
        title={data.estimate_number}
        subtitle={buyer ? `${buyer.business_name} · ${buyer.bill_address} · ${buyer.place_of_supply}` : 'No buyer assigned.'}
        status={{ label: data.status_label, tone: statusTone, chipClassName: estimateBandChipClass(bandStatus) }}
        titleActions={(
          <>
            {showVoid ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setVoidOpen(true)}
                disabled={voidMut.isPending}
              >
              <Ban className="h-4 w-4" />
                Void estimate
              </Button>
            ) : null}
            {showDuplicate ? (
              <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={handleDuplicate} disabled={dupMut.isPending}>
                <Copy className="h-4 w-4" />
                Duplicate
              </Button>
            ) : null}
            {showEdit ? (
              <Button
                type="button"
                variant={data.status === 'draft' ? 'outline' : 'ghost'}
                size="sm"
                className="gap-2"
                onClick={() => {
                  seedEstimateComposerCache(queryClient, id, data);
                  router.push(`/estimates/${id}/edit`);
                }}
              >
                <Edit2 className="h-4 w-4" />
                Edit estimate
              </Button>
            ) : null}
            {showSend ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="gap-2"
                onClick={() => setSendOpen(true)}
                disabled={sendMut.isPending}
              >
                {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send estimate
              </Button>
            ) : null}
            
            {(data.status === 'draft' || data.status === 'sent') && orderManagement && (createSalesOrders || createInvoices) ? (
              <Button type="button" variant="accent" disabled={convertMut.isPending || convertToInvoiceMut.isPending} size="sm" className="gap-2" onClick={() => setConvertOpen(true)}>
                <ArrowRightCircle className="h-4 w-4" />
                Convert estimate
              </Button>
            ) : null}
          </>
        )}
        basics={(
          <DocumentBasicsStrip
            kind="estimate"
            readOnly
            docNumber={data.estimate_number}
            locationId={data.location_id}
            locationName={data.location_name}
            availableLocations={data.available_locations}
            dateIssued={data.estimate_date}
            secondDate={data.valid_until}
            buyerPoRef={data.buyer_po_ref}
            onDateIssuedChange={noop}
            onSecondDateChange={noop}
            onBuyerPoRefChange={noop}
            onLocationChange={noop}
          />
        )}
        left={buyer
          ? (
              <ComposerSidebarCard>
                <div className="space-y-4">
                  <BuyerCardFilled
                    buyer={buyer}
                    previewTotal={0}
                    paymentTermsValue={paymentTermsLabel}
                    readOnly
                    onPaymentTermsChange={noop}
                    onChangeBuyer={noop}
                  />
                  <DocumentMetaCard
                    readOnly
                    placeOfSupplyValue={data.place_of_supply}
                    notesValue={data.seller_note ?? data.notes ?? ''}
                    freightValue={data.freight}
                    onPlaceOfSupplyChange={noop}
                    onNotesChange={noop}
                    onFreightChange={noop}
                  />
                </div>
              </ComposerSidebarCard>
            )
          : (
              <ComposerSidebarCard>
                <p className="text-base text-cream-700">No buyer on this estimate.</p>
              </ComposerSidebarCard>
            )}
        center={(
          <LinesTable
            kind="estimate"
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
            notesValue={data.seller_note ?? data.notes ?? ''}
            freightValue={String(data.freight)}
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
              gstInclusiveOverride={data.tax_amount === 0}
            />
          </div>
        )}
      />

      <ModalConvertEstimate
        open={convertOpen}
        onOpenChange={setConvertOpen}
        estimateNumber={data.estimate_number}
        buyerName={buyer?.business_name ?? 'Buyer'}
        buyerId={data.buyer_id ?? null}
        lines={data.items}
        createSalesOrders={createSalesOrders}
        createInvoices={createInvoices}
        isSubmitting={convertMut.isPending || convertToInvoiceMut.isPending}
        onConfirmSO={handleConvertToSO}
        onConfirmInvoice={handleConvertToInvoice}
      />

      <SendDocumentWhatsAppDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        title="Send estimate"
        confirmLabel="Send estimate"
        isPending={sendMut.isPending}
        sendState={data.whatsapp_send}
        buyerName={buyer?.business_name ?? '—'}
        phoneNumber={data.whatsapp_send.recipient_phone}
        documentNumberLabel="Estimate Number"
        documentNumber={data.estimate_number}
        amount={totals.grand_total}
        itemCount={diffLines.length}
        onConfirm={() => {
          sendMut.mutate(undefined, {
            onSuccess: () => {
              setSendOpen(false);
            },
          });
        }}
      />

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="max-w-[300px]">
          <DialogHeader>
            <DialogTitle>Void this estimate?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-base text-cream-700">This action cannot be undone. The estimate will be marked as void.</p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setVoidOpen(false)} disabled={voidMut.isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmVoid} disabled={voidMut.isPending}>
              Confirm void
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
