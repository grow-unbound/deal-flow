'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ClipboardList,
  PackageSearch,
  Save,
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
  InsightsCard,
  LinesTable,
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
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/useDebounce';
import { useEstimateComposer } from '@/hooks/useEstimates';
import { useFlagState } from '@/hooks/useFeatureFlag';
import {
  useBuyerSalesOrderContext,
  useDebouncedSalesOrderStockCheck,
  useNextSalesOrderNumber,
  useSalesOrderComposer,
  useSalesOrderProductSearch,
  useSaveSalesOrderComposer,
} from '@/hooks/useSalesOrders';
import { apiPatch, apiPost } from '@/lib/api-fetch';
import { computeLineTotal, computeTotals, defaultPaymentTerms } from '@/lib/documents/composer-math';
import { formatCompactInr } from '@/lib/utils';
import type { Database } from '@/types/database';
import type {
  SalesOrderComposerBuyerContext,
  SalesOrderComposerDocument,
  SalesOrderComposerProductSearchRow,
  SalesOrderComposerSavePayload,
} from '@/types/sales-order-composer';

type BuyerPickerRow = Pick<
  SalesOrderComposerBuyerContext,
  'id' | 'business_name' | 'place_of_supply' | 'credit_used'
>;

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
    order_date: isoToday(),
    expected_delivery: defaultExpectedDelivery(),
    buyer_po_ref: '',
    place_of_supply: 'Unknown',
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

