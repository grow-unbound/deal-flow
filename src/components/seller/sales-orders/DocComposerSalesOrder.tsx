'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useQuery } from '@tanstack/react-query';
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
import {
  BuyerCardEmpty,
  BuyerCardFilled,
  DocComposerFoot,
  DocComposerFrame,
  DocStrip,
  DocTitleRow,
  DocTop,
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
import { useFlagState } from '@/hooks/useFeatureFlag';
import {
  useBuyerSalesOrderContext,
  useConfirmSalesOrder,
  useCreateSalesOrderDraft,
  useDebouncedSalesOrderStockCheck,
  useSalesOrderComposer,
  useSalesOrderProductSearch,
  useSaveSalesOrderComposer,
} from '@/hooks/useSalesOrders';
import { formatCompactInr } from '@/lib/utils';
import type { Database } from '@/types/database';
import type {
  SalesOrderComposerBuyerContext,
  SalesOrderComposerDocument,
  SalesOrderComposerProductSearchRow,
  SalesOrderComposerSavePayload,
  SalesOrderComposerTotals,
} from '@/types/sales-order-composer';

const NEW_DRAFT_STORAGE_KEY = 'df:sales-order-composer:new-draft';

type BuyerPickerRow = Pick<
  SalesOrderComposerBuyerContext,
  'id' | 'business_name' | 'place_of_supply' | 'credit_used'
>;

function defaultExpectedDelivery() {
  const next = new Date();
  next.setDate(next.getDate() + 7);
  return next.toISOString().slice(0, 10);
}

function defaultPaymentTerms(days: number) {
  return days > 0 ? `Net ${days}` : 'Due on receipt';
}

function computeLineTotal(line: Pick<EstimateComposerLineRow, 'qty' | 'unit_price' | 'disc_pct' | 'tax_pct'>) {
  const taxable = line.qty * line.unit_price * (1 - line.disc_pct / 100);
  return Number((taxable + taxable * (line.tax_pct / 100)).toFixed(2));
}

function computeTotals(lines: EstimateComposerLineRow[], discountFlat: number, freight: number, roundOff: number): SalesOrderComposerTotals {
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

export function SalesOrderComposerLoadingSkeleton() {
  return (
    <div className="max-w-[1440px] mx-auto w-full px-8 py-6" role="status" aria-label="Loading sales order composer">
      <div className="space-y-4">
        <div className="rounded-[14px] border border-cream-300 bg-white px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-3 w-56 animate-pulse rounded bg-cream-200" />
            <div className="h-7 w-24 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
            <div className="h-7 w-28 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
            <div className="ml-auto h-9 w-24 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-52 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-80 animate-pulse rounded bg-cream-200" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="border-r border-cream-300 px-4 py-3 last:border-r-0">
              <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
              <div className="mt-3 h-9 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            </div>
          ))}
        </div>
        <div className="grid min-h-[620px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          <div className="rounded-[14px] border border-cream-300 bg-white p-4">
            <div className="h-4 w-16 animate-pulse rounded bg-cream-200" />
            <div className="mt-2 h-4 w-40 animate-pulse rounded bg-cream-200" />
            <div className="mt-4 h-10 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 rounded-[12px] border border-cream-200 bg-cream-100 px-3 py-3">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-cream-200" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
                    <div className="h-3 w-36 animate-pulse rounded bg-cream-200" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[14px] border border-cream-300 bg-white">
            <div className="border-b border-cream-300 px-5 py-4">
              <div className="h-4 w-20 animate-pulse rounded bg-cream-200" />
              <div className="mt-2 h-4 w-64 animate-pulse rounded bg-cream-200" />
            </div>
            <div className="border-b border-cream-300 px-5 py-4">
              <div className="h-10 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            </div>
            <div className="space-y-3 px-4 py-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="grid grid-cols-[40px_minmax(0,1fr)_90px_90px_72px_72px_100px] gap-3">
                  <div className="h-10 animate-pulse rounded bg-cream-200" />
                  <div className="h-10 animate-pulse rounded bg-cream-100" />
                  <div className="h-10 animate-pulse rounded bg-cream-100" />
                  <div className="h-10 animate-pulse rounded bg-cream-100" />
                  <div className="h-10 animate-pulse rounded bg-cream-100" />
                  <div className="h-10 animate-pulse rounded bg-cream-100" />
                  <div className="h-10 animate-pulse rounded bg-cream-100" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-[14px] border border-cream-300 bg-white p-4">
              <div className="h-3 w-32 animate-pulse rounded bg-cream-200" />
              <div className="mt-4 h-14 animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
              <div className="mt-3 space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
                    <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[14px] border border-cream-300 bg-white p-4">
              <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-10 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 rounded-[14px] border border-cream-300 bg-white px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="h-3 w-36 animate-pulse rounded bg-cream-200" />
            <div className="flex gap-2">
              <div className="h-10 w-24 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
              <div className="h-10 w-32 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
              <div className="h-10 w-40 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const salesOrdersFlag = useFlagState('SALES_ORDERS');

  const createDraftMutation = useCreateSalesOrderDraft();
  const [workingId, setWorkingId] = useState<string | null>(orderId ?? null);
  const { data, isLoading, isError, error } = useSalesOrderComposer(workingId);

  const [documentState, setDocumentState] = useState<SalesOrderComposerDocument | null>(null);
  const [lineState, setLineState] = useState<EstimateComposerLineRow[]>([]);
  const [buyerQuery, setBuyerQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [paymentTermsLabel, setPaymentTermsLabel] = useState('Due on receipt');
  const [autoSaveMeta, setAutoSaveMeta] = useState<{ label: string; tone: 'draft' | 'saved' | 'warning' }>({
    label: 'Draft created',
    tone: 'draft',
  });
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [freightExpanded, setFreightExpanded] = useState(false);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [backorderOpen, setBackorderOpen] = useState(false);
  const [notifyBuyer, setNotifyBuyer] = useState(true);

  const originalDocumentRef = useRef<SalesOrderComposerDocument | null>(null);
  const originalLinesRef = useRef<EstimateComposerLineRow[]>([]);
  const initializedForIdRef = useRef<string | null>(null);
  const createDraftCalledRef = useRef(false);

  const saveMutation = useSaveSalesOrderComposer(workingId);
  const confirmMutation = useConfirmSalesOrder(workingId);
  const buyerContextQuery = useBuyerSalesOrderContext(documentState?.buyer_id ?? null);
  const productSearchQuery = useSalesOrderProductSearch(productQuery, documentState?.buyer_id ?? null);
  const buyerPickerQuery = useBuyerPicker(buyerQuery);

  const diffLines = useMemo(() => mapDiffLines(lineState, originalLinesRef.current), [lineState]);
  const activeLines = useMemo(() => diffLines.filter((line) => line.diff !== 'removed'), [diffLines]);
  const stockCheckQuery = useDebouncedSalesOrderStockCheck(workingId, activeLines.length > 0);

  useEffect(() => {
    if (mode !== 'create') return;
    if (orderId) return;
    if (workingId) return;
    if (createDraftCalledRef.current) return;

    const existingId = window.sessionStorage.getItem(NEW_DRAFT_STORAGE_KEY);
    if (existingId && !fromEstimateId) {
      setWorkingId(existingId);
      return;
    }

    createDraftCalledRef.current = true;
    createDraftMutation.mutate(
      fromEstimateId ? { from_estimate_id: fromEstimateId } : {},
      {
        onSuccess: ({ data: created }) => {
          window.sessionStorage.setItem(NEW_DRAFT_STORAGE_KEY, created.id);
          setWorkingId(created.id);
        },
        onError: (mutationError) => {
          createDraftCalledRef.current = false;
          toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to create sales order draft');
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fromEstimateId, orderId, workingId]);

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
      label: mode === 'create' ? 'Draft created' : 'Draft saved',
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
    if (!dirty || !documentState || !workingId) return;
    setAutoSaveMeta({ label: 'Unsaved changes', tone: 'warning' });

    const timer = window.setTimeout(() => {
      saveMutation.mutate(toSavePayload(documentState, diffLines), {
        onSuccess: ({ data: saved }) => {
          setDocumentState(saved);
          const savedLines = saved.items.map((line) => ({
            ...line,
            diff: 'clean' as const,
            line_total: computeLineTotal(line),
          }));
          setLineState(savedLines);
          originalDocumentRef.current = saved;
          originalLinesRef.current = savedLines;
          setAutoSaveMeta({ label: 'Draft saved just now', tone: 'saved' });
        },
        onError: (mutationError) => {
          setAutoSaveMeta({ label: mutationError instanceof Error ? mutationError.message : 'Save failed', tone: 'warning' });
        },
      });
    }, 2000);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffLines, dirty, documentState, workingId]);

  useEffect(() => {
    if (!documentState || mode !== 'edit') return;
    if (!['dispatched', 'delivered', 'cancelled', 'partially_dispatched', 'invoiced', 'partially_invoiced'].includes(documentState.status)) {
      return;
    }
    toast.error("Can't edit after dispatch.");
    router.replace(`/sales-orders/${documentState.id}`);
  }, [documentState, mode, router]);

  if (orderManagement === false || salesOrdersFlag === false) {
    return <FeatureDisabledState />;
  }

  if (isLoading || createDraftMutation.isPending || !documentState) {
    return <SalesOrderComposerLoadingSkeleton />;
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
  const primaryDisabled = !documentState.buyer_id || activeLines.length === 0 || confirmMutation.isPending;
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
    window.sessionStorage.removeItem(NEW_DRAFT_STORAGE_KEY);
    router.push('/sales-orders');
  }

  function handleSaveAndClose() {
    if (!documentState) return;
    saveMutation.mutate(toSavePayload(documentState, diffLines), {
      onSuccess: () => router.push('/sales-orders'),
      onError: (mutationError) => {
        toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save sales order');
      },
    });
  }

  function runConfirm(hasBackorder: boolean) {
    confirmMutation.mutate(
      { has_backorder: hasBackorder, notify_buyer: notifyBuyer },
      {
        onSuccess: ({ data: response }) => {
          window.sessionStorage.removeItem(NEW_DRAFT_STORAGE_KEY);
          setBackorderOpen(false);
          router.push(response.redirect_path);
        },
        onError: (mutationError) => {
          toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to confirm sales order');
        },
      },
    );
  }

  function handleConfirmClick() {
    if (!documentState) return;
    const proceed = () => {
      if (effectiveShortLines.length > 0) {
        setBackorderOpen(true);
        return;
      }
      runConfirm(false);
    };

    if (dirty) {
      saveMutation.mutate(toSavePayload(documentState, diffLines), {
        onSuccess: ({ data: saved }) => {
          setDocumentState(saved);
          const savedLines = saved.items.map((line) => ({
            ...line,
            diff: 'clean' as const,
            line_total: computeLineTotal(line),
          }));
          setLineState(savedLines);
          originalDocumentRef.current = saved;
          originalLinesRef.current = savedLines;
          proceed();
        },
        onError: (mutationError) => {
          toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save sales order');
        },
      });
      return;
    }

    proceed();
  }

  return (
    <>
      <DocComposerFrame
        mode={isConfirmedEdit ? 'edit' : 'create'}
        kind="so"
        top={(
          <DocTop
            kind="so"
            docNumber={documentState.order_number}
            modeChip={{
              tone: isConfirmedEdit ? 'edit' : 'draft',
              label: modeChip,
            }}
            autoSave={{
              ...autoSaveMeta,
              label: effectiveShortLines.length > 0 ? 'Resolve the stock warning before confirming' : autoSaveMeta.label,
              tone: effectiveShortLines.length > 0 ? 'warning' : autoSaveMeta.tone,
            }}
            onClose={() => router.push('/sales-orders')}
          />
        )}
        titleRow={(
          <DocTitleRow
            title={title}
            subtitle={subtitle}
            rightActions={(
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => toast.message('Stock report coming soon')}>
                <PackageSearch className="h-4 w-4" />
                Stock report
              </Button>
            )}
          />
        )}
        strip={(
          <DocStrip
            kind="so"
            docNumber={documentState.order_number}
            dateIssued={documentState.order_date}
            validUntil={documentState.expected_delivery}
            buyerPoRef={documentState.buyer_po_ref}
            placeOfSupply={documentState.place_of_supply}
            placeOptions={['Delhi', 'Haryana', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Unknown']}
            onDocNumberChange={(value) => setDocumentPatch({ order_number: value })}
            onDateIssuedChange={(value) => setDocumentPatch({ order_date: value })}
            onValidUntilChange={(value) => setDocumentPatch({ expected_delivery: value })}
            onBuyerPoRefChange={(value) => setDocumentPatch({ buyer_po_ref: value })}
            onPlaceOfSupplyChange={(value) => setDocumentPatch({ place_of_supply: value })}
          />
        )}
        left={
          buyer ? (
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
              onQueryChange={setBuyerQuery}
              onSelectBuyer={handleSelectBuyer}
            />
          )
        }
        center={
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
        }
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
          <DocComposerFoot
            autoSaveLabel={effectiveShortLines.length > 0 ? 'Resolve the stock warning before confirming' : autoSaveMeta.label}
            autoSaveTone={effectiveShortLines.length > 0 ? 'warning' : autoSaveMeta.tone}
            actions={(
              <>
                <Button type="button" variant="ghost" className="gap-2" onClick={handleDiscard}>
                  <X className="h-4 w-4" />
                  Discard
                </Button>
                <Button type="button" variant="outline" className="gap-2" onClick={handleSaveAndClose}>
                  <Save className="h-4 w-4" />
                  Save &amp; close
                </Button>
                <Button
                  type="button"
                  variant={effectiveShortLines.length > 0 ? 'secondary' : 'primary'}
                  className={effectiveShortLines.length > 0 ? 'gap-2 border-amber-500 text-amber-700 hover:bg-amber-50' : primaryDisabled ? 'btn-disabled gap-2' : 'gap-2'}
                  disabled={primaryDisabled}
                  onClick={handleConfirmClick}
                >
                  {effectiveShortLines.length > 0 ? <AlertTriangle className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                  {effectiveShortLines.length > 0 ? 'Confirm with backorder' : 'Confirm order'}
                </Button>
              </>
            )}
          />
        )}
      />

      <Dialog open={backorderOpen} onOpenChange={setBackorderOpen}>
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
            <Button type="button" variant="secondary" className="gap-2 border-amber-500 text-amber-700 hover:bg-amber-50" onClick={() => runConfirm(true)}>
              <ClipboardList className="h-4 w-4" />
              Confirm anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
