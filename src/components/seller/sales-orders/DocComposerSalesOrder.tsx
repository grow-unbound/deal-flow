'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ClipboardList,
  PackageSearch,
  Loader2,
  Save,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { FeatureDisabledState } from '@/components/FeatureGate';
import { ComposerSidebarCard } from '@/components/seller/composer/ComposerLayout';
import {
  DocumentBasicsStrip,
  DocumentComposerFooterRow,
} from '@/components/seller/composer/DocumentBasicsStrip';
import {
  DocumentComposerLoadingSkeleton,
  DocumentComposerShell,
} from '@/components/seller/composer/DocumentComposerShell';
import {
  BuyerCardEmpty,
  BuyerCardFilled,
  BuyerCardLoading,
  DocumentMetaCard,
  LinesTable,
  TotalsCard,
  type EstimateComposerLineRow,
} from '@/components/seller/document-composer';
import { ResolvedPriceLookupCard } from '@/components/seller/pricing/ResolvedPriceLookupCard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DiscardChangesDialog, useDirtyCloseGuard } from '@/components/ui/form-overlay';
import { useAuth } from '@/contexts/AuthContext';
import { composerSubmitFooterLabel, useComposerLeaveGuard } from '@/hooks/useComposerLeaveGuard';
import { useDocumentBuyerPicker } from '@/hooks/useDocumentBuyerPicker';
import {
  useEstimateComposer,
  useEstimatePriceListOptions,
  useEstimateProductPricing,
  useEstimateProductSearch,
} from '@/hooks/useEstimates';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import {
  useBuyerSalesOrderContext,
  useDebouncedSalesOrderStockCheck,
  useNextSalesOrderNumber,
  useSalesOrderComposer,
  useSaveSalesOrderComposer,
} from '@/hooks/useSalesOrders';
import { apiPatch, apiPost } from '@/lib/api-fetch';
import { bumpSecondDateAfterFirst } from '@/lib/date-utils';
import {
  buildComposerStagedChanges,
  stagedSliceFromSalesOrder,
} from '@/lib/documents/composer-staged-changes';
import { computeLineTotal, computeTotals, defaultPaymentTerms } from '@/lib/documents/composer-math';
import { formatCompactInr } from '@/lib/utils';
import type {
  EstimateComposerBuyerContext,
  EstimateComposerProductSearchRow,
} from '@/types/estimate-composer';
import type {
  SalesOrderComposerBuyerContext,
  SalesOrderComposerDocument,
  SalesOrderComposerSavePayload,
} from '@/types/sales-order-composer';

const BASE_PRICING_OPTION = '__base__';

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function defaultExpectedDelivery() {
  const next = new Date();
  next.setDate(next.getDate() + 7);
  return next.toISOString().slice(0, 10);
}

function buildNewSalesOrderDraft(orderNumber = 'Reserving next number...'): SalesOrderComposerDocument {
  return {
    id: '',
    order_number: orderNumber,
    status: 'draft',
    buyer_id: null,
    location_id: null,
    available_locations: [],
    order_date: isoToday(),
    expected_delivery: defaultExpectedDelivery(),
    buyer_po_ref: '',
    place_of_supply: '',
    seller_note: '',
    freight: 0,
    discount_flat: 0,
    round_off: 0,
    has_backorder: false,
    estimate_id: null,
    source_estimate_number: null,
    buyer_context: null,
    items: [],
  };
}

function snapshotPayload(document: SalesOrderComposerDocument, lines: EstimateComposerLineRow[]) {
  return JSON.stringify({
    order_number: document.order_number,
    buyer_id: document.buyer_id,
    location_id: document.location_id,
    order_date: document.order_date,
    expected_delivery: document.expected_delivery,
    buyer_po_ref: document.buyer_po_ref,
    place_of_supply: document.place_of_supply,
    seller_note: document.seller_note,
    freight: document.freight,
    discount_flat: document.discount_flat,
    round_off: document.round_off,
    estimate_id: document.estimate_id,
    items: lines.map((line) => ({
      id: line.id,
      tenant_product_id: line.tenant_product_id,
      qty: line.qty,
      unit_price: line.unit_price,
      disc_pct: line.disc_pct,
      tax_pct: line.tax_pct,
      diff: line.diff,
    })),
  });
}

function mapDiffLines(current: EstimateComposerLineRow[], original: EstimateComposerLineRow[]) {
  const originalByKey = new Map(original.map((line) => [line.id, line]));
  return current.map((line) => {
    const originalLine = originalByKey.get(line.id);
    if (!originalLine) return { ...line, diff: 'added' as const };
    if (
      originalLine.qty !== line.qty
      || originalLine.unit_price !== line.unit_price
      || originalLine.disc_pct !== line.disc_pct
      || originalLine.tax_pct !== line.tax_pct
      || originalLine.on_hand !== line.on_hand
      || line.diff === 'removed'
    ) {
      return { ...line, diff: line.diff === 'removed' ? 'removed' as const : 'changed' as const };
    }
    return { ...line, diff: 'clean' as const };
  });
}

