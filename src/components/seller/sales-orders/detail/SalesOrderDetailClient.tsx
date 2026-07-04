'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Edit2, Loader2, PackageCheck, Send, Truck, X } from 'lucide-react';

import { FeatureDisabledState } from '@/components/FeatureGate';
import { PermissionDenied } from '@/components/auth/PermissionDenied';
import { ComposerSidebarCard } from '@/components/seller/composer/ComposerLayout';
import { DocumentBasicsStrip } from '@/components/seller/composer/DocumentBasicsStrip';
import { DocumentComposerLoadingSkeleton, DocumentComposerShell } from '@/components/seller/composer/DocumentComposerShell';
import {
  BuyerCardFilled,
  DocumentMetaCard,
  LinesTable,
  salesOrderBandChipClass,
  TotalsCard,
  resolveSalesOrderBandStatus,
  type EstimateComposerLineRow,
  ModalSendDocument,
} from '@/components/seller/document-composer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { ROLES } from '@/constants';
import {
  useCancelSalesOrder,
  useDeliverSalesOrder,
  useDispatchSalesOrder,
  useSalesOrderDetail,
  useSendSalesOrder,
  useConfirmSalesOrder,
} from '@/hooks/useSalesOrderDetail';
import { useCreateFlags } from '@/hooks/useCreateFlags';
import { prefetchSalesOrderComposer } from '@/hooks/useSalesOrders';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { mapSalesOrderDetailToComposerLines, formatEstimateChipLabel } from '@/lib/sales-orders/tenant-order-detail';
import { defaultPaymentTerms } from '@/lib/documents/composer-math';
import { formatCompactInr } from '@/lib/utils';
import type { SalesOrderUiStatus } from '@/types/tenant-sales-orders';
import type { EstimateComposerProductSearchRow } from '@/types/estimate-composer';

import { ModalCancelOrder } from './ModalCancelOrder';
import { ModalDispatch } from './ModalDispatch';
import { ModalConfirmSalesOrder } from './ModalConfirmSalesOrder';

const noop = () => {};

