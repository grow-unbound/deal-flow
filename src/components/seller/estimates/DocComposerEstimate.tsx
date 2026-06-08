'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Eye, FileText, Mail, MessageCircle, Send, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { FeatureDisabledState } from '@/components/FeatureGate';
import {
  BuyerCardEmpty,
  BuyerCardFilled,
  BuyerCardLoading,
  DocComposerFoot,
  DocComposerFrame,
  DocStrip,
  DocTitleRow,
  LinesTable,
  TotalsCard,
  type EstimateComposerLineRow,
} from '@/components/seller/document-composer';
import { FEATURE_FLAGS } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useFlagState } from '@/hooks/useFeatureFlag';
import {
  useBuyerEstimateContext,
  useEstimateComposer,
  useNextEstimateNumber,
  useEstimateProductPricing,
  useEstimateProductSearch,
  useSaveEstimateComposer,
  useSendEstimate,
} from '@/hooks/useEstimates';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DiscardChangesDialog, useDirtyCloseGuard } from '@/components/ui/form-overlay';
import { Input } from '@/components/ui/input';
import { apiFetch, apiPatch, apiPost } from '@/lib/api-fetch';
import type {
  EstimateComposerBuyerContext,
  EstimateComposerDocument,
  EstimateComposerProductSearchRow,
  EstimateComposerSavePayload,
  EstimateComposerTotals,
  EstimateSendChannel,
} from '@/types/estimate-composer';
import { cn, formatCompactInr } from '@/lib/utils';

const BASE_PRICING_OPTION = '__base__';

type BuyerPickerRow = Pick<
  EstimateComposerBuyerContext,
  'id' | 'business_name' | 'place_of_supply' | 'credit_used'
>;

function defaultPaymentTerms(days: number) {
  return days > 0 ? `Net ${days}` : 'Due on receipt';
}

