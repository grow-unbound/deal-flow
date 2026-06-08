'use client';

import { ArrowRightCircle, Copy, Edit2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { FeatureDisabledState } from '@/components/FeatureGate';
import {
  BuyerCardFilled,
  DocComposerFrame,
  DocStatusBand,
  DocStrip,
  DocTitleRow,
  DocTop,
  InsightsCard,
  LinesTable,
  resolveEstimateBandStatus,
  TotalsCard,
  type EstimateComposerLineRow,
} from '@/components/seller/document-composer';
import { Button } from '@/components/ui/button';
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
  useDuplicateEstimate,
  useEstimateDetail,
  useVoidEstimate,
} from '@/hooks/useEstimates';
import { useFlagState } from '@/hooks/useFeatureFlag';
import type { EstimateComposerProductSearchRow, EstimateComposerTotals } from '@/types/estimate-composer';
import { formatCompactInr } from '@/lib/utils';

import { ModalConvertEstimateToSO } from '@/components/seller/estimates/modals/ModalConvertEstimateToSO';

function defaultPaymentTerms(days: number) {
  return days > 0 ? `Net ${days}` : 'Due on receipt';
}

function computeLineTotal(line: Pick<EstimateComposerLineRow, 'qty' | 'unit_price' | 'disc_pct' | 'tax_pct'>) {
  const taxable = line.qty * line.unit_price * (1 - line.disc_pct / 100);
  return Number((taxable + taxable * (line.tax_pct / 100)).toFixed(2));
}

function computeTotals(lines: EstimateComposerLineRow[], discountFlat: number, freight: number, roundOff: number): EstimateComposerTotals {
  const activeLines = lines.filter((line) => line.diff !== 'removed');
  const subtotal = activeLines.reduce((sum, line) => sum + line.qty * line.unit_price * (1 - line.disc_pct / 100), 0);
  const taxAmount = activeLines.reduce((sum, line) => {
    const taxable = line.qty * line.unit_price * (1 - line.disc_pct / 100);
    return sum + taxable * (line.tax_pct / 100);
  }, 0);
  return {
    subtotal,
    discount_flat: discountFlat,
    freight,
    taxable_amount: Math.max(subtotal - discountFlat, 0),
    tax_amount: taxAmount,
    round_off: roundOff,
    grand_total: Math.max(subtotal - discountFlat, 0) + taxAmount + freight + roundOff,
    total_units: activeLines.reduce((sum, line) => sum + line.qty, 0),
  };
}

const noop = () => {};

