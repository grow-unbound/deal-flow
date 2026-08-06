'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileText, Loader2, Mail, MessageCircle, Send, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { FeatureDisabledState } from '@/components/FeatureGate';
import { PermissionDenied } from '@/components/auth/PermissionDenied';
import {
  DocumentBasicsStrip,
  DocumentComposerFooterRow,
} from '@/components/seller/composer/DocumentBasicsStrip';
import { DocumentComposerShell } from '@/components/seller/composer/DocumentComposerShell';
import { DocumentComposerLoadingSkeleton as SharedDocumentComposerLoadingSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import {
  BuyerCardEmpty,
  BuyerCardLoading,
  DocumentCustomerStrip,
  LinesTable,
  TotalsCard,
  type EstimateComposerLineRow,
} from '@/components/seller/document-composer';
import { FEATURE_FLAGS } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useInvoiceDetail } from '@/hooks/useInvoiceDetail';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import { useTenantLocations } from '@/hooks/useTenantLocations';
import { composerSubmitFooterLabel, useComposerLeaveGuard } from '@/hooks/useComposerLeaveGuard';
import { useDocumentBuyerPicker } from '@/hooks/useDocumentBuyerPicker';
import {
  useBuyerEstimateContext,
  useEstimatePriceListOptions,
  useEstimateProductPricing,
  useEstimateProductSearch,
} from '@/hooks/useEstimates';
import { useInvoiceComposer, useNextInvoiceNumber, useSaveInvoiceComposer, useSendInvoice } from '@/hooks/useInvoices';
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
import { apiPatch, apiPost } from '@/lib/api-fetch';
import { clearComposerDraft, loadComposerDraft, saveComposerDraft } from '@/lib/composer-session-draft';
import type {
  InvoiceComposerDocument,
  InvoiceComposerProductSearchRow,
  InvoiceComposerSavePayload,
} from '@/types/invoice-composer';
import type { InvoiceDetailResponse } from '@/types/tenant-invoices';
import { bumpSecondDateAfterFirst } from '@/lib/date-utils';
import { isoDateInTimeZone } from '@/lib/date-utils';
import {
  buildComposerStagedChanges,
  stagedSliceFromInvoice,
} from '@/lib/documents/composer-staged-changes';
import { computeTotals, defaultPaymentTerms } from '@/lib/documents/composer-math';
import { computeLineTaxableAmount } from '@/lib/gst';
import { formatNumberValue } from '@/lib/utils';

type SendChannel = 'whatsapp' | 'email' | 'download';

const BASE_PRICING_OPTION = '__base__';

function buildNewInvoiceDraft(invoiceNumber = 'Reserving next number...'): InvoiceComposerDocument {
  return {
    id: '',
    invoice_number: invoiceNumber,
    status: 'draft',
    buyer_id: null,
    location_id: null,
    location_name: null,
    available_locations: [],
    invoice_date: isoDateInTimeZone(new Date()),
    due_date: null,
    buyer_po_ref: '',
    place_of_supply: '',
    seller_note: '',
    freight: 0,
    discount_flat: 0,
    round_off: 0,
    sent_at: null,
    sent_channel: null,
    items: [],
    buyer_context: null,
    order_id: null,
    estimate_id: null,
    linked_order_number: null,
    linked_estimate_number: null,
  };
}