function isoDateOffset(daysFromToday: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function buildNewEstimateDraft(estimateNumber = 'Estimating next number...'): EstimateComposerDocument {
  return {
    id: '',
    estimate_number: estimateNumber,
    status: 'draft',
    buyer_id: null,
    date_issued: isoDateOffset(0),
    valid_until: isoDateOffset(14),
    buyer_po_ref: '',
    place_of_supply: 'Unknown',
    seller_note: '',
    freight: 0,
    discount_flat: 0,
    round_off: 0,
    sent_at: null,
    sent_channel: null,
    items: [],
    buyer_context: null,
    estimate_version: 1,
    viewed_at: null,
    viewed_by_name: null,
    voided_at: null,
    converted_to_order_id: null,
    linked_order_number: null,
  };
}

function parseCurrencyInput(value: string) {
  const numeric = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
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

function snapshotPayload(document: EstimateComposerDocument, lines: EstimateComposerLineRow[]) {
  return JSON.stringify({
    estimate_number: document.estimate_number,
    buyer_id: document.buyer_id,
    date_issued: document.date_issued,
    valid_until: document.valid_until,
    buyer_po_ref: document.buyer_po_ref,
    place_of_supply: document.place_of_supply,
    seller_note: document.seller_note,
    freight: document.freight,
    discount_flat: document.discount_flat,
    round_off: document.round_off,
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
      || line.diff === 'removed'
    ) {
      return { ...line, diff: line.diff === 'removed' ? 'removed' as const : 'changed' as const };
    }
    return { ...line, diff: 'clean' as const };
  });
}

function toSavePayload(document: EstimateComposerDocument, lines: EstimateComposerLineRow[]): EstimateComposerSavePayload {
  return {
    estimate_number: document.estimate_number,
    buyer_id: document.buyer_id,
    date_issued: document.date_issued,
    valid_until: document.valid_until,
    buyer_po_ref: document.buyer_po_ref,
    place_of_supply: document.place_of_supply,
    seller_note: document.seller_note,
    freight: document.freight,
    discount_flat: document.discount_flat,
    round_off: document.round_off,
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

function useBuyerPicker(query: string, open: boolean) {
  return useQuery({
    queryKey: ['estimate-buyer-picker', query.trim(), open],
    queryFn: async (): Promise<BuyerPickerRow[]> => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      params.set('limit', '8');
      const res = await apiFetch(`/api/tenant/buyers/search?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to search buyers');
      }
      const json = await res.json() as { buyers: BuyerPickerRow[] };
      return json.buyers ?? [];
    },
    enabled: open,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function EstimateComposerLoadingSkeleton() {
  return (
    <div className="max-w-[1440px] mx-auto w-full px-8 pt-7 pb-6" role="status" aria-label="Loading estimate composer">
      <div className="space-y-4">
        <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-44 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-72 animate-pulse rounded bg-cream-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            <div className="h-9 w-24 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
          </div>
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
              <div className="h-4 w-16 animate-pulse rounded bg-cream-200" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-center justify-between gap-4">
                    <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
                    <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[14px] border border-cream-300 bg-white p-4">
              <div className="h-4 w-20 animate-pulse rounded bg-cream-200" />
              <div className="mt-4 space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
                    <div className="h-3 w-32 animate-pulse rounded bg-cream-200" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 rounded-[14px] border border-cream-300 bg-white px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-10 w-28 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
              <div className="h-10 w-28 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
              <div className="h-10 w-32 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DocComposerEstimate({
  mode,
  estimateId,
}: {
  mode: 'create' | 'edit';
  estimateId?: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const estimatesFlag = useFlagState('ESTIMATES');

  const [workingId, setWorkingId] = useState<string | null>(estimateId ?? null);
  const { data, isLoading, isError, error } = useEstimateComposer(workingId);
  const nextEstimateNumberQuery = useNextEstimateNumber(mode === 'create' && !estimateId);

  const [documentState, setDocumentState] = useState<EstimateComposerDocument | null>(() => (
    mode === 'create' && !estimateId ? buildNewEstimateDraft() : null
  ));
  const [lineState, setLineState] = useState<EstimateComposerLineRow[]>([]);
  const [buyerQuery, setBuyerQuery] = useState('');
  const [buyerSearchOpen, setBuyerSearchOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [paymentTermsLabel, setPaymentTermsLabel] = useState('Due on receipt');
  const [sendOpen, setSendOpen] = useState(false);
  const [sendChannel, setSendChannel] = useState<EstimateSendChannel>('whatsapp');
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendMessage, setSendMessage] = useState('Please review this estimate.');
  const [autoSaveMeta, setAutoSaveMeta] = useState<{ label: string; tone: 'draft' | 'saved' | 'warning' }>({
    label: mode === 'create' ? 'Not saved yet' : 'Ready to save',
    tone: 'draft',
  });
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [freightExpanded, setFreightExpanded] = useState(false);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [selectedPriceListId, setSelectedPriceListId] = useState<string | null>(null);

  const originalDocumentRef = useRef<EstimateComposerDocument | null>(null);
  const originalLinesRef = useRef<EstimateComposerLineRow[]>([]);
  const initializedForIdRef = useRef<string | null>(null);
  const lastAppliedPricingKeyRef = useRef<string | null>(null);

  const saveMutation = useSaveEstimateComposer(workingId);
  const sendMutation = useSendEstimate(workingId);
  const buyerContextQuery = useBuyerEstimateContext(documentState?.buyer_id ?? null);
  const productSearchQuery = useEstimateProductSearch(productQuery, documentState?.buyer_id ?? null, searchOpen, selectedPriceListId);
  const buyerPickerQuery = useBuyerPicker(buyerQuery, buyerSearchOpen);
  const pricingQuery = useEstimateProductPricing(
    documentState?.buyer_id ?? null,
    lineState.filter((line) => line.diff !== 'removed').map((line) => line.tenant_product_id),
    selectedPriceListId,
  );
  const closeTarget = mode === 'edit' && estimateId ? `/estimates/${estimateId}` : '/estimates';

  useEffect(() => {
    if (mode !== 'create' || estimateId || !nextEstimateNumberQuery.data) return;
    setDocumentState((current) => current ? { ...current, estimate_number: nextEstimateNumberQuery.data } : current);
  }, [estimateId, mode, nextEstimateNumberQuery.data]);

  useEffect(() => {
    if (!data) return;
    if (initializedForIdRef.current === data.id) return;

    const nextData = data.buyer_context
      ? {
          ...data,
          buyer_context: {
            ...data.buyer_context,
            sales_agent_name: user?.displayName ?? data.buyer_context.sales_agent_name,
          },
        }
      : data;
    setDocumentState(nextData);
    const mappedLines = (data.items ?? []).map((line) => ({
      ...line,
      diff: 'clean' as const,
      line_total: computeLineTotal(line),
    }));
    setLineState(mappedLines);
    setPaymentTermsLabel(defaultPaymentTerms(nextData.buyer_context?.payment_terms_days ?? 0));
    setSendRecipient(nextData.buyer_context?.phone ?? nextData.buyer_context?.email ?? '');
    setSelectedPriceListId(nextData.buyer_context?.active_pricelist?.id ?? null);
    originalDocumentRef.current = nextData;
    originalLinesRef.current = mappedLines;
    initializedForIdRef.current = nextData.id;
    setAutoSaveMeta({
      label: mode === 'create' ? 'Saved draft' : 'Saved changes',
      tone: 'saved',
    });
  }, [data, mode, user?.displayName]);

  useEffect(() => {
    if (mode !== 'create' || estimateId || originalDocumentRef.current) return;
    if (!documentState) return;

    originalDocumentRef.current = documentState;
    originalLinesRef.current = [];
  }, [documentState, estimateId, mode]);

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
      place_of_supply:
        !current.place_of_supply
        || current.place_of_supply === 'Unknown'
        || current.place_of_supply === current.buyer_context?.place_of_supply
          ? nextContext.place_of_supply
          : current.place_of_supply,
      buyer_context: {
        ...nextContext,
        sales_agent_name: user?.displayName ?? nextContext.sales_agent_name,
      },
    }) : current);
    setPaymentTermsLabel(defaultPaymentTerms(nextContext.payment_terms_days));
    setSendRecipient(nextContext.phone ?? nextContext.email ?? '');
    setSelectedPriceListId((current) => current ?? nextContext.active_pricelist?.id ?? null);
  }, [buyerContextQuery.data, documentState, user?.displayName]);

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
        return { ...next, line_total: computeLineTotal(next) };
      }),
    );
    lastAppliedPricingKeyRef.current = pricingKey;
  }, [documentState?.buyer_id, lineState.length, pricingQuery.data, selectedPriceListId]);

  const diffLines = useMemo(() => mapDiffLines(lineState, originalLinesRef.current), [lineState]);
  const totals = useMemo(
    () => computeTotals(diffLines, documentState?.discount_flat ?? 0, documentState?.freight ?? 0, documentState?.round_off ?? 0),
    [diffLines, documentState?.discount_flat, documentState?.freight, documentState?.round_off],
  );
  const previousTotals = useMemo(
    () => {
      if (!originalDocumentRef.current) return null;
      return computeTotals(
        originalLinesRef.current,
        originalDocumentRef.current.discount_flat,
        originalDocumentRef.current.freight,
        originalDocumentRef.current.round_off,
      );
    },
    [documentState?.id],
  );
  const dirty = useMemo(() => {
    if (!documentState) return false;
    return snapshotPayload(documentState, diffLines) !== snapshotPayload(originalDocumentRef.current ?? documentState, originalLinesRef.current);
  }, [diffLines, documentState]);
  const dirtyGuard = useDirtyCloseGuard({
    isDirty: dirty,
    onConfirmClose: () => router.push(closeTarget),
  });

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  useEffect(() => {
    setAutoSaveMeta(dirty
      ? { label: 'Unsaved changes', tone: 'warning' }
      : { label: workingId ? 'Saved changes' : 'Not saved yet', tone: dirty ? 'warning' : 'saved' });
  }, [dirty, workingId]);

  async function createDraftOnDemand(): Promise<EstimateComposerDocument> {
    if (workingId && data) {
      return data;
    }

    const res = await apiPost('/api/tenant/estimates', {});
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Failed to create draft');
    }
    const json = await res.json() as { data: EstimateComposerDocument };
    setWorkingId(json.data.id);
    return json.data;
  }

  async function saveDocumentNow(nextDocument: EstimateComposerDocument, nextLines: EstimateComposerLineRow[]) {
    const created = !workingId ? await createDraftOnDemand() : null;
    const targetId = workingId ?? created?.id ?? null;
    if (!targetId) throw new Error('Missing estimate id');

    const payload = toSavePayload({
      ...nextDocument,
      id: targetId,
      estimate_number: created?.estimate_number ?? nextDocument.estimate_number,
    }, nextLines);

    if (workingId) {
      return new Promise<EstimateComposerDocument>((resolve, reject) => {
        saveMutation.mutate(payload, {
          onSuccess: ({ data: saved }) => resolve(saved),
          onError: (mutationError) => reject(mutationError),
        });
      });
    }

    const res = await apiPatch(`/api/tenant/estimates/${targetId}`, payload);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Failed to save estimate');
    }
    const json = await res.json() as { data: EstimateComposerDocument };
    return json.data;
  }

  if (orderManagement === false || estimatesFlag === false) {
    return <FeatureDisabledState />;
  }

  if (isError) {
    if (error instanceof Error && error.message === 'forbidden') {
      return <FeatureDisabledState />;
    }
    return (
      <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6">
        <p className="text-[13px] text-danger-700">{error instanceof Error ? error.message : 'Failed to load estimate composer.'}</p>
      </div>
    );
  }

  if ((workingId && isLoading) || !documentState) {
    return <EstimateComposerLoadingSkeleton />;
  }

  const buyerResults = buyerPickerQuery.data ?? [];
  const buyer = documentState.buyer_context ?? buyerContextQuery.data ?? null;
  const activeLines = diffLines.filter((line) => line.diff !== 'removed');
  const primaryDisabled = mode === 'edit' && documentState.status === 'sent'
    ? !dirty || activeLines.length === 0
    : !documentState.buyer_id || activeLines.length === 0;
  const overLimitBy = buyer ? totals.grand_total - buyer.credit_available : 0;
  const creditWarning = buyer && overLimitBy > 0
    ? `Over limit by ${formatCompactInr(overLimitBy)}. Estimate can still be sent — converting to SO needs approval.`
    : null;
  const isInterState = Boolean(
    buyer?.seller_state
    && buyer?.place_of_supply
    && buyer.seller_state.toLowerCase() !== buyer.place_of_supply.toLowerCase(),
  );

  function setDocumentPatch(patch: Partial<EstimateComposerDocument>) {
    setDocumentState((current) => current ? { ...current, ...patch } : current);
  }

  function handleSelectBuyer(buyerId: string) {
    setDocumentPatch({
      buyer_id: buyerId,
      buyer_context: null,
    });
    setSelectedPriceListId(null);
    setBuyerQuery('');
    setProductQuery('');
    setBuyerSearchOpen(false);
    setSearchOpen(false);
  }

  function handleAddProduct(product: EstimateComposerProductSearchRow) {
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
    if (!documentState) return;
    try {
      const saved = await saveDocumentNow(documentState, diffLines);
      originalDocumentRef.current = saved;
      originalLinesRef.current = saved.items.map((line) => ({ ...line, diff: 'clean', line_total: computeLineTotal(line) }));
      setDocumentState(saved);
      setLineState(originalLinesRef.current);
      setAutoSaveMeta({ label: 'Draft saved just now', tone: 'saved' });
      router.push('/estimates');
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save estimate');
    }
  }

  async function handleSend() {
    if (!documentState) return;
    try {
      const saved = await saveDocumentNow(documentState, diffLines);
      const targetId = saved.id;
      setWorkingId(targetId);
      setDocumentState(saved);
      originalDocumentRef.current = saved;
      originalLinesRef.current = saved.items.map((line) => ({ ...line, diff: 'clean', line_total: computeLineTotal(line) }));
      setLineState(originalLinesRef.current);

      const sendPayload = {
        channel: sendChannel,
        recipient: sendRecipient,
        message: sendMessage,
      };

      if (workingId) {
        sendMutation.mutate(sendPayload, {
          onSuccess: () => {
            setSendOpen(false);
            router.push(`/estimates/${targetId}`);
          },
          onError: (mutationError) => {
            toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to send estimate');
          },
        });
        return;
      }

      const res = await apiPatch(`/api/tenant/estimates/${targetId}/send`, sendPayload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to send estimate');
      }

      setSendOpen(false);
      router.push(`/estimates/${targetId}`);
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to send estimate');
    }
  }

  return (
    <>
      <DocComposerFrame
        mode={mode === 'edit' ? 'edit' : 'create'}
        kind="estimate"
        top={(
          <nav className="flex flex-wrap items-center gap-1.5 text-[12px] text-cream-600">
            <span>Sales</span>
            <span className="text-cream-400">›</span>
            <button type="button" className="hover:text-cream-900" onClick={() => router.push('/estimates')}>
              Estimates
            </button>
            <span className="text-cream-400">›</span>
            <span className="font-medium text-cream-900">{mode === 'edit' ? documentState.estimate_number : 'Add an estimate'}</span>
          </nav>
        )}
        titleRow={(
          <DocTitleRow
            title={(
              <span className="inline-flex flex-wrap items-center gap-2">
                <span>{mode === 'edit' ? 'Edit estimate' : 'Add an estimate'}</span>
                <span className="inline-flex items-center rounded-full border border-cream-300 bg-cream-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-cream-700">
                  {mode === 'edit' && documentState.status === 'sent' ? 'Editing live draft' : 'Draft'}
                </span>
              </span>
            )}
            subtitle={buyer ? `${buyer.business_name} · ${buyer.place_of_supply}` : 'Pick a buyer to begin composing this estimate.'}
            rightActions={(
              <>
                {diffLines.length > 0 ? (
                  <Button type="button" variant="outline" size="sm" className="gap-2">
                    <Eye className="h-4 w-4" />
                    Preview PDF
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" className="gap-2" onClick={() => dirtyGuard.handleOpenChange(false)}>
                  <X className="h-3.5 w-3.5" />
                  Close
                </Button>
              </>
            )}
          />
        )}
        strip={(
          <DocStrip
            kind="estimate"
            docNumber={documentState.estimate_number}
            dateIssued={documentState.date_issued}
            validUntil={documentState.valid_until}
            buyerPoRef={documentState.buyer_po_ref}
            placeOfSupply={documentState.place_of_supply}
            onDateIssuedChange={(value) => setDocumentPatch({ date_issued: value })}
            onValidUntilChange={(value) => setDocumentPatch({ valid_until: value })}
            onBuyerPoRefChange={(value) => setDocumentPatch({ buyer_po_ref: value })}
            onPlaceOfSupplyChange={(value) => setDocumentPatch({ place_of_supply: value })}
          />
        )}
        left={(
          <div className="space-y-4">
            {documentState.buyer_id && buyerContextQuery.isLoading && !buyer ? (
              <BuyerCardLoading />
            ) : buyer ? (
              <BuyerCardFilled
                buyer={buyer}
                previewTotal={totals.grand_total}
                paymentTermsValue={paymentTermsLabel}
                onSwap={() => {
                  setSelectedPriceListId(null);
                  setDocumentPatch({ buyer_id: null, buyer_context: null });
                }}
              />
            ) : (
              <BuyerCardEmpty
                query={buyerQuery}
                results={buyerResults}
                searchOpen={buyerSearchOpen}
                searchLoading={buyerPickerQuery.isLoading}
                onQueryChange={setBuyerQuery}
                onSearchOpenChange={setBuyerSearchOpen}
                onSelectBuyer={handleSelectBuyer}
              />
            )}
            <EstimateMetaCard
              notesValue={documentState.seller_note}
              freightValue={documentState.freight}
              notesExpanded={notesExpanded}
              freightExpanded={freightExpanded}
              onToggleNotes={() => setNotesExpanded((current) => !current)}
              onToggleFreight={() => setFreightExpanded((current) => !current)}
              onNotesChange={(value) => setDocumentPatch({ seller_note: value })}
              onFreightChange={(value) => setDocumentPatch({ freight: value })}
            />
          </div>
        )}
        center={
          <LinesTable
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
            title={
              activeLines.length === 0
                ? 'Build the estimate lines'
                : `${activeLines.length} line${activeLines.length === 1 ? '' : 's'} in this estimate`
            }
            description="Search by product, SKU, or brand. Pricelist pricing is applied automatically."
            showNotesControls={false}
            showFreightControls={false}
            addProductInline
            notesValue={documentState.seller_note}
            freightValue={String(documentState.freight || '')}
            internalValue=""
            onProductQueryChange={setProductQuery}
            onSearchOpenChange={setSearchOpen}
            onAddProduct={handleAddProduct}
            onResetOverrides={handleResetOverrides}
            resetEnabled={dirty}
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
              title="Estimate summary"
              totals={totals}
              previousTotals={mode === 'edit' ? previousTotals : null}
              creditWarning={creditWarning}
              isInterState={isInterState}
              lineCount={activeLines.length}
            />
            {mode === 'edit' ? (
              <section className="rounded-[14px] border border-cream-300 bg-white p-4">
                <p className="text-[13px] font-semibold text-cream-950">Staged changes</p>
                <div className="mt-4 space-y-3 text-[12px] text-cream-700">
                  <div className="flex items-center justify-between gap-4">
                    <span>Document version</span>
                    <span className="font-mono text-cream-900">v{documentState.estimate_version}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Buyer</span>
                    <span className="max-w-[180px] text-right font-medium text-cream-900">{buyer?.business_name ?? 'Unassigned buyer'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Lines</span>
                    <span className="font-mono text-cream-900">{activeLines.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Place of supply</span>
                    <span className="max-w-[180px] text-right font-medium text-cream-900">{documentState.place_of_supply || 'Unknown'}</span>
                  </div>
                </div>
                {documentState.status === 'sent' ? (
                  <div className="mt-4 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] leading-[1.5] text-amber-800">
                    Saving these edits stages a new version before the estimate is re-sent.
                  </div>
                ) : (
                  <div className="mt-4 rounded-[10px] border border-teal-200 bg-teal-50 px-3 py-3 text-[12px] leading-[1.5] text-teal-700">
                    Save changes keeps this draft in your pipeline until you explicitly send it.
                  </div>
                )}
              </section>
            ) : null}
          </div>
        )}
        footer={(
          <DocComposerFoot
            autoSaveLabel={autoSaveMeta.label}
            autoSaveTone={autoSaveMeta.tone}
            actions={(
              <>
                <Button type="button" variant="ghost" className="gap-2" onClick={handleDiscard}>
                  <Trash2 className="h-4 w-4" />
                  Discard draft
                </Button>
                <Button type="button" variant="accent" className="gap-2" onClick={() => void handleSaveAndClose()}>
                  <FileText className="h-4 w-4" />
                  Save &amp; close
                </Button>
                <Button
                  type="button"
                  className={primaryDisabled ? 'btn-disabled gap-2' : 'gap-2'}
                  disabled={primaryDisabled}
                  onClick={() => setSendOpen(true)}
                >
                  <Send className="h-4 w-4" />
                  {mode === 'edit' ? 'Save & resend' : 'Send estimate'}
                </Button>
              </>
            )}
          />
        )}
      />

      <DiscardChangesDialog
        open={dirtyGuard.discardOpen}
        onOpenChange={dirtyGuard.setDiscardOpen}
        onDiscard={dirtyGuard.confirmDiscard}
      />

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="sm:max-w-[580px]">
          <DialogHeader>
            <DialogTitle>Send estimate</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex gap-2">
              {(['whatsapp', 'email', 'download'] as EstimateSendChannel[]).map((channel) => (
                <Button
                  key={channel}
                  type="button"
                  variant={sendChannel === channel ? 'primary' : 'outline'}
                  size="sm"
                  className="gap-2"
                  onClick={() => setSendChannel(channel)}
                >
                  {channel === 'whatsapp' ? <MessageCircle className="h-4 w-4" /> : null}
                  {channel === 'email' ? <Mail className="h-4 w-4" /> : null}
                  {channel === 'download' ? <Download className="h-4 w-4" /> : null}
                  {channel === 'download' ? 'Download only' : channel[0].toUpperCase() + channel.slice(1)}
                </Button>
              ))}
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-2 text-[12px] font-medium text-cream-800">Recipient</p>
                <Input value={sendRecipient} onChange={(event) => setSendRecipient(event.target.value)} />
              </div>
              <div>
                <p className="mb-2 text-[12px] font-medium text-cream-800">Message</p>
                <textarea
                  value={sendMessage}
                  onChange={(event) => setSendMessage(event.target.value)}
                  className="min-h-[120px] w-full rounded-[12px] border border-cream-300 px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div className="rounded-[12px] border border-cream-200 bg-cream-50 p-3 text-[12px] text-cream-700">
                Buyer sees {diffLines.filter((line) => line.diff !== 'removed').length} lines totaling {formatCompactInr(totals.grand_total)}.
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSendOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="gap-2" onClick={handleSend}>
              <Send className="h-4 w-4" />
              Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EstimateMetaCard({
  notesValue,
  freightValue,
  notesExpanded,
  freightExpanded,
  onToggleNotes,
  onToggleFreight,
  onNotesChange,
  onFreightChange,
}: {
  notesValue: string;
  freightValue: number;
  notesExpanded: boolean;
  freightExpanded: boolean;
  onToggleNotes: () => void;
  onToggleFreight: () => void;
  onNotesChange: (value: string) => void;
  onFreightChange: (value: number) => void;
}) {
  return (
    <aside className="rounded-[14px] border border-cream-300 bg-white p-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" className="gap-2 text-[12px]" onClick={onToggleNotes}>
          {notesExpanded ? 'Hide notes' : 'Notes'}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="gap-2 text-[12px]" onClick={onToggleFreight}>
          {freightExpanded ? 'Hide freight' : 'Freight charges'}
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">Notes</p>
          {notesExpanded ? (
            <textarea
              className="mt-2 min-h-[96px] w-full rounded-[10px] border border-cream-300 p-3 text-[13px]"
              rows={4}
              value={notesValue}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Add buyer-facing notes"
            />
          ) : (
            <p className="mt-2 text-[12px] leading-[1.55] text-cream-700">{notesValue.trim() || 'No notes added yet.'}</p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-600">Freight charges</p>
          <div className="relative mt-2">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-cream-600">₹</span>
            <Input
              className={cn('h-10 pl-8')}
              inputMode="decimal"
              value={freightValue > 0 ? String(freightValue) : ''}
              onFocus={() => {
                if (!freightExpanded) onToggleFreight();
              }}
              onChange={(event) => onFreightChange(parseCurrencyInput(event.target.value))}
              placeholder="0"
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