export function EstimateDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const estimatesFlag = useFlagState('ESTIMATES');
  const { data, isLoading, isError, error } = useEstimateDetail(id);
  const convertMut = useConvertEstimateToOrder(id);
  const voidMut = useVoidEstimate(id);
  const dupMut = useDuplicateEstimate(id);

  const [convertOpen, setConvertOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const diffLines: EstimateComposerLineRow[] = useMemo(() => {
    if (!data) return [];
    return data.items.map((line) => ({
      ...line,
      diff: 'clean' as const,
      line_total: computeLineTotal(line),
    }));
  }, [data]);

  const totals = useMemo(() => {
    if (!data) {
      return computeTotals([], 0, 0, 0);
    }
    return computeTotals(diffLines, data.discount_flat, data.freight, data.round_off);
  }, [data, diffLines]);

  if (orderManagement === false || estimatesFlag === false) {
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
      <div className="max-w-[1440px] mx-auto w-full px-8 py-6">
        <p className="text-[13px] text-danger-700">{error instanceof Error ? error.message : 'Failed to load estimate.'}</p>
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
  const showConvert = data.status === 'sent';
  const showVoid = isAdmin && (data.status === 'draft' || data.status === 'sent');
  const showDuplicate = data.status !== 'void' && data.status !== 'converted';

  const overLimitBy = buyer ? totals.grand_total - buyer.credit_available : 0;
  const creditWarning = buyer && overLimitBy > 0
    ? `Over limit by ${formatCompactInr(overLimitBy)}.`
    : null;
  const expiringSoon = (() => {
    const today = new Date();
    const vu = new Date(data.valid_until);
    return (vu.getTime() - today.getTime()) / (24 * 60 * 60 * 1000) <= 3;
  })();
  const isInterState = Boolean(
    buyer?.seller_state
    && buyer?.place_of_supply
    && buyer.seller_state.toLowerCase() !== buyer.place_of_supply.toLowerCase(),
  );

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
      onError: (e) => {
        toast.error(e instanceof Error ? e.message : 'Duplicate failed');
      },
    });
  }

  function handleConvert(payload: { line_ids: string[]; delivery_date: string; order_number?: string }) {
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
      onError: (e) => {
        toast.error(e instanceof Error ? e.message : 'Convert failed');
      },
    });
  }

  function confirmVoid() {
    voidMut.mutate(undefined, {
      onSuccess: () => {
        setVoidOpen(false);
        toast.success('Estimate voided');
      },
      onError: (e) => {
        toast.error(e instanceof Error ? e.message : 'Void failed');
      },
    });
  }

  return (
    <>
      <DocComposerFrame
        mode="view"
        kind="estimate"
        statusBand={(
          <DocStatusBand
            status={bandStatus}
            sentAt={data.sent_at}
            viewedAt={data.viewed_at}
            viewedByName={data.viewed_by_name}
            validUntil={data.valid_until}
            voidedAt={data.voided_at}
            convertedToOrderId={data.converted_to_order_id}
            linkedOrderNumber={data.linked_order_number}
          />
        )}
        top={(
          <nav className="flex flex-wrap items-center gap-1.5 text-[12px] text-cream-600">
            <button type="button" className="hover:text-cream-900" onClick={() => router.push('/estimates')}>
              Estimates
            </button>
            <span className="text-cream-400">›</span>
            <span className="text-cream-900">{data.estimate_number}</span>
          </nav>
        )}
        titleRow={(
          <DocTitleRow
            title={`${data.estimate_number}`}
            subtitle={buyer ? `${buyer?.business_name} · ${buyer.bill_address} · ${buyer.place_of_supply}` : 'No buyer assigned.'}
            rightActions={(
              <>
                {showEdit ? (
                  <Button type="button" size="sm" className="gap-2" onClick={() => router.push(`/estimates/${id}/edit`)}>
                    <Edit2 className="h-4 w-4" />
                    Edit estimate
                  </Button>
                ) : null}
                {showConvert ? (
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setConvertOpen(true)}>
                    <ArrowRightCircle className="h-4 w-4" />
                    Convert to SO
                  </Button>
                ) : null}
                {showDuplicate ? (
                  <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={handleDuplicate} disabled={dupMut.isPending}>
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </Button>
                ) : null}
                {showVoid ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setVoidOpen(true)}
                    disabled={voidMut.isPending}
                  >
                    Void estimate
                  </Button>
                ) : null}
              </>
            )}
          />
        )}
        strip={(
          <DocStrip
            kind="estimate"
            readOnly
            docNumber={data.estimate_number}
            dateIssued={data.date_issued}
            validUntil={data.valid_until}
            buyerPoRef={data.buyer_po_ref}
            placeOfSupply={data.place_of_supply}
            placeOptions={[data.place_of_supply]}
            onDocNumberChange={noop}
            onDateIssuedChange={noop}
            onValidUntilChange={noop}
            onBuyerPoRefChange={noop}
            onPlaceOfSupplyChange={noop}
          />
        )}
        left={buyer
          ? (
              <BuyerCardFilled
                buyer={buyer}
                previewTotal={0}
                paymentTermsValue={paymentTermsLabel}
                readOnly
                onPaymentTermsChange={noop}
                onSwap={noop}
              />
            )
          : (
              <aside className="rounded-[14px] border border-dashed border-cream-400 bg-cream-50 p-4 text-[13px] text-cream-700">
                No buyer on this estimate.
              </aside>
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
            <TotalsCard totals={totals} previousTotals={null} creditWarning={creditWarning} isInterState={isInterState} lineCount={diffLines.length} />
            <InsightsCard buyer={buyer} expiringSoon={expiringSoon} readOnly />
          </div>
        )}
      />

      <ModalConvertEstimateToSO
        open={convertOpen}
        onOpenChange={setConvertOpen}
        estimateNumber={data.estimate_number}
        buyerName={buyer?.business_name ?? 'Buyer'}
        lines={data.items}
        isSubmitting={convertMut.isPending}
        onConfirm={handleConvert}
      />

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="max-w-[300px]">
          <DialogHeader>
            <DialogTitle>Void this estimate?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-[13px] text-cream-700">This cannot be undone. The estimate will be marked void.</p>
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