function useBuyerPicker(query: string) {
  const debounced = useDebounce(query, 200);

  return useQuery({
    queryKey: ['sales-order-buyer-picker', debounced],
    queryFn: async (): Promise<BuyerPickerRow[]> => {
      const supabase = createClientComponentClient<Database>();
      const { data, error } = await (supabase as typeof supabase & { schema: (schema: string) => typeof supabase })
        .schema('app')
        .from('buyers')
        .select('id, business_name, geography, credit_limit')
        .eq('is_active', true)
        .limit(12);

      if (error) throw error;

      return ((data ?? []) as Array<{ id: string; business_name: string; geography: Record<string, unknown> | null; credit_limit: number | null }>)
        .filter((row) => {
          if (!debounced.trim()) return true;
          return row.business_name.toLowerCase().includes(debounced.toLowerCase());
        })
        .map((row) => ({
          id: row.id,
          business_name: row.business_name,
          place_of_supply: typeof row.geography?.state === 'string' ? row.geography.state : 'Unknown',
          credit_used: Number(row.credit_limit ?? 0),
        }));
    },
    staleTime: 30_000,
  });
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
  const qc = useQueryClient();
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const salesOrdersFlag = useFlagState('SALES_ORDERS');

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
  const [paymentTermsLabel, setPaymentTermsLabel] = useState('Due on receipt');
  const [autoSaveMeta, setAutoSaveMeta] = useState<{ label: string; tone: 'draft' | 'saved' | 'warning' }>({
    label: mode === 'create' ? 'Not saved yet' : 'Ready to save',
    tone: 'draft',
  });
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [freightExpanded, setFreightExpanded] = useState(false);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [backorderOpen, setBackorderOpen] = useState(false);
  const [pendingConfirmOrderId, setPendingConfirmOrderId] = useState<string | null>(null);
  const [notifyBuyer, setNotifyBuyer] = useState(true);
  const [confirmPending, setConfirmPending] = useState(false);

  const originalDocumentRef = useRef<SalesOrderComposerDocument | null>(null);
  const originalLinesRef = useRef<EstimateComposerLineRow[]>([]);
  const initializedForIdRef = useRef<string | null>(null);
  const prefilledFromEstimateRef = useRef(false);

  const saveMutation = useSaveSalesOrderComposer(workingId);
  const buyerContextQuery = useBuyerSalesOrderContext(documentState?.buyer_id ?? null);
  const productSearchQuery = useSalesOrderProductSearch(productQuery, documentState?.buyer_id ?? null);
  const buyerPickerQuery = useBuyerPicker(buyerQuery);

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
      line_total: computeLineTotal(line),
    }));
    const doc: SalesOrderComposerDocument = {
      id: '',
      order_number: orderNumber,
      status: 'draft',
      buyer_id: est.buyer_id,
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

    setDocumentState(data);
    const mappedLines = (data.items ?? []).map((line) => ({
      ...line,
      diff: 'clean' as const,
      line_total: computeLineTotal(line),
    }));
    setLineState(mappedLines);
    setPaymentTermsLabel(defaultPaymentTerms(data.buyer_context?.payment_terms_days ?? 0));
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
      && documentState.place_of_supply === nextContext.place_of_supply
    ) {
      return;
    }

    setDocumentState((current) => current ? ({
      ...current,
      place_of_supply: nextContext.place_of_supply,
      buyer_context: nextContext,
    }) : current);
    setPaymentTermsLabel(defaultPaymentTerms(nextContext.payment_terms_days));
  }, [buyerContextQuery.data, documentState]);

  useEffect(() => {
    if (!stockCheckQuery.data?.length) return;
    setLineState((current) => current.map((line) => {
      const match = stockCheckQuery.data?.find((row) => row.line_id === line.id);
      return match ? { ...line, on_hand: match.on_hand } : line;
    }));
  }, [stockCheckQuery.data]);

  const totals = useMemo(
    () => computeTotals(diffLines, documentState?.discount_flat ?? 0, documentState?.freight ?? 0, documentState?.round_off ?? 0),
    [diffLines, documentState?.discount_flat, documentState?.freight, documentState?.round_off],
  );
  const previousTotals = useMemo(() => {
    if (!originalDocumentRef.current) return null;
    return computeTotals(
      originalLinesRef.current,
      originalDocumentRef.current.discount_flat,
      originalDocumentRef.current.freight,
      originalDocumentRef.current.round_off,
    );
  }, [documentState?.id]);

  const dirty = useMemo(() => {
    if (!documentState) return false;
    return snapshotPayload(documentState, diffLines) !== snapshotPayload(originalDocumentRef.current ?? documentState, originalLinesRef.current);
  }, [diffLines, documentState]);

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
    setWorkingId(json.data.id);
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
    setConfirmPending(true);
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
    } finally {
      setConfirmPending(false);
    }
  }

  if (orderManagement === false || salesOrdersFlag === false) {
    return <FeatureDisabledState />;
  }

  if (mode === 'create' && fromEstimateId && !orderId && estimateForPrefill.isError) {
    return (
      <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6">
        <p className="text-[13px] text-danger-700">
          {estimateForPrefill.error instanceof Error
            ? estimateForPrefill.error.message
            : 'Could not load estimate to pre-fill this order.'}
        </p>
      </div>
    );
  }

  const waitingPrefill = mode === 'create' && Boolean(fromEstimateId) && !orderId
    && (estimateForPrefill.isLoading || !documentState);

  if (waitingPrefill || (workingId && isLoading) || !documentState) {
    return <DocumentComposerLoadingSkeleton />;
  }

  if (isError) {
    return (
      <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6">
        <p className="text-[13px] text-danger-700">{error instanceof Error ? error.message : 'Failed to load sales order composer.'}</p>
      </div>
    );
  }

  const recentBuyers = buyerPickerQuery.data ?? [];
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
  const primaryDisabled = !documentState.buyer_id || activeLines.length === 0 || confirmPending;
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
    setDocumentPatch({
      buyer_id: buyerId,
      buyer_context: null,
      place_of_supply: 'Unknown',
    });
    setBuyerQuery('');
    setProductQuery('');
    setSearchOpen(false);
    setBuyerSearchOpen(false);
  }

  function handleAddProduct(product: SalesOrderComposerProductSearchRow) {
    setLineState((current) => {
      const existing = current.find((line) => line.tenant_product_id === product.tenant_product_id && line.diff !== 'removed');
      if (existing) {
        return current.map((line) =>
          line.id === existing.id
            ? {
                ...line,
                qty: line.qty + 1,
                line_total: computeLineTotal({ ...line, qty: line.qty + 1 }),
              }
            : line,
        );
      }

      return [
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
          disc_pct: 0,
          tax_pct: product.tax_pct ?? 0,
          line_total: computeLineTotal({ qty: 1, unit_price: product.unit_price, disc_pct: 0, tax_pct: product.tax_pct ?? 0 }),
          scheme_tag: null,
          diff: 'added',
        },
      ];
    });
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

  function handleDiscard() {
    router.push('/sales-orders');
  }

  async function handleSaveAndClose() {
    if (!documentState) return;
    try {
      const saved = await saveDocumentNow(documentState, diffLines);
      originalDocumentRef.current = saved;
      originalLinesRef.current = saved.items.map((line) => ({
        ...line,
        diff: 'clean' as const,
        line_total: computeLineTotal(line),
      }));
      setDocumentState(saved);
      setLineState(originalLinesRef.current);
      setWorkingId(saved.id);
      setAutoSaveMeta({ label: 'Draft saved just now', tone: 'saved' });
      router.push('/sales-orders');
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save sales order');
    }
  }

  async function handleConfirmClick() {
    if (!documentState) return;

    const linesShort = (lines: EstimateComposerLineRow[]) =>
      lines.filter((line) => line.diff !== 'removed' && line.qty > line.on_hand);

    try {
      let doc = documentState;
      let lines = diffLines;
      if (dirty || !workingId) {
        doc = await saveDocumentNow(documentState, diffLines);
        const savedLines = doc.items.map((line) => ({
          ...line,
          diff: 'clean' as const,
          line_total: computeLineTotal(line),
        }));
        setDocumentState(doc);
        setLineState(savedLines);
        originalDocumentRef.current = doc;
        originalLinesRef.current = savedLines;
        setWorkingId(doc.id);
        lines = savedLines;
      }

      const clientShort = linesShort(lines);
      const serverShort = stockCheckQuery.data?.filter((row) => row.is_short) ?? [];
      const hasShort = serverShort.length > 0 || clientShort.length > 0;

      if (hasShort) {
        setPendingConfirmOrderId(doc.id);
        setBackorderOpen(true);
        return;
      }

      await runConfirm(doc.id, false);
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to confirm order');
    }
  }

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
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => toast.message('Stock report coming soon')}>
              <PackageSearch className="h-4 w-4" />
              Stock report
            </Button>
            <Button type="button" variant="ghost" className="gap-2" onClick={() => router.push('/sales-orders')}>
              <X className="h-3.5 w-3.5" />
              Close
            </Button>
          </>
        )}
        basics={(
          <DocumentBasicsStrip
            kind="so"
            docNumber={documentState.order_number}
            dateIssued={documentState.order_date}
            secondDate={documentState.expected_delivery}
            buyerPoRef={documentState.buyer_po_ref}
            placeOfSupply={documentState.place_of_supply}
            onDateIssuedChange={(value) => setDocumentPatch({ order_date: value })}
            onSecondDateChange={(value) => setDocumentPatch({ expected_delivery: value })}
            onBuyerPoRefChange={(value) => setDocumentPatch({ buyer_po_ref: value })}
            onPlaceOfSupplyChange={(value) => setDocumentPatch({ place_of_supply: value })}
          />
        )}
        left={(
          <ComposerSidebarCard>
            {buyer ? (
              <BuyerCardFilled
                buyer={buyer}
                previewTotal={totals.grand_total}
                paymentTermsValue={paymentTermsLabel}
                readOnly={isConfirmedEdit}
                onPaymentTermsChange={setPaymentTermsLabel}
                onSwap={() => setDocumentPatch({ buyer_id: null, buyer_context: null })}
              />
            ) : (
              <BuyerCardEmpty
                query={buyerQuery}
                recentBuyers={recentBuyers}
                searchOpen={buyerSearchOpen}
                searchLoading={buyerPickerQuery.isLoading}
                onQueryChange={setBuyerQuery}
                onSearchOpenChange={setBuyerSearchOpen}
                onSelectBuyer={handleSelectBuyer}
              />
            )}
          </ComposerSidebarCard>
        )}
        center={(
          <LinesTable
            kind="so"
            buyerSelected={Boolean(documentState.buyer_id)}
            readOnly={false}
            lines={diffLines}
            productQuery={productQuery}
            productResults={productSearchQuery.data ?? []}
            searchOpen={searchOpen}
            notesExpanded={notesExpanded}
            freightExpanded={freightExpanded}
            internalExpanded={internalExpanded}
            singleNoteMode
            notesValue={documentState.seller_note}
            freightValue={String(documentState.freight || '')}
            internalValue=""
            onProductQueryChange={setProductQuery}
            onSearchOpenChange={setSearchOpen}
            onAddProduct={handleAddProduct}
            onLineChange={handleLineChange}
            onRemoveLine={handleRemoveLine}
            onNotesValueChange={(value) => setDocumentPatch({ seller_note: value })}
            onFreightValueChange={(value) => setDocumentPatch({ freight: Number(value || 0) })}
            onInternalValueChange={(value) => setDocumentPatch({ seller_note: value })}
            onToggleNotes={() => setNotesExpanded((current) => !current)}
            onToggleFreight={() => setFreightExpanded((current) => !current)}
            onToggleInternal={() => setInternalExpanded((current) => !current)}
          />
        )}
        right={(
          <div className="space-y-4">
            <TotalsCard
              totals={totals}
              previousTotals={mode === 'edit' ? previousTotals : null}
              creditWarning={warningText ? `Stock warning. ${warningText}` : null}
              isInterState={isInterState}
              lineCount={activeLines.length}
            />
            <InsightsCard buyer={buyer} expiringSoon={false} readOnly={isConfirmedEdit} />
          </div>
        )}
        footer={(
          <DocumentComposerFooterRow
            autoSaveLabel={effectiveShortLines.length > 0 ? 'Resolve the stock warning before confirming' : autoSaveMeta.label}
            autoSaveTone={effectiveShortLines.length > 0 ? 'warning' : autoSaveMeta.tone}
          >
            <Button type="button" variant="ghost" className="gap-2" onClick={handleDiscard}>
              <X className="h-4 w-4" />
              Discard
            </Button>
            <Button type="button" variant="outline" className="gap-2" onClick={() => void handleSaveAndClose()}>
              <Save className="h-4 w-4" />
              Save &amp; close
            </Button>
            <Button
              type="button"
              variant={effectiveShortLines.length > 0 ? 'secondary' : 'primary'}
              className={effectiveShortLines.length > 0 ? 'gap-2 border-amber-500 text-amber-700 hover:bg-amber-50' : primaryDisabled ? 'btn-disabled gap-2' : 'gap-2'}
              disabled={primaryDisabled}
              onClick={() => void handleConfirmClick()}
            >
              {effectiveShortLines.length > 0 ? <AlertTriangle className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
              {effectiveShortLines.length > 0 ? 'Confirm with backorder' : 'Confirm order'}
            </Button>
          </DocumentComposerFooterRow>
        )}
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
                <div key={line.line_id} className="rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] text-amber-800">
                  <p className="font-medium text-amber-900">{line.product_name}</p>
                  <p className="mt-1">
                    Ordered {line.qty}, only {line.on_hand} on hand. Backorder {line.shortfall}.
                  </p>
                </div>
              ))}
              <label className="flex items-center gap-2 text-[12px] text-cream-800">
                <input type="checkbox" checked={notifyBuyer} onChange={(event) => setNotifyBuyer(event.target.checked)} className="accent-teal-500" />
                Notify buyer of backorder
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setBackorderOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="gap-2 border-amber-500 text-amber-700 hover:bg-amber-50"
              disabled={!pendingConfirmOrderId}
              onClick={() => {
                if (!pendingConfirmOrderId) return;
                void runConfirm(pendingConfirmOrderId, true);
              }}
            >
              <ClipboardList className="h-4 w-4" />
              Confirm anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { DocumentComposerLoadingSkeleton as SalesOrderComposerLoadingSkeleton } from '@/components/seller/composer/DocumentComposerShell';
