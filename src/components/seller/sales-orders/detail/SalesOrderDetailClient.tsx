'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Edit2, PackageCheck, Truck, X } from 'lucide-react';
import { toast } from 'sonner';

import { FeatureDisabledState } from '@/components/FeatureGate';
import { ComposerSidebarCard } from '@/components/seller/composer/ComposerLayout';
import { DocumentBasicsStrip } from '@/components/seller/composer/DocumentBasicsStrip';
import { DocumentComposerLoadingSkeleton, DocumentComposerShell } from '@/components/seller/composer/DocumentComposerShell';
import {
  BuyerCardFilled,
  InsightsCard,
  LinesTable,
  salesOrderBandChipClass,
  SalesOrderDocStatusBand,
  TotalsCard,
  resolveSalesOrderBandStatus,
  type EstimateComposerLineRow,
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
import { ROLES } from '@/constants';
import {
  useCancelSalesOrder,
  useDeliverSalesOrder,
  useDispatchSalesOrder,
  useSalesOrderDetail,
} from '@/hooks/useSalesOrderDetail';
import { prefetchSalesOrderComposer } from '@/hooks/useSalesOrders';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { mapSalesOrderDetailToComposerLines, formatEstimateChipLabel } from '@/lib/sales-orders/tenant-order-detail';
import { computeLineTotal, computeTotals, defaultPaymentTerms } from '@/lib/documents/composer-math';
import { formatCompactInr } from '@/lib/utils';
import type { SalesOrderUiStatus } from '@/types/tenant-sales-orders';
import type { EstimateComposerProductSearchRow } from '@/types/estimate-composer';

import { ModalCancelOrder } from './ModalCancelOrder';
import { ModalDispatch } from './ModalDispatch';

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
  const { data, isLoading, isError, error } = useSalesOrderDetail(id);
  const dispatchMut = useDispatchSalesOrder(id);
  const deliverMut = useDeliverSalesOrder(id);
  const cancelMut = useCancelSalesOrder(id);

  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);

  const diffLines: EstimateComposerLineRow[] = useMemo(() => {
    if (!data) return [];
    return mapSalesOrderDetailToComposerLines(data).map((line) => ({
      ...line,
      line_total: computeLineTotal(line),
    }));
  }, [data]);

  const totals = useMemo(() => {
    if (!data) return computeTotals([], 0, 0, 0);
    return computeTotals(diffLines, data.discount_flat, data.freight, data.round_off);
  }, [data, diffLines]);

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
          className="inline-flex items-center rounded-full border border-cream-200 bg-cream-50 px-2 py-0.5 text-[12px] font-medium text-teal-800 hover:bg-cream-100"
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
    return <DocumentComposerLoadingSkeleton showStatusBand />;
  }

  if (isError) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return <FeatureDisabledState />;
    }
    return (
      <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6">
        <p className="text-[13px] text-danger-700">{error instanceof Error ? error.message : 'Failed to load sales order.'}</p>
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

  const showEdit = ui === 'received' || ui === 'confirmed';
  const showCancel = (ui === 'received' || ui === 'confirmed') && isAdmin;

  const overLimitBy = buyer ? totals.grand_total - buyer.credit_available : 0;
  const creditWarning = buyer && overLimitBy > 0 ? `Over limit by ${formatCompactInr(overLimitBy)}.` : null;
  const expiringSoon = (() => {
    if (!data.expected_delivery) return false;
    const today = new Date();
    const exp = new Date(`${data.expected_delivery}T23:59:59.000Z`);
    return (exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000) <= 3;
  })();
  const isInterState = Boolean(
    buyer?.seller_state
    && buyer?.place_of_supply
    && buyer.seller_state.toLowerCase() !== buyer.place_of_supply.toLowerCase(),
  );

  const orderDate = data.placed_at ? data.placed_at.slice(0, 10) : '';
  const expectedYmd = data.expected_delivery ?? '';

  const statusLabel = bandStatus === 'draft' ? 'Draft' : SO_STATUS_TITLE[ui];
  const statusTone: 'draft' | 'live' = ui === 'cancelled' || ui === 'delivered' ? 'draft' : 'live';

  const soWhatsNext = (() => {
    if (bandStatus === 'draft') {
      return {
        description: 'Complete buyer, lines, and dates before you confirm this order.',
        action: null as ReactNode,
      };
    }
    if (ui === 'received') {
      return {
        description: 'Order is logged. Confirm when you assign stock and set an expected ship date.',
        action: null as ReactNode,
      };
    }
    if (ui === 'confirmed') {
      return {
        description: 'Pick and ship when ready. The buyer sees movement after dispatch.',
        action: (
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setDispatchOpen(true)} disabled={dispatchMut.isPending}>
            <Truck className="h-4 w-4" />
            Dispatch
          </Button>
        ),
      };
    }
    if (ui === 'dispatched') {
      return {
        description: 'On the road with your fleet. Mark delivered once the buyer confirms receipt.',
        action: (
          <Button type="button" size="sm" className="gap-2" onClick={() => setDeliverOpen(true)} disabled={deliverMut.isPending}>
            <PackageCheck className="h-4 w-4" />
            Mark delivered
          </Button>
        ),
      };
    }
    if (ui === 'delivered') {
      return { description: 'This order is complete.', action: null as ReactNode };
    }
    if (ui === 'cancelled') {
      return {
        description: data.cancel_reason ? `Cancelled: ${data.cancel_reason}` : 'This order was cancelled.',
        action: null as ReactNode,
      };
    }
    return null;
  })();

  return (
    <>
      <DocumentComposerShell
        mode="view"
        kind="so"
        breadcrumbItems={[
          { label: 'Sales' },
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
            {showEdit ? (
              <Button
                type="button"
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
          </>
        )}
        statusBand={(
          <SalesOrderDocStatusBand
            status={bandStatus}
            placedAt={data.placed_at}
            receivedAt={data.received_at}
            confirmedAt={data.confirmed_at}
            dispatchedAt={data.dispatched_at}
            deliveredAt={data.delivered_at}
            cancelledAt={data.cancelled_at}
            deliveryDateYmd={expectedYmd || null}
            carrier={data.carrier}
            cancelReason={data.cancel_reason}
            hasBackorder={data.has_backorder}
            whatsNext={soWhatsNext}
          />
        )}
        basics={(
          <DocumentBasicsStrip
            kind="so"
            readOnly
            docNumber={data.order_number}
            dateIssued={orderDate}
            secondDate={expectedYmd}
            buyerPoRef={data.buyer_po_ref ?? ''}
            placeOfSupply={data.place_of_supply ?? buyer?.place_of_supply ?? 'Unknown'}
            onDateIssuedChange={noop}
            onSecondDateChange={noop}
            onBuyerPoRefChange={noop}
            onPlaceOfSupplyChange={noop}
          />
        )}
        left={(
          <ComposerSidebarCard>
            <div className="space-y-4">
              {buyer ? (
                <BuyerCardFilled
                  buyer={buyer}
                  previewTotal={0}
                  paymentTermsValue={paymentTermsLabel}
                  readOnly
                  onPaymentTermsChange={noop}
                  onSwap={noop}
                />
              ) : (
                <p className="text-[13px] text-cream-700">No buyer on this order.</p>
              )}
              {orderMeta ? (
                <div className="rounded-[10px] border border-cream-200 bg-cream-50 px-3 py-3 text-[12px] leading-[1.55] text-cream-800">
                  {orderMeta}
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
            <TotalsCard totals={totals} previousTotals={null} creditWarning={creditWarning} isInterState={isInterState} lineCount={diffLines.length} />
            <InsightsCard buyer={buyer} expiringSoon={expiringSoon} readOnly />
          </div>
        )}
      />

      <ModalDispatch
        open={dispatchOpen}
        onOpenChange={setDispatchOpen}
        orderNumber={data.order_number}
        isPending={dispatchMut.isPending}
        onConfirm={(payload) => {
          dispatchMut.mutate(
            { ...payload, notify_buyer: false },
            {
              onSuccess: () => {
                setDispatchOpen(false);
                toast.success('Order dispatched');
              },
              onError: (e) => {
                toast.error(e instanceof Error ? e.message : 'Dispatch failed');
              },
            },
          );
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
              toast.success('Order cancelled');
            },
            onError: (e) => {
              toast.error(e instanceof Error ? e.message : 'Cancel failed');
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
                deliverMut.mutate(
                  {},
                  {
                    onSuccess: () => {
                      setDeliverOpen(false);
                      toast.success('Marked delivered');
                    },
                    onError: (err) => {
                      toast.error(err instanceof Error ? err.message : 'Update failed');
                    },
                  },
                );
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