const SO_STATUS_TITLE: Record<SalesOrderUiStatus, string> = {
  received: 'Received',
  confirmed: 'Confirmed',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function formatPlacedAt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SalesOrderDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const salesOrdersFlag = useFlagState('SALES_ORDERS');
  const { createInvoices } = useCreateFlags();
  const { data, isLoading, isError, error } = useSalesOrderDetail(id);
  const dispatchMut = useDispatchSalesOrder(id);
  const deliverMut = useDeliverSalesOrder(id);
  const cancelMut = useCancelSalesOrder(id);
  const sendMut = useSendSalesOrder(id);
  const confirmMut = useConfirmSalesOrder(id);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const diffLines: EstimateComposerLineRow[] = useMemo(() => {
    if (!data) return [];
    return mapSalesOrderDetailToComposerLines(data).map((line) => ({
      ...line,
      line_total: line.line_total,
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
        grand_total: 0,
        round_off: 0,
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
      total_units: data.lines.reduce((sum, line) => sum + line.qty, 0),
      gst_inclusive: (data.tax_amount ?? 0) === 0,
    };
  }, [data]);

  const orderMeta = useMemo(() => {
    if (!data) return null;
    const d = data;
    const units = d.lines.reduce((s, l) => s + l.qty, 0);
    const nodes: ReactNode[] = [
      <span key="placed">Placed {formatPlacedAt(d.placed_at)}</span>,
      <span key="via">
        via <span className="font-semibold text-cream-900">{d.catalog_name ?? '—'}</span>
      </span>,
      <span key="ch">{d.source === 'buyer_app' ? 'Buyer app' : d.source === 'cockpit_manual' ? 'Seller cockpit' : d.source === 'csv_import' ? 'CSV import' : '—'}</span>,
      <span key="lines">
        {d.lines.length} lines · {units} units
      </span>,
    ];
    if (d.estimate) {
      const label = formatEstimateChipLabel(d.estimate.estimate_number);
      nodes.push(
        <Link
          key="est"
          href={`/estimates/${d.estimate.id}`}
          className="inline-flex items-center rounded-full border border-cream-200 bg-cream-50 px-2 py-0.5 text-sm font-medium text-teal-800 hover:bg-cream-100"
        >
          From: {label}
        </Link>,
      );
    }
    return <span className="flex flex-wrap items-center gap-x-2 gap-y-1">{nodes}</span>;
  }, [data]);

  if (orderManagement === false || salesOrdersFlag === false) {
    return <FeatureDisabledState />;
  }

  if (isLoading) {
    return <DocumentComposerLoadingSkeleton />;
  }

  if (isError) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return <PermissionDenied />;
    }
    return (
      <div className="mx-auto w-full max-w-[1920px] px-8 pt-7 pb-6">
        <ErrorState
          heading="Couldn't load sales order"
          description={error instanceof Error ? error.message : 'Failed to load sales order.'}
          onRetry={() => void queryClient.invalidateQueries({ queryKey: ['tenant-sales-order', id] })}
        />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const buyer = data.buyer_context;
  const bandStatus = resolveSalesOrderBandStatus(data.db_status, data.ui_status);
  const paymentTermsLabel = buyer ? defaultPaymentTerms(buyer.payment_terms_days) : 'Due on receipt';
  const isAdmin = data.viewer_role === ROLES.SELLER_ADMIN;
  const ui = data.ui_status;

  const showConfirm = ui === 'received';
  const showDispatch = ui === 'confirmed';
  const showEdit = ui === 'received' || ui === 'confirmed';
  const showCancel = (ui === 'received' || ui === 'confirmed') && isAdmin;
  const showSend = ui === 'received' || ui === 'confirmed' || ui === 'dispatched';

  const overLimitBy = buyer ? totals.grand_total - buyer.credit_available : 0;
  const creditWarning = buyer && overLimitBy > 0 ? `Over limit by ${formatCompactInr(overLimitBy)}.` : null;
  const isInterState = Boolean(
    buyer?.seller_state
    && buyer?.place_of_supply
    && buyer.seller_state.toLowerCase() !== buyer.place_of_supply.toLowerCase(),
  );

  const orderDate = data.placed_at ? data.placed_at.slice(0, 10) : '';
  const expectedYmd = data.expected_delivery ?? '';

  const statusLabel = bandStatus === 'draft' ? 'Draft' : SO_STATUS_TITLE[ui];
  const statusTone: 'draft' | 'live' = ui === 'cancelled' || ui === 'delivered' ? 'draft' : 'live';

  return (
    <>
      <DocumentComposerShell
        mode="view"
        kind="so"
        breadcrumbItems={[
          { label: 'Sales orders', href: '/sales-orders' },
          { label: data.order_number, current: true },
        ]}
        title={data.order_number}
        subtitle={buyer ? `${buyer.business_name} · ${buyer.place_of_supply} · ${buyer.bill_address}` : 'No buyer assigned.'}
        status={{
          label: statusLabel,
          tone: statusTone,
          chipClassName: salesOrderBandChipClass(bandStatus),
        }}
        titleActions={(
          <>
          {showCancel ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive gap-2"
              onClick={() => setCancelOpen(true)}
              disabled={cancelMut.isPending}
            >
              <X className="h-4 w-4" />
              Cancel order
            </Button>
            ) : null} 
            {showEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => {
                  void prefetchSalesOrderComposer(queryClient, id);
                  router.push(`/sales-orders/${id}/edit`);
                }}
              >
                <Edit2 className="h-4 w-4" />
                Edit order
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
                Send order
              </Button>
            ) : null}
            {ui === 'confirmed' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setDispatchOpen(true)}
                disabled={dispatchMut.isPending}
              >
                <Truck className="h-4 w-4" />
                Dispatch
              </Button>
            ) : null}
            {ui === 'dispatched' ? (
              <Button type="button" variant="accent" size="sm" className="gap-2" onClick={() => setDeliverOpen(true)} disabled={deliverMut.isPending}>
                <PackageCheck className="h-4 w-4" />
                Mark delivered
              </Button>
            ) : null}
            {showConfirm ? (
              <Button
                type="button"
                variant="accent"
                size="sm"
                className="gap-2"
                onClick={() => setConfirmOpen(true)}
                disabled={confirmMut.isPending}
              >  
                <Truck className="h-4 w-4" />
                Confirm order
              </Button>
            ) : null}
          </>
        )}
        basics={(
          <DocumentBasicsStrip
            kind="so"
            readOnly
            docNumber={data.order_number}
            locationId={data.location_id}
            availableLocations={[]}
            dateIssued={orderDate}
            secondDate={expectedYmd}
            buyerPoRef={data.buyer_po_ref ?? ''}
            locationName={data.location_name}
            onDateIssuedChange={noop}
            onSecondDateChange={noop}
            onBuyerPoRefChange={noop}
            onLocationChange={noop}
          />
        )}
        left={(
          <ComposerSidebarCard>
            <div className="space-y-4">
              {buyer ? (
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
                    placeOfSupplyValue={data.place_of_supply ?? buyer.place_of_supply ?? 'Unknown'}
                    notesValue={data.seller_note ?? data.notes ?? ''}
                    freightValue={data.freight}
                    onPlaceOfSupplyChange={noop}
                    onNotesChange={noop}
                    onFreightChange={noop}
                  />
                </div>
              ) : (
                <p className="text-base text-cream-700">No buyer on this order.</p>
              )}
              {orderMeta ? (
                <div className="rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-3 text-sm leading-[1.55] text-cream-800">
                  {orderMeta}
                </div>
              ) : null}
              {data.has_backorder && (ui === 'confirmed' || ui === 'dispatched') ? (
                <div className="callout callout--warning text-sm leading-[1.5]">
                  <strong>Backorder.</strong> Some lines exceed available stock — buyer has been notified.
                </div>
              ) : null}
            </div>
          </ComposerSidebarCard>
        )}
        center={(
          <LinesTable
            kind="so"
            buyerSelected={Boolean(data.buyer_context)}
            readOnly
            lines={diffLines}
            productQuery=""
            productResults={[]}
            searchOpen={false}
            notesExpanded={false}
            freightExpanded={false}
            internalExpanded={false}
            singleNoteMode
            notesValue={data.notes ?? ''}
            freightValue={String(data.freight)}
            internalValue={data.seller_note ?? ''}
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

      <ModalDispatch
        open={dispatchOpen}
        onOpenChange={setDispatchOpen}
        orderNumber={data.order_number}
        isPending={dispatchMut.isPending}
        onConfirm={(payload) => {
          dispatchMut.mutate({ ...payload, notify_buyer: false }, {
            onSuccess: () => {
              setDispatchOpen(false);
            },
          });
        }}
      />

      <ModalSendDocument
        open={sendOpen}
        onOpenChange={setSendOpen}
        title="Send sales order"
        recipientDefault={buyer?.phone ?? buyer?.email ?? ''}
        messageDefault="Please review this sales order."
        lineCount={diffLines.length}
        grandTotal={totals.grand_total}
        isPending={sendMut.isPending}
        onConfirm={async (payload) => {
          await sendMut.mutateAsync(payload);
          setSendOpen(false);
        }}
      />

      <ModalCancelOrder
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        orderNumber={data.order_number}
        isPending={cancelMut.isPending}
        onConfirm={(payload) => {
          cancelMut.mutate(payload, {
            onSuccess: () => {
              setCancelOpen(false);
            },
          });
        }}
      />

      <ModalConfirmSalesOrder
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        orderNumber={data.order_number}
        lines={data.lines}
        createInvoices={createInvoices}
        isSubmitting={confirmMut.isPending}
        onConfirm={(input) => {
          confirmMut.mutate(input, {
            onSuccess: () => {
              setConfirmOpen(false);
            },
          });
        }}
      />

      <AlertDialog open={deliverOpen} onOpenChange={setDeliverOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this order as delivered?</AlertDialogTitle>
            <AlertDialogDescription>
              This updates the order status to delivered. You can undo only by support if you make a mistake.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deliverMut.isPending}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={deliverMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                deliverMut.mutate({}, {
                  onSuccess: () => {
                    setDeliverOpen(false);
                  },
                });
              }}
            >
              {deliverMut.isPending ? 'Saving…' : 'Confirm delivered'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