function toSavePayload(document: SalesOrderComposerDocument, lines: EstimateComposerLineRow[]): SalesOrderComposerSavePayload {
  return {
    order_number: document.order_number,
    buyer_id: document.buyer_id,
    location_id: document.location_id,
    order_date: document.order_date,
    expected_delivery: document.expected_delivery,
    buyer_po_ref: document.buyer_po_ref,
    place_of_supply: document.place_of_supply,
    seller_note: document.seller_note,
    freight: document.freight,
    discount_flat: document.discount_flat,
    round_off: document.round_off,
    estimate_id: document.estimate_id,
    items: lines
      .filter((line) => line.diff !== 'removed')
      .map((line) => ({
        id: line.id.startsWith('draft-line-') ? undefined : line.id,
        tenant_product_id: line.tenant_product_id,
        qty: line.qty,
        unit_price: line.unit_price,
        disc_pct: line.disc_pct,
        tax_pct: line.tax_pct,
        scheme_tag: line.scheme_tag,
      })),
  };
}

export function DocComposerSalesOrder({
  mode,
  orderId,
  fromEstimateId,
}: {
  mode: 'create' | 'edit';
  orderId?: string;
  fromEstimateId?: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const closeTarget = mode === 'edit' && orderId ? `/sales-orders/${orderId}` : '/sales-orders';
  const qc = useQueryClient();
  const { isLeavingRef, beginLeaving, resetLeaving, shouldBlockComposer, isSubmitting, submitAction } = useComposerLeaveGuard();
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const salesOrdersFlag = useFlagState('SALES_ORDERS');
  const { data: tenantSettings } = useTenantSettings();
  const gstInclusive = tenantSettings?.unified.business_policy.gst_inclusive ?? false;

  const [workingId, setWorkingId] = useState<string | null>(orderId ?? null);
  const { data, isLoading, isError, error } = useSalesOrderComposer(workingId);
  const nextOrderNumberQuery = useNextSalesOrderNumber(mode === 'create' && !orderId);
  const estimateForPrefill = useEstimateComposer(
    mode === 'create' && fromEstimateId && !orderId ? fromEstimateId : null,
  );

  const [documentState, setDocumentState] = useState<SalesOrderComposerDocument | null>(() => {
    if (mode === 'create' && !orderId && !fromEstimateId) return buildNewSalesOrderDraft();
    return null;
  });
  const [lineState, setLineState] = useState<EstimateComposerLineRow[]>([]);
  const [buyerQuery, setBuyerQuery] = useState('');
  const [buyerSearchOpen, setBuyerSearchOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [paymentTermsLabel, setPaymentTermsLabel] = useState('Not defined');
  const [autoSaveMeta, setAutoSaveMeta] = useState<{ label: string; tone: 'draft' | 'saved' | 'warning' }>({
    label: mode === 'create' ? 'Not saved yet' : 'Ready to save',
    tone: 'draft',
  });
  const [selectedPriceListId, setSelectedPriceListId] = useState<string | null>(null);
  const [backorderOpen, setBackorderOpen] = useState(false);
  const [pendingConfirmOrderId, setPendingConfirmOrderId] = useState<string | null>(null);
  const [notifyBuyer, setNotifyBuyer] = useState(true);

  const originalDocumentRef = useRef<SalesOrderComposerDocument | null>(null);
  const originalLinesRef = useRef<EstimateComposerLineRow[]>([]);
  const initializedForIdRef = useRef<string | null>(null);
  const prefilledFromEstimateRef = useRef(false);
  const lastAppliedPricingKeyRef = useRef<string | null>(null);
  const salesAgentPinnedRef = useRef<string | null>(null);

  const saveMutation = useSaveSalesOrderComposer(workingId);
  const buyerContextQuery = useBuyerSalesOrderContext(documentState?.buyer_id ?? null);
  const buyerPickerQuery = useDocumentBuyerPicker(buyerQuery, buyerSearchOpen);
  const priceListOptionsQuery = useEstimatePriceListOptions(Boolean(documentState));
  const productSearchQuery = useEstimateProductSearch(
    productQuery,
    documentState?.buyer_id ?? null,
    searchOpen,
    selectedPriceListId,
  );
  const pricingQuery = useEstimateProductPricing(
    documentState?.buyer_id ?? null,
    lineState.filter((line) => line.diff !== 'removed').map((line) => line.tenant_product_id),
    selectedPriceListId,
  );

  const prevEditOrderIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (mode !== 'edit' || !orderId) return;
    if (prevEditOrderIdRef.current === orderId) return;
    prevEditOrderIdRef.current = orderId;
    setWorkingId(orderId);
    initializedForIdRef.current = null;
    originalDocumentRef.current = null;
    originalLinesRef.current = [];
    prefilledFromEstimateRef.current = false;
    setDocumentState(null);
    setLineState([]);
    setBuyerQuery('');
    setBuyerSearchOpen(false);
    setProductQuery('');
    setSearchOpen(false);
    setAutoSaveMeta({ label: 'Ready to save', tone: 'draft' });
  }, [mode, orderId]);

  const diffLines = useMemo(() => mapDiffLines(lineState, originalLinesRef.current), [lineState]);
  const activeLines = useMemo(() => diffLines.filter((line) => line.diff !== 'removed'), [diffLines]);
  const stockCheckQuery = useDebouncedSalesOrderStockCheck(workingId, activeLines.length > 0);

  useEffect(() => {
    prefilledFromEstimateRef.current = false;
  }, [fromEstimateId]);

  useEffect(() => {
    if (mode !== 'create' || orderId || fromEstimateId || !nextOrderNumberQuery.data) return;
    setDocumentState((current) => current ? { ...current, order_number: nextOrderNumberQuery.data } : current);
  }, [fromEstimateId, mode, nextOrderNumberQuery.data, orderId]);

  useEffect(() => {
    if (mode !== 'create' || orderId || !fromEstimateId) return;
    if (prefilledFromEstimateRef.current) return;
    const est = estimateForPrefill.data;
    const orderNumber = nextOrderNumberQuery.data;
    if (!est || !orderNumber) return;

    prefilledFromEstimateRef.current = true;
    const mappedLines = (est.items ?? []).map((line) => ({
      ...line,
      diff: 'clean' as const,
      line_total: computeLineTotal(line, gstInclusive),
    }));
    const doc: SalesOrderComposerDocument = {
      id: '',
      order_number: orderNumber,
      status: 'draft',
      buyer_id: est.buyer_id,
      location_id: est.location_id ?? null,
      available_locations: est.available_locations ?? [],
      order_date: isoToday(),
      expected_delivery: defaultExpectedDelivery(),
      buyer_po_ref: est.buyer_po_ref ?? '',
      place_of_supply: est.place_of_supply,
      seller_note: est.seller_note ?? '',
      freight: est.freight,
      discount_flat: est.discount_flat,
      round_off: est.round_off,
      has_backorder: false,
      estimate_id: est.id,
      source_estimate_number: est.estimate_number,
      buyer_context: est.buyer_context as SalesOrderComposerBuyerContext | null,
      items: [],
    };
    setDocumentState(doc);
    setLineState(mappedLines);
    originalDocumentRef.current = doc;
    originalLinesRef.current = mappedLines;
    setPaymentTermsLabel(defaultPaymentTerms(est.buyer_context?.payment_terms_days ?? 0));
    setSelectedPriceListId(est.buyer_context?.active_pricelist?.id ?? null);
  }, [estimateForPrefill.data, fromEstimateId, mode, nextOrderNumberQuery.data, orderId]);

  useEffect(() => {
    if (mode !== 'create' || orderId || fromEstimateId || originalDocumentRef.current) return;
    if (!documentState) return;

    originalDocumentRef.current = documentState;
    originalLinesRef.current = [];
  }, [documentState, fromEstimateId, mode, orderId]);

  useEffect(() => {
    if (!data) return;
    if (initializedForIdRef.current === data.id) return;

    if (mode === 'edit') {
      salesAgentPinnedRef.current = data.buyer_context?.sales_agent_name ?? null;
    }

    setDocumentState(data);
    const mappedLines = (data.items ?? []).map((line) => ({
      ...line,
      diff: 'clean' as const,
      line_total: computeLineTotal(line, gstInclusive),
    }));
    setLineState(mappedLines);
    setPaymentTermsLabel(defaultPaymentTerms(data.buyer_context?.payment_terms_days ?? 0));
    setSelectedPriceListId(data.buyer_context?.active_pricelist?.id ?? null);
    originalDocumentRef.current = data;
    originalLinesRef.current = mappedLines;
    initializedForIdRef.current = data.id;
    setAutoSaveMeta({
      label: mode === 'create' ? 'Not saved yet' : 'Draft saved',
      tone: mode === 'create' ? 'draft' : 'saved',
    });
  }, [data, mode]);

  useEffect(() => {
    const nextContext = buyerContextQuery.data;
    if (!nextContext || !documentState) return;
    if (documentState.buyer_id !== nextContext.id) return;
    if (
      documentState.buyer_context?.id === nextContext.id
      && documentState.buyer_context?.credit_available === nextContext.credit_available
    ) {
      return;
    }

    setDocumentState((current) => current ? ({
      ...current,
      buyer_context: {
        ...nextContext,
        sales_agent_name:
          mode === 'edit'
            ? (salesAgentPinnedRef.current ?? nextContext.sales_agent_name)
            : (user?.displayName ?? nextContext.sales_agent_name),
      },
    }) : current);
    setPaymentTermsLabel(defaultPaymentTerms(nextContext.payment_terms_days));
    setSelectedPriceListId((current) => current ?? nextContext.active_pricelist?.id ?? null);
  }, [buyerContextQuery.data, documentState, mode, user?.displayName]);

  useEffect(() => {
    if (!pricingQuery.data || lineState.length === 0) return;

    const pricingKey = `${documentState?.buyer_id ?? ''}:${selectedPriceListId ?? BASE_PRICING_OPTION}:${Object.entries(pricingQuery.data)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, price]) => `${id}:${price}`)
      .join('|')}`;

    if (lastAppliedPricingKeyRef.current === pricingKey) return;

    setLineState((current) =>
      current.map((line) => {
        if (line.diff === 'removed') return line;
        const nextPrice = pricingQuery.data[line.tenant_product_id];
        if (nextPrice == null || nextPrice === line.unit_price) return line;
        const next = { ...line, unit_price: nextPrice };
        return { ...next, line_total: computeLineTotal(next, gstInclusive) };
      }),
    );
    lastAppliedPricingKeyRef.current = pricingKey;
  }, [documentState?.buyer_id, lineState.length, pricingQuery.data, selectedPriceListId]);

  useEffect(() => {
    if (!stockCheckQuery.data?.length) return;
    setLineState((current) => current.map((line) => {
      const match = stockCheckQuery.data?.find((row) => row.line_id === line.id);
      return match ? { ...line, on_hand: match.on_hand } : line;
    }));
  }, [stockCheckQuery.data]);

  const totals = useMemo(
    () => computeTotals(diffLines, documentState?.discount_flat ?? 0, documentState?.freight ?? 0, documentState?.round_off ?? 0, gstInclusive),
    [diffLines, documentState?.discount_flat, documentState?.freight, documentState?.round_off, gstInclusive],
  );
  const dirty = useMemo(() => {
    if (!documentState) return false;
    return snapshotPayload(documentState, diffLines) !== snapshotPayload(originalDocumentRef.current ?? documentState, originalLinesRef.current);
  }, [diffLines, documentState]);
  const originalTotalsSnapshot = useMemo(
    () => {
      if (!originalDocumentRef.current) return null;
      return computeTotals(
        originalLinesRef.current,
        originalDocumentRef.current.discount_flat,
        originalDocumentRef.current.freight,
        originalDocumentRef.current.round_off,
        gstInclusive,
      );
    },
    [documentState?.id, gstInclusive],
  );
  const stagedChangesRows = useMemo(() => {
    if (!documentState) return undefined;
    const orig = originalDocumentRef.current;
    const origTotals = originalTotalsSnapshot;
    if (!orig || !origTotals) return undefined;
    return buildComposerStagedChanges({
      mode,
      dirty,
      originalDoc: stagedSliceFromSalesOrder(orig),
      currentDoc: stagedSliceFromSalesOrder(documentState),
      diffLines,
      originalTotals: origTotals,
      currentTotals: totals,
    });
  }, [mode, dirty, documentState, diffLines, totals, originalTotalsSnapshot]);
  const activeProductIds = useMemo(
    () => new Set(diffLines.filter((line) => line.diff !== 'removed').map((line) => line.tenant_product_id)),
    [diffLines],
  );
  const filteredProductSearchResults = useMemo(
    () => (productSearchQuery.data ?? []).filter((row) => !activeProductIds.has(row.tenant_product_id)),
    [productSearchQuery.data, activeProductIds],
  );
  const dirtyGuard = useDirtyCloseGuard({
    isDirty: dirty,
    onConfirmClose: () => router.push(closeTarget),
  });

  useEffect(() => {
    setAutoSaveMeta(dirty
      ? { label: 'Unsaved changes', tone: 'warning' }
      : { label: workingId ? 'Saved changes' : 'Not saved yet', tone: dirty ? 'warning' : 'saved' });
  }, [dirty, workingId]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!documentState || mode !== 'edit') return;
    if (!['dispatched', 'delivered', 'cancelled', 'partially_dispatched', 'invoiced', 'partially_invoiced'].includes(documentState.status)) {
      return;
    }
    toast.error("Can't edit after dispatch.");
    router.replace(`/sales-orders/${documentState.id}`);
  }, [documentState, mode, router]);

  async function createDraftOnDemand(): Promise<SalesOrderComposerDocument> {
    if (workingId && data) {
      return data;
    }

    const res = await apiPost('/api/tenant/orders', {});
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Failed to create sales order draft');
    }
    const json = (await res.json()) as { data: SalesOrderComposerDocument };
    qc.setQueryData(['tenant-sales-order-composer', json.data.id], json.data);
    if (!isLeavingRef.current) {
      setWorkingId(json.data.id);
    }
    return json.data;
  }

  async function saveDocumentNow(
    nextDocument: SalesOrderComposerDocument,
    nextLines: EstimateComposerLineRow[],
  ): Promise<SalesOrderComposerDocument> {
    const created = !workingId ? await createDraftOnDemand() : null;
    const targetId = workingId ?? created?.id ?? null;
    if (!targetId) throw new Error('Missing sales order id');

    const payload = toSavePayload({
      ...nextDocument,
      id: targetId,
      order_number: created?.order_number ?? nextDocument.order_number,
    }, nextLines);

    if (workingId) {
      return new Promise<SalesOrderComposerDocument>((resolve, reject) => {
        saveMutation.mutate(payload, {
          onSuccess: ({ data: saved }) => resolve(saved),
          onError: (mutationError) => reject(mutationError),
        });
      });
    }

    const res = await apiPatch(`/api/tenant/orders/${targetId}`, payload);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Failed to save sales order');
    }
    const json = (await res.json()) as { data: SalesOrderComposerDocument };
    void qc.invalidateQueries({ queryKey: ['tenant-orders'] });
    return json.data;
  }

  async function runConfirm(orderIdForConfirm: string, hasBackorder: boolean) {
    if (!isLeavingRef.current) {
      beginLeaving('confirm');
    }
    try {
      const res = await apiPatch(`/api/tenant/orders/${orderIdForConfirm}/confirm`, {
        has_backorder: hasBackorder,
        notify_buyer: notifyBuyer,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to confirm sales order');
      }
      const json = (await res.json()) as { data: { id: string; redirect_path: string } };
      setBackorderOpen(false);
      void qc.invalidateQueries({ queryKey: ['tenant-sales-order-composer', orderIdForConfirm] });
      void qc.invalidateQueries({ queryKey: ['tenant-orders'] });
      router.push(json.data.redirect_path);
    } catch (mutationError) {
      resetLeaving();
      throw mutationError;
    }
  }

  if (orderManagement === false || salesOrdersFlag === false) {
    return <FeatureDisabledState />;
  }

  if (mode === 'create' && fromEstimateId && !orderId && estimateForPrefill.isError) {
    return (
      <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6">
        <p className="text-base text-danger-700">
          {estimateForPrefill.error instanceof Error
            ? estimateForPrefill.error.message
            : 'Could not load estimate to pre-fill this order.'}
        </p>
      </div>
    );
  }

  const waitingPrefill = mode === 'create' && Boolean(fromEstimateId) && !orderId
    && (estimateForPrefill.isLoading || !documentState);

  if (waitingPrefill || shouldBlockComposer(workingId, isLoading, Boolean(documentState))) {
    return <DocumentComposerLoadingSkeleton />;
  }

  if (isError) {
    return (
      <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6">
        <p className="text-base text-danger-700">{error instanceof Error ? error.message : 'Failed to load sales order composer.'}</p>
      </div>
    );
  }

  if (!documentState) {
    return <DocumentComposerLoadingSkeleton />;
  }

  const buyer = documentState.buyer_context ?? buyerContextQuery.data ?? null;
  const shortLines = activeLines.filter((line) => line.qty > line.on_hand);
  const previousShortLines = stockCheckQuery.data?.filter((row) => row.is_short) ?? [];
  const effectiveShortLines = previousShortLines.length > 0 ? previousShortLines : shortLines.map((line) => ({
    line_id: line.id,
    sku: line.sku,
    product_name: line.product_name,
    on_hand: line.on_hand,
    qty: line.qty,
    is_short: line.qty > line.on_hand,
    shortfall: Math.max(line.qty - line.on_hand, 0),
  }));
  const isConfirmedEdit = mode === 'edit' && documentState.status === 'confirmed';
  const modeChip = isConfirmedEdit ? 'Editing · confirmed' : mode === 'edit' ? 'Editing · received' : 'Draft';
  const title = mode === 'edit' ? 'Edit sales order' : 'New sales order';
  const subtitle = documentState.source_estimate_number
    ? `Pre-filled from ${documentState.source_estimate_number} — verify stock before confirming.`
    : buyer
      ? `For ${buyer.business_name}`
      : 'Pick a buyer to begin composing this sales order.';
  const primaryDisabled = !documentState.buyer_id || activeLines.length === 0;
  const warningText = effectiveShortLines.length > 0
    ? `${effectiveShortLines.length} line(s) over stock. ${effectiveShortLines[0]?.product_name ?? 'Line item'} — ordered ${effectiveShortLines[0]?.qty ?? 0}, only ${effectiveShortLines[0]?.on_hand ?? 0} on hand.`
    : null;
  const isInterState = Boolean(
    buyer?.seller_state
    && buyer?.place_of_supply
    && buyer.seller_state.toLowerCase() !== buyer.place_of_supply.toLowerCase(),
  );

  function setDocumentPatch(patch: Partial<SalesOrderComposerDocument>) {
    setDocumentState((current) => current ? { ...current, ...patch } : current);
  }

  function handleSelectBuyer(buyerId: string) {
    setSelectedPriceListId(null);
    setDocumentPatch({
      buyer_id: buyerId,
      buyer_context: null,
    });
    setBuyerQuery('');
    setProductQuery('');
    setSearchOpen(false);
    setBuyerSearchOpen(false);
  }

  function handleAddProduct(product: EstimateComposerProductSearchRow) {
    setLineState((current) => [
      ...current,
      {
        id: `draft-line-${Date.now()}-${product.tenant_product_id}`,
        tenant_product_id: product.tenant_product_id,
        product_name: product.product_name,
        sku: product.sku,
        brand_name: product.brand_name,
        brand_initials: product.brand_initials,
        brand_hue: product.brand_hue,
        hsn_code: product.hsn_code,
        on_hand: product.on_hand,
        qty: 1,
        unit_price: product.unit_price,
        mrp: product.mrp,
        base_selling_price: product.base_selling_price,
        disc_pct: 0,
        tax_pct: product.tax_pct ?? 0,
        line_total: computeLineTotal({ qty: 1, unit_price: product.unit_price, disc_pct: 0, tax_pct: product.tax_pct ?? 0 }, gstInclusive),
        scheme_tag: null,
        diff: 'added',
      },
    ]);
  }

  function handleLineChange(lineId: string, patch: Partial<EstimateComposerLineRow>) {
    setLineState((current) =>
      current.map((line) => {
        if (line.id !== lineId) return line;
        const next = { ...line, ...patch };
        return {
          ...next,
          line_total: computeLineTotal(next),
        };
      }),
    );
  }

  function handleRemoveLine(lineId: string) {
    setLineState((current) =>
      current
        .map((line) => (line.id === lineId ? { ...line, diff: 'removed' as const } : line))
        .filter((line) => !(line.id === lineId && line.id.startsWith('draft-line-'))),
    );
  }

  function handleResetOverrides() {
    setLineState((current) =>
      current.map((line) => {
        if (line.diff === 'removed') return line;
        const original = originalLinesRef.current.find((item) => item.id === line.id);
        const nextUnitPrice = original?.unit_price ?? pricingQuery.data?.[line.tenant_product_id] ?? line.unit_price;
        const nextDiscPct = original?.disc_pct ?? 0;
        const nextTaxPct = original?.tax_pct ?? line.tax_pct;
        const next = {
          ...line,
          unit_price: nextUnitPrice,
          disc_pct: nextDiscPct,
          tax_pct: nextTaxPct,
        };
        return {
          ...next,
          line_total: computeLineTotal(next),
        };
      }),
    );
  }

  function handleDiscard() {
    dirtyGuard.handleOpenChange(false);
  }

  async function handleSaveAndClose() {
    if (!documentState || isLeavingRef.current) return;
    beginLeaving('save');
    try {
      const saved = await saveDocumentNow(documentState, diffLines);
      router.push(`/sales-orders/${saved.id}`);
    } catch (mutationError) {
      resetLeaving();
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save sales order');
    }
  }

  async function handleConfirmClick() {
    if (!documentState || isLeavingRef.current) return;

    const linesShort = (lines: EstimateComposerLineRow[]) =>
      lines.filter((line) => line.diff !== 'removed' && line.qty > line.on_hand);

    beginLeaving('confirm');
    try {
      let doc = documentState;
      let lines = diffLines;
      if (dirty || !workingId) {
        doc = await saveDocumentNow(documentState, diffLines);
        const savedLines = doc.items.map((line) => ({
          ...line,
          diff: 'clean' as const,
          line_total: computeLineTotal(line, gstInclusive),
        }));
        setDocumentState(doc);
        setLineState(savedLines);
        originalDocumentRef.current = doc;
        originalLinesRef.current = savedLines;
        if (!isLeavingRef.current) {
          setWorkingId(doc.id);
        }
        lines = savedLines;
      }

      const clientShort = linesShort(lines);
      const serverShort = stockCheckQuery.data?.filter((row) => row.is_short) ?? [];
      const hasShort = serverShort.length > 0 || clientShort.length > 0;

      if (hasShort) {
        resetLeaving();
        setPendingConfirmOrderId(doc.id);
        setBackorderOpen(true);
        return;
      }

      await runConfirm(doc.id, false);
    } catch (mutationError) {
      resetLeaving();
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to confirm order');
    }
  }

  const footerLabel = composerSubmitFooterLabel(submitAction)
    ?? (effectiveShortLines.length > 0 ? 'Resolve the stock warning before confirming' : autoSaveMeta.label);
  const footerTone = submitAction ? 'pending' as const : effectiveShortLines.length > 0 ? 'warning' as const : autoSaveMeta.tone;
  const confirmPrimaryLabel = effectiveShortLines.length > 0 ? 'Confirm with backorder' : 'Confirm order';

  return (
    <>
      <DocumentComposerShell
        mode={isConfirmedEdit ? 'edit' : 'create'}
        kind="so"
        breadcrumbItems={[
          { label: 'Sales' },
          { label: 'Sales orders', href: '/sales-orders' },
          {
            label: mode === 'edit' ? documentState.order_number : 'New sales order',
            current: true,
          },
        ]}
        title={title}
        subtitle={subtitle}
        status={{ label: modeChip, tone: mode === 'edit' ? 'live' : 'draft' }}
        titleActions={(
          <>
            <Button type="button" variant="ghost" className="gap-2" disabled={isSubmitting} onClick={() => dirtyGuard.handleOpenChange(false)}>
              <X className="h-3.5 w-3.5" />
              Close
            </Button>
          </>
        )}
        basics={(
          <DocumentBasicsStrip
            kind="so"
            docNumber={documentState.order_number}
            locationId={documentState.location_id}
            availableLocations={documentState.available_locations}
            dateIssued={documentState.order_date}
            secondDate={documentState.expected_delivery}
            buyerPoRef={documentState.buyer_po_ref}
            locationReadOnly={documentState.available_locations.length <= 1 || isConfirmedEdit}
            onDateIssuedChange={(value) => {
              setDocumentState((current) => {
                if (!current) return current;
                const bumped = bumpSecondDateAfterFirst(value, current.expected_delivery);
                return bumped
                  ? { ...current, order_date: value, expected_delivery: bumped }
                  : { ...current, order_date: value };
              });
            }}
            onSecondDateChange={(value) => setDocumentPatch({ expected_delivery: value })}
            onBuyerPoRefChange={(value) => setDocumentPatch({ buyer_po_ref: value })}
            onLocationChange={(value) => setDocumentPatch({ location_id: value })}
          />
        )}
        left={(
          <ComposerSidebarCard>
            <div className="space-y-4">
              {documentState.buyer_id && buyerContextQuery.isLoading && !buyer ? (
                <BuyerCardLoading />
              ) : buyer ? (
                <BuyerCardFilled
                  buyer={buyer as EstimateComposerBuyerContext}
                  previewTotal={totals.grand_total}
                  paymentTermsValue={paymentTermsLabel}
                  readOnly={isConfirmedEdit}
                  onPaymentTermsChange={setPaymentTermsLabel}
                  priceListOptions={priceListOptionsQuery.data ?? []}
                  selectedPriceListId={selectedPriceListId}
                  onPriceListChange={isConfirmedEdit ? undefined : setSelectedPriceListId}
                  onChangeBuyer={() => {
                    if (isConfirmedEdit) return;
                    setSelectedPriceListId(null);
                    setDocumentPatch({ buyer_id: null, buyer_context: null });
                  }}
                />
              ) : (
                <BuyerCardEmpty
                  query={buyerQuery}
                  results={buyerPickerQuery.data ?? []}
                  searchOpen={buyerSearchOpen}
                  searchLoading={buyerPickerQuery.isLoading}
                  onQueryChange={setBuyerQuery}
                  onSearchOpenChange={setBuyerSearchOpen}
                  onSelectBuyer={handleSelectBuyer}
                />
              )}
              <DocumentMetaCard
                readOnly={isConfirmedEdit}
                placeOfSupplyValue={documentState.place_of_supply}
                notesValue={documentState.seller_note}
                freightValue={documentState.freight}
                onPlaceOfSupplyChange={(value) => setDocumentPatch({ place_of_supply: value })}
                onNotesChange={(value) => setDocumentPatch({ seller_note: value })}
                onFreightChange={(value) => setDocumentPatch({ freight: value })}
              />
            </div>
          </ComposerSidebarCard>
        )}
        center={(
          <LinesTable
            kind="so"
            buyerSelected={Boolean(documentState.buyer_id)}
            readOnly={false}
            lines={diffLines}
            productQuery={productQuery}
            productResults={filteredProductSearchResults}
            searchOpen={searchOpen}
            notesExpanded={false}
            freightExpanded={false}
            internalExpanded={false}
            singleNoteMode
            title="Sales order lines"
            description="Search by product, SKU, or brand. Pricelist pricing is applied automatically."
            showNotesControls={false}
            showFreightControls={false}
            notesValue={documentState.seller_note}
            freightValue={String(documentState.freight || '')}
            internalValue=""
            onProductQueryChange={setProductQuery}
            onSearchOpenChange={setSearchOpen}
            onAddProduct={handleAddProduct}
            onResetOverrides={handleResetOverrides}
            resetEnabled={mode === 'edit' || dirty}
            onLineChange={handleLineChange}
            onRemoveLine={handleRemoveLine}
            onNotesValueChange={(value) => setDocumentPatch({ seller_note: value })}
            onFreightValueChange={(value) => setDocumentPatch({ freight: Number(value || 0) })}
            onInternalValueChange={(value) => setDocumentPatch({ seller_note: value })}
            onToggleNotes={() => {}}
            onToggleFreight={() => {}}
            onToggleInternal={() => {}}
          />
        )}
        right={(
          <div className="space-y-4">
            <TotalsCard
              totals={totals}
              previousTotals={null}
              creditWarning={warningText ? `Stock warning. ${warningText}` : null}
              isInterState={isInterState}
              lineCount={activeLines.length}
              stagedChanges={stagedChangesRows}
            />
            <ResolvedPriceLookupCard
              buyerId={documentState.buyer_id}
              productOptions={activeLines.map((line) => ({
                id: line.tenant_product_id,
                label: line.product_name,
                meta: `${line.sku} · Qty ${line.qty}`,
              }))}
              title="Resolved price check"
              description="Verify the buyer's resolved price while you build the order."
            />
          </div>
        )}
        footer={(
          <DocumentComposerFooterRow autoSaveLabel={footerLabel} autoSaveTone={footerTone}>
            <Button type="button" variant="ghost" className="gap-2" disabled={isSubmitting} onClick={handleDiscard}>
              <Trash2 className="h-4 w-4" />
              Discard draft
            </Button>
            <Button
              type="button"
              variant="accent"
              className="gap-2"
              disabled={isSubmitting && submitAction !== 'save'}
              onClick={() => void handleSaveAndClose()}
            >
              {submitAction === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {submitAction === 'save' ? 'Saving…' : 'Save & close'}
            </Button>
            <Button
              type="button"
              variant={effectiveShortLines.length > 0 ? 'secondary' : 'primary'}
              className={effectiveShortLines.length > 0 ? 'gap-2 border-amber-500 text-amber-700 hover:bg-amber-50' : primaryDisabled && submitAction !== 'confirm' ? 'btn-disabled gap-2' : 'gap-2'}
              disabled={(primaryDisabled || isSubmitting) && submitAction !== 'confirm'}
              onClick={() => void handleConfirmClick()}
            >
              {submitAction === 'confirm' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : effectiveShortLines.length > 0 ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Truck className="h-4 w-4" />
              )}
              {submitAction === 'confirm' ? 'Confirming…' : confirmPrimaryLabel}
            </Button>
          </DocumentComposerFooterRow>
        )}
      />

      <DiscardChangesDialog
        open={dirtyGuard.discardOpen}
        onOpenChange={dirtyGuard.setDiscardOpen}
        onDiscard={dirtyGuard.confirmDiscard}
      />

      <Dialog open={backorderOpen} onOpenChange={(open) => {
        setBackorderOpen(open);
        if (!open) setPendingConfirmOrderId(null);
      }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Confirm with backorder</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              {effectiveShortLines.map((line) => (
                <div key={line.line_id} className="rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                  <p className="font-medium text-amber-900">{line.product_name}</p>
                  <p className="mt-1">
                    Ordered {line.qty}, only {line.on_hand} on hand. Backorder {line.shortfall}.
                  </p>
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm text-cream-800">
                <input type="checkbox" checked={notifyBuyer} onChange={(event) => setNotifyBuyer(event.target.checked)} className="accent-teal-500" />
                Notify buyer of backorder
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => setBackorderOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="gap-2 border-amber-500 text-amber-700 hover:bg-amber-50"
              disabled={!pendingConfirmOrderId || isSubmitting}
              onClick={() => {
                if (!pendingConfirmOrderId || isLeavingRef.current) return;
                void runConfirm(pendingConfirmOrderId, true);
              }}
            >
              {submitAction === 'confirm' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              {submitAction === 'confirm' ? 'Confirming…' : 'Confirm anyway'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { DocumentComposerLoadingSkeleton as SalesOrderComposerLoadingSkeleton } from '@/components/seller/composer/DocumentComposerShell';