function invoiceDetailToComposerDocument(detail: InvoiceDetailResponse): InvoiceComposerDocument {
  return {
    id: detail.id,
    invoice_number: detail.doc_number,
    status: detail.db_status,
    buyer_id: detail.buyer_id,
    location_id: detail.location_id,
    location_name: detail.location_name,
    available_locations: [],
    invoice_date: detail.invoice_date,
    due_date: detail.due_date,
    buyer_po_ref: detail.buyer_po_ref ?? '',
    place_of_supply: detail.place_of_supply ?? '',
    seller_note: detail.seller_note,
    freight: detail.totals.freight,
    discount_flat: detail.totals.discount_amt,
    round_off: detail.totals.round_off,
    sent_at: detail.sent_at,
    sent_channel: null,
    items: detail.items.map((line) => ({
      id: line.id ?? line.tenant_product_id,
      tenant_product_id: line.tenant_product_id,
      product_name: line.product_name,
      sku: line.sku,
      brand_name: line.brand_name,
      brand_initials: line.brand_initials,
      brand_hue: line.brand_hue,
      hsn_code: line.hsn,
      on_hand: 0,
      qty: line.qty,
      unit_price: line.rate,
      mrp: line.mrp,
      base_selling_price: line.rate,
      disc_pct: line.discount_pct,
      tax_pct: line.tax_pct ?? 0,
      line_total: computeLineTaxableAmount({
        qty: line.qty,
        unit_price: line.rate,
        disc_pct: line.discount_pct,
      }),
      scheme_tag: null,
    })),
    buyer_context: {
      id: detail.buyer.id,
      business_name: detail.buyer.name,
      contact_name: detail.buyer.contact_name,
      phone: detail.buyer.phone,
      email: detail.buyer.email,
      gstin: detail.buyer.gstin,
      bill_address: detail.buyer.bill_address,
      city: detail.buyer.city,
      state: detail.buyer.state,
      pincode: detail.buyer.pincode,
      place_of_supply: detail.buyer.place_of_supply,
      seller_state: detail.buyer.seller_state,
      payment_terms_days: detail.buyer.payment_terms_days,
      credit_limit: detail.buyer.credit_limit,
      credit_used: detail.buyer.credit_used,
      credit_available: Math.max(detail.buyer.credit_limit - detail.buyer.credit_used, 0),
      active_pricelist: detail.buyer.active_pricelist,
      sales_agent_name: detail.buyer.sales_agent_name,
    },
    order_id: detail.order_id,
    estimate_id: detail.estimate_id,
    linked_order_number: detail.linked_order_number,
    linked_estimate_number: detail.linked_estimate_number,
  };
}

function snapshotPayload(document: InvoiceComposerDocument, lines: EstimateComposerLineRow[]) {
  return JSON.stringify({
    invoice_number: document.invoice_number,
    buyer_id: document.buyer_id,
    location_id: document.location_id,
    invoice_date: document.invoice_date,
    due_date: document.due_date,
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

function toSavePayload(document: InvoiceComposerDocument, lines: EstimateComposerLineRow[]): InvoiceComposerSavePayload {
  return {
    invoice_number: document.invoice_number,
    buyer_id: document.buyer_id,
    location_id: document.location_id,
    invoice_date: document.invoice_date,
    due_date: document.due_date,
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

export function DocComposerInvoice({
  mode,
  invoiceId,
}: {
  mode: 'create' | 'edit';
  invoiceId?: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const closeTarget = mode === 'edit' && invoiceId ? `/invoices/${invoiceId}` : '/invoices';
  const qc = useQueryClient();
  const { isLeavingRef, beginLeaving, resetLeaving, shouldBlockComposer, isSubmitting, submitAction } = useComposerLeaveGuard();
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const invoicesFlag = useFlagState('INVOICES');
  const { data: tenantSettings } = useTenantSettings();
  const tenantLocationsQuery = useTenantLocations();
  const gstInclusive = tenantSettings?.unified.business_policy.gst_inclusive ?? false;

  const [workingId, setWorkingId] = useState<string | null>(invoiceId ?? null);
  const { data, isLoading, isError, error } = useInvoiceComposer(workingId);
  const detailFallbackQuery = useInvoiceDetail(mode === 'edit' && invoiceId ? invoiceId : '');
  const nextInvoiceNumberQuery = useNextInvoiceNumber(mode === 'create' && !invoiceId);
  const composerData = useMemo(() => {
    if (data?.items?.length) return data;
    if (mode === 'edit' && detailFallbackQuery.data) return invoiceDetailToComposerDocument(detailFallbackQuery.data);
    return data ?? null;
  }, [data, detailFallbackQuery.data, mode]);

  const [documentState, setDocumentState] = useState<InvoiceComposerDocument | null>(() => {
    if (mode !== 'create' || invoiceId) return null;
    return loadComposerDraft<InvoiceComposerDocument, EstimateComposerLineRow>('invoice')?.document
      ?? buildNewInvoiceDraft();
  });
  const [lineState, setLineState] = useState<EstimateComposerLineRow[]>(() => {
    if (mode !== 'create' || invoiceId) return [];
    return loadComposerDraft<InvoiceComposerDocument, EstimateComposerLineRow>('invoice')?.lines ?? [];
  });
  const [buyerQuery, setBuyerQuery] = useState('');
  const [buyerSearchOpen, setBuyerSearchOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [paymentTermsLabel, setPaymentTermsLabel] = useState('Not defined');
  const [sendOpen, setSendOpen] = useState(false);
  const [sendChannel, setSendChannel] = useState<SendChannel>('whatsapp');
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendMessage, setSendMessage] = useState('Please review and pay this invoice.');
  const [autoSaveMeta, setAutoSaveMeta] = useState<{ label: string; tone: 'draft' | 'saved' | 'warning' }>({
    label: mode === 'create' ? 'Not saved yet' : 'Ready to save',
    tone: 'draft',
  });
  const [selectedPriceListId, setSelectedPriceListId] = useState<string | null>(null);
  const [autoFocusLineId, setAutoFocusLineId] = useState<string | null>(null);

  const originalDocumentRef = useRef<InvoiceComposerDocument | null>(null);
  const originalLinesRef = useRef<EstimateComposerLineRow[]>([]);
  const initializedForIdRef = useRef<string | null>(null);
  const lastAppliedPricingKeyRef = useRef<string | null>(null);
  const salesAgentPinnedRef = useRef<string | null>(null);

  const saveMutation = useSaveInvoiceComposer(workingId);
  const sendMutation = useSendInvoice(workingId);
  const buyerPickerQuery = useDocumentBuyerPicker(buyerQuery, buyerSearchOpen);
  const buyerContextQuery = useBuyerEstimateContext(documentState?.buyer_id ?? null);
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

  const prevEditInvoiceIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (mode !== 'edit' || !invoiceId) return;
    if (prevEditInvoiceIdRef.current === invoiceId) return;
    prevEditInvoiceIdRef.current = invoiceId;
    setWorkingId(invoiceId);
    initializedForIdRef.current = null;
    originalDocumentRef.current = null;
    originalLinesRef.current = [];
    setDocumentState(null);
    setLineState([]);
    setBuyerQuery('');
    setBuyerSearchOpen(false);
    setProductQuery('');
    setSearchOpen(false);
    setAutoSaveMeta({ label: 'Ready to save', tone: 'draft' });
  }, [mode, invoiceId]);

  useEffect(() => {
    if (mode !== 'create' || invoiceId || !nextInvoiceNumberQuery.data) return;
    setDocumentState((current) => current ? { ...current, invoice_number: nextInvoiceNumberQuery.data } : current);
  }, [invoiceId, mode, nextInvoiceNumberQuery.data]);

  useEffect(() => {
    if (!composerData) return;
    if (initializedForIdRef.current === composerData.id) return;

    if (mode === 'edit') {
      salesAgentPinnedRef.current = composerData.buyer_context?.sales_agent_name ?? null;
    }

    setDocumentState(composerData);
    const mappedLines = (composerData.items ?? []).map((line) => ({
      ...line,
      diff: 'clean' as const,
      line_total: computeLineTaxableAmount(line),
    }));
    setLineState(mappedLines);
    setPaymentTermsLabel(defaultPaymentTerms(composerData.buyer_context?.payment_terms_days ?? 0));
    setSendRecipient(composerData.buyer_context?.phone ?? composerData.buyer_context?.email ?? '');
    setSelectedPriceListId(composerData.buyer_context?.active_pricelist?.id ?? null);
    originalDocumentRef.current = composerData;
    originalLinesRef.current = mappedLines;
    initializedForIdRef.current = composerData.id;
    setAutoSaveMeta({
      label: mode === 'create' ? 'Not saved yet' : 'Draft saved',
      tone: mode === 'create' ? 'draft' : 'saved',
    });
  }, [composerData, mode, gstInclusive]);

  useEffect(() => {
    if (mode !== 'create' || invoiceId || originalDocumentRef.current) return;
    if (!documentState) return;

    originalDocumentRef.current = documentState;
    originalLinesRef.current = [];
  }, [documentState, invoiceId, mode]);

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
        return { ...next, line_total: computeLineTaxableAmount(next) };
      }),
    );
    lastAppliedPricingKeyRef.current = pricingKey;
  }, [documentState?.buyer_id, lineState.length, pricingQuery.data, selectedPriceListId]);

  const diffLines = useMemo(() => mapDiffLines(lineState, originalLinesRef.current), [lineState]);
  const totals = useMemo(
    () => computeTotals(
      diffLines,
      documentState?.discount_flat ?? 0,
      documentState?.freight ?? 0,
      documentState?.round_off ?? 0,
      gstInclusive,
    ),
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
      originalDoc: stagedSliceFromInvoice(orig),
      currentDoc: stagedSliceFromInvoice(documentState),
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
  const createModeLocationOptions = useMemo(
    () =>
      (tenantLocationsQuery.data?.locations ?? [])
        .filter((location) => location.deleted_at == null)
        .map((location) => ({
          id: location.id,
          name: location.name,
          is_default: location.is_default,
        })),
    [tenantLocationsQuery.data],
  );
  const availableLocationOptions = mode === 'create'
    ? createModeLocationOptions
    : ((documentState?.available_locations?.length ?? 0) > 0 ? (documentState?.available_locations ?? []) : createModeLocationOptions);
  const dirtyGuard = useDirtyCloseGuard({
    isDirty: dirty,
    onConfirmClose: () => { clearComposerDraft('invoice'); router.push(closeTarget); },
  });
  useEffect(() => {
    setAutoSaveMeta(dirty
      ? { label: 'Unsaved changes', tone: 'warning' }
      : { label: workingId ? 'Saved changes' : 'Not saved yet', tone: dirty ? 'warning' : 'saved' });
  }, [dirty, workingId]);

  useEffect(() => {
    if (mode !== 'create' || workingId || !documentState) return;
    saveComposerDraft('invoice', documentState, lineState);
  }, [documentState, lineState, mode, workingId]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  async function createDraftOnDemand(): Promise<InvoiceComposerDocument> {
    if (workingId && composerData) {
      return composerData;
    }

    const res = await apiPost('/api/tenant/invoices', {});
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Failed to create draft');
    }
    const json = (await res.json()) as { data: InvoiceComposerDocument };
    qc.setQueryData(['tenant-invoice-composer', json.data.id], json.data);
    clearComposerDraft('invoice');
    if (!isLeavingRef.current) {
      setWorkingId(json.data.id);
    }
    return json.data;
  }

  async function saveDocumentNow(
    nextDocument: InvoiceComposerDocument,
    nextLines: EstimateComposerLineRow[],
  ): Promise<InvoiceComposerDocument> {
    const created = !workingId ? await createDraftOnDemand() : null;
    const targetId = workingId ?? created?.id ?? null;
    if (!targetId) throw new Error('Missing invoice id');

    const payload = toSavePayload({
      ...nextDocument,
      id: targetId,
      invoice_number: created?.invoice_number ?? nextDocument.invoice_number,
    }, nextLines);

    if (workingId) {
      return new Promise<InvoiceComposerDocument>((resolve, reject) => {
        saveMutation.mutate(payload, {
          onSuccess: ({ data: saved }) => resolve(saved),
          onError: (mutationError) => reject(mutationError),
        });
      });
    }

    const res = await apiPatch(`/api/tenant/invoices/${targetId}`, { action: 'save', ...payload });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Failed to save invoice');
    }
    const json = (await res.json()) as { data: InvoiceComposerDocument };
    void qc.invalidateQueries({ queryKey: ['tenant-invoices'] });
    return json.data;
  }

  if (orderManagement === false || invoicesFlag === false) {
    return <FeatureDisabledState />;
  }

  if (isError) {
    if (error instanceof Error && error.message === 'forbidden') {
      return <PermissionDenied />;
    }
    return (
      <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6">
        <p className="text-base text-danger-700">{error instanceof Error ? error.message : 'Failed to load invoice composer.'}</p>
      </div>
    );
  }

  if (shouldBlockComposer(workingId, isLoading, Boolean(documentState))) {
    return <SharedDocumentComposerLoadingSkeleton />;
  }

  if (!documentState) {
    return <SharedDocumentComposerLoadingSkeleton />;
  }

  const buyer = documentState.buyer_context ?? buyerContextQuery.data ?? null;
  const activeLines = diffLines.filter((line) => line.diff !== 'removed');
  const primaryDisabled = !documentState.buyer_id || activeLines.length === 0;
  const overLimitBy = buyer ? totals.grand_total - buyer.credit_available : 0;
  const creditWarning = buyer && overLimitBy > 0
    ? `Over limit by ${formatNumberValue(overLimitBy, 'CURRENCY_EXACT')}.`
    : null;
  const isInterState = Boolean(
    buyer?.seller_state
    && buyer?.place_of_supply
    && buyer.seller_state.toLowerCase() !== buyer.place_of_supply.toLowerCase(),
  );

  function setDocumentPatch(patch: Partial<InvoiceComposerDocument>) {
    setDocumentState((current) => current ? { ...current, ...patch } : current);
  }

  function handleSelectBuyer(buyerId: string) {
    setSelectedPriceListId(null);
    setDocumentPatch({ buyer_id: buyerId, buyer_context: null });
    setBuyerQuery('');
    setProductQuery('');
    setSearchOpen(false);
    setBuyerSearchOpen(false);
  }

  function handleAddProduct(product: InvoiceComposerProductSearchRow) {
    const lineId = `draft-line-${Date.now()}-${product.tenant_product_id}`;
    setLineState((current) => [
      ...current,
      {
        id: lineId,
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
        line_total: computeLineTaxableAmount({ qty: 1, unit_price: product.unit_price, disc_pct: 0 }),
        scheme_tag: null,
        diff: 'added',
      },
    ]);
    setAutoFocusLineId(lineId);
  }

  function handleLineChange(lineId: string, patch: Partial<EstimateComposerLineRow>) {
    setLineState((current) =>
      current.map((line) => {
        if (line.id !== lineId) return line;
        const next = { ...line, ...patch };
        return { ...next, line_total: computeLineTaxableAmount(next) };
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
          line_total: computeLineTaxableAmount(next),
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
      router.push(`/invoices/${saved.id}`);
    } catch (mutationError) {
      resetLeaving();
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save invoice');
    }
  }

  async function handleSend() {
    if (!documentState || isLeavingRef.current) return;
    const hadWorkingId = Boolean(workingId);
    beginLeaving('send');
    try {
      const saved = await saveDocumentNow(documentState, diffLines);
      const targetId = saved.id;

      if (hadWorkingId) {
        sendMutation.mutate(undefined, {
          onSuccess: () => {
            setSendOpen(false);
            router.push(`/invoices/${targetId}`);
          },
          onError: () => {
            resetLeaving();
          },
        });
        return;
      }

      const res = await apiPatch(`/api/tenant/invoices/${targetId}`, { action: 'send' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to send invoice');
      }

      setSendOpen(false);
      void qc.invalidateQueries({ queryKey: ['tenant-invoices'] });
      router.push(`/invoices/${targetId}`);
    } catch (mutationError) {
      resetLeaving();
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save or send invoice');
    }
  }

  const footerLabel = composerSubmitFooterLabel(submitAction) ?? autoSaveMeta.label;
  const footerTone = submitAction ? 'pending' as const : autoSaveMeta.tone;

  return (
    <>
      <DocumentComposerShell
        mode={mode === 'edit' ? 'edit' : 'create'}
        kind="invoice"
        title={mode === 'edit' ? 'Edit invoice' : 'New invoice'}
        subtitle={buyer ? `${buyer.business_name} · ${buyer.place_of_supply}` : 'Pick a buyer to begin composing this invoice.'}
        status={{ label: 'Draft', tone: 'draft' }}
        titleActions={(
          <>
            {activeLines.length > 0 ? (
              <Button type="button" variant="outline" size="sm" className="gap-2">
                <Eye className="h-4 w-4" />
                Preview PDF
              </Button>
            ) : null}
            <Button type="button" variant="ghost" className="gap-2" disabled={isSubmitting} onClick={() => dirtyGuard.handleOpenChange(false)}>
              <X className="h-3.5 w-3.5" />
              Close
            </Button>
          </>
        )}
        onRequestClose={() => dirtyGuard.handleOpenChange(false)}
        body={(
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {documentState.buyer_id && buyerContextQuery.isLoading && !buyer ? (
              <BuyerCardLoading />
            ) : buyer ? (
              <DocumentCustomerStrip
                buyer={buyer}
                previewTotal={totals.grand_total}
                paymentTermsValue={paymentTermsLabel}
                mode="edit"
                placeOfSupplyValue={documentState.place_of_supply}
                onPlaceOfSupplyChange={(value) => setDocumentPatch({ place_of_supply: value })}
                priceListOptions={priceListOptionsQuery.data ?? []}
                selectedPriceListId={selectedPriceListId}
                onPriceListChange={setSelectedPriceListId}
                onChangeBuyer={() => {
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
            <DocumentBasicsStrip
              kind="invoice"
              docNumber={documentState.invoice_number}
              locationId={documentState.location_id}
              locationName={documentState.location_name}
              availableLocations={availableLocationOptions}
              dateIssued={documentState.invoice_date}
              secondDate={documentState.due_date ?? ''}
              buyerPoRef={documentState.buyer_po_ref}
              onDateIssuedChange={(value) => {
                setDocumentState((current) => {
                  if (!current) return current;
                  const bumped = bumpSecondDateAfterFirst(value, current.due_date ?? '');
                  return bumped
                    ? { ...current, invoice_date: value, due_date: bumped }
                    : { ...current, invoice_date: value };
                });
              }}
              onSecondDateChange={(value) => setDocumentPatch({ due_date: value || null })}
              onBuyerPoRefChange={(value) => setDocumentPatch({ buyer_po_ref: value })}
              onLocationChange={(value) => setDocumentPatch({ location_id: value })}
            />
            <LinesTable
              kind="invoice"
              buyerSelected={Boolean(documentState.buyer_id)}
              readOnly={false}
              lines={diffLines}
              productQuery={productQuery}
              productResults={filteredProductSearchResults}
              searchOpen={searchOpen}
              productSearchLoading={productSearchQuery.isLoading}
              productSearchFetchingNextPage={productSearchQuery.isFetchingNextPage}
              productSearchHasMore={productSearchQuery.hasNextPage}
              onProductSearchLoadMore={() => {
                if (productSearchQuery.hasNextPage && !productSearchQuery.isFetchingNextPage) {
                  void productSearchQuery.fetchNextPage();
                }
              }}
              notesExpanded={false}
              freightExpanded={false}
              internalExpanded={false}
              singleNoteMode
              title="Invoice lines"
              description="Search by product, SKU, or brand. Pricelist pricing is applied automatically."
              autoFocusLineId={autoFocusLineId}
              onAutoFocusHandled={() => setAutoFocusLineId(null)}
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
            <TotalsCard
              totals={totals}
              previousTotals={null}
              creditWarning={creditWarning}
              isInterState={isInterState}
              lineCount={activeLines.length}
              stagedChanges={stagedChangesRows}
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
              {submitAction === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {submitAction === 'save' ? 'Saving…' : 'Save & close'}
            </Button>
            <Button
              type="button"
              className={primaryDisabled && submitAction !== 'send' ? 'btn-disabled gap-2' : 'gap-2'}
              disabled={(primaryDisabled || isSubmitting) && submitAction !== 'send'}
              onClick={() => setSendOpen(true)}
            >
              {submitAction === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitAction === 'send' ? 'Sending…' : 'Send invoice'}
            </Button>
          </DocumentComposerFooterRow>
        )}
      />

      <DiscardChangesDialog
        open={dirtyGuard.discardOpen}
        onOpenChange={dirtyGuard.setDiscardOpen}
        onDiscard={dirtyGuard.confirmDiscard}
      />

      <Dialog open={sendOpen} onOpenChange={(open) => {
        if (isSubmitting) return;
        setSendOpen(open);
      }}
      >
        <DialogContent className="sm:max-w-[580px]">
          <DialogHeader>
            <DialogTitle>Send invoice</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex gap-2">
              {(['whatsapp', 'email', 'download'] as SendChannel[]).map((channel) => (
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
                <p className="mb-2 text-sm font-medium text-cream-800">Recipient</p>
                <Input value={sendRecipient} onChange={(event) => setSendRecipient(event.target.value)} />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-cream-800">Message</p>
                <textarea
                  value={sendMessage}
                  onChange={(event) => setSendMessage(event.target.value)}
                  className="min-h-[120px] w-full rounded-[12px] border border-cream-300 px-3 py-2 text-base outline-none"
                />
              </div>
              <div className="rounded-[12px] border border-cream-200 bg-cream-50 p-3 text-sm text-cream-700">
                Buyer sees {activeLines.length} lines totaling {formatNumberValue(totals.grand_total, 'CURRENCY_EXACT')}.
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => setSendOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="gap-2" disabled={isSubmitting} onClick={() => void handleSend()}>
              {submitAction === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitAction === 'send' ? 'Sending…' : 'Send now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { DocumentComposerLoadingSkeleton as InvoiceComposerLoadingSkeleton } from '@/components/seller/composer/DocumentComposerShell';
