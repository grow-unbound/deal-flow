'use client';

import { Download, Eye, FileText, Loader2, Mail, MessageCircle, Send, Trash2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { FeatureDisabledState } from '@/components/FeatureGate';
import { PermissionDenied } from '@/components/auth/PermissionDenied';
import {
  ComposerSidebarCard,
} from '@/components/seller/composer/ComposerLayout';
import {
  DocumentBasicsStrip,
  DocumentComposerFooterRow,
} from '@/components/seller/composer/DocumentBasicsStrip';
import { DocumentComposerLoadingSkeleton, DocumentComposerShell } from '@/components/seller/composer/DocumentComposerShell';
import {
  BuyerCardEmpty,
  BuyerCardFilled,
  BuyerCardLoading,
  DocumentMetaCard,
  LinesTable,
  TotalsCard,
  type EstimateComposerLineRow,
} from '@/components/seller/document-composer';
import { FEATURE_FLAGS } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import { useTenantLocations } from '@/hooks/useTenantLocations';
import { composerSubmitFooterLabel, useComposerLeaveGuard } from '@/hooks/useComposerLeaveGuard';
import { useDocumentBuyerPicker } from '@/hooks/useDocumentBuyerPicker';
import {
  useBuyerEstimateContext,
  useEstimateComposer,
  useEstimatePriceListOptions,
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
import { apiPatch, apiPost } from '@/lib/api-fetch';
import type {
  EstimateComposerBuyerContext,
  EstimateComposerDocument,
  EstimateComposerProductSearchRow,
  EstimateComposerSavePayload,
  EstimateSendChannel,
} from '@/types/estimate-composer';
import { bumpSecondDateAfterFirst } from '@/lib/date-utils';
import {
  buildComposerStagedChanges,
  stagedSliceFromEstimate,
} from '@/lib/documents/composer-staged-changes';
import {
  computeTotals,
  defaultPaymentTerms,
} from '@/lib/documents/composer-math';
import { computeLineTaxableAmount } from '@/lib/gst';
import { isoDateInTimeZone, offsetIsoDateInTimeZone } from '@/lib/date-utils';
import { formatCompactInr } from '@/lib/utils';

const BASE_PRICING_OPTION = '__base__';

function buildNewEstimateDraft(estimateNumber = 'Estimating next number...'): EstimateComposerDocument {
  return {
    id: '',
    estimate_number: estimateNumber,
    status: 'draft',
    buyer_id: null,
    location_id: null,
    location_name: null,
    available_locations: [],
    estimate_date: isoDateInTimeZone(new Date()),
    valid_until: offsetIsoDateInTimeZone(new Date(), 14),
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
    estimate_version: 1,
    viewed_at: null,
    viewed_by_name: null,
    voided_at: null,
    converted_to_order_id: null,
    linked_order_number: null,
  };
}

function snapshotPayload(document: EstimateComposerDocument, lines: EstimateComposerLineRow[]) {
  return JSON.stringify({
    estimate_number: document.estimate_number,
    buyer_id: document.buyer_id,
    location_id: document.location_id,
    estimate_date: document.estimate_date,
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
    location_id: document.location_id,
    estimate_date: document.estimate_date,
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

export function DocComposerEstimate({
  mode,
  estimateId,
}: {
  mode: 'create' | 'edit';
  estimateId?: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { isLeavingRef, beginLeaving, resetLeaving, shouldBlockComposer, isSubmitting, submitAction } = useComposerLeaveGuard();
  const { user } = useAuth();
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const estimatesFlag = useFlagState('ESTIMATES');
  const { data: tenantSettings } = useTenantSettings();
  const tenantLocationsQuery = useTenantLocations();
  const gstInclusive = tenantSettings?.unified.business_policy.gst_inclusive ?? false;

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
  const [paymentTermsLabel, setPaymentTermsLabel] = useState('Not defined');
  const [sendOpen, setSendOpen] = useState(false);
  const [sendChannel, setSendChannel] = useState<EstimateSendChannel>('whatsapp');
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendMessage, setSendMessage] = useState('Please review this estimate.');
  const [autoSaveMeta, setAutoSaveMeta] = useState<{ label: string; tone: 'draft' | 'saved' | 'warning' }>({
    label: mode === 'create' ? 'Not saved yet' : 'Ready to save',
    tone: 'draft',
  });
  const [selectedPriceListId, setSelectedPriceListId] = useState<string | null>(null);
  const [autoFocusLineId, setAutoFocusLineId] = useState<string | null>(null);

  const originalDocumentRef = useRef<EstimateComposerDocument | null>(null);
  const originalLinesRef = useRef<EstimateComposerLineRow[]>([]);
  const initializedForIdRef = useRef<string | null>(null);
  const lastAppliedPricingKeyRef = useRef<string | null>(null);
  const salesAgentPinnedRef = useRef<string | null>(null);

  const saveMutation = useSaveEstimateComposer(workingId);
  const sendMutation = useSendEstimate(workingId);
  const buyerContextQuery = useBuyerEstimateContext(documentState?.buyer_id ?? null);
  const productSearchQuery = useEstimateProductSearch(productQuery, documentState?.buyer_id ?? null, searchOpen, selectedPriceListId);
  const buyerPickerQuery = useDocumentBuyerPicker(buyerQuery, buyerSearchOpen);
  const priceListOptionsQuery = useEstimatePriceListOptions(Boolean(documentState));
  const pricingQuery = useEstimateProductPricing(
    documentState?.buyer_id ?? null,
    lineState.filter((line) => line.diff !== 'removed').map((line) => line.tenant_product_id),
    selectedPriceListId,
  );
  const closeTarget = mode === 'edit' && estimateId ? `/estimates/${estimateId}` : '/estimates';

  const prevEditEstimateIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (mode !== 'edit' || !estimateId) return;
    if (prevEditEstimateIdRef.current === estimateId) return;
    prevEditEstimateIdRef.current = estimateId;
    setWorkingId(estimateId);
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
  }, [mode, estimateId]);

  useEffect(() => {
    if (mode !== 'create' || estimateId || !nextEstimateNumberQuery.data) return;
    setDocumentState((current) => current ? { ...current, estimate_number: nextEstimateNumberQuery.data } : current);
  }, [estimateId, mode, nextEstimateNumberQuery.data]);

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
      line_total: computeLineTaxableAmount(line),
    }));
    setLineState(mappedLines);
    setPaymentTermsLabel(defaultPaymentTerms(data.buyer_context?.payment_terms_days ?? 0));
    setSendRecipient(data.buyer_context?.phone ?? data.buyer_context?.email ?? '');
    setSelectedPriceListId(data.buyer_context?.active_pricelist?.id ?? null);
    originalDocumentRef.current = data;
    originalLinesRef.current = mappedLines;
    initializedForIdRef.current = data.id;
    setAutoSaveMeta({
      label: mode === 'create' ? 'Saved draft' : 'Saved changes',
      tone: 'saved',
    });
  }, [data, mode]);

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
      buyer_context: {
        ...nextContext,
        sales_agent_name:
          mode === 'edit'
            ? (salesAgentPinnedRef.current ?? nextContext.sales_agent_name)
            : (user?.displayName ?? nextContext.sales_agent_name),
      },
    }) : current);
    setPaymentTermsLabel(defaultPaymentTerms(nextContext.payment_terms_days));
    setSendRecipient(nextContext.phone ?? nextContext.email ?? '');
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
    [documentState?.id],
  );
  const stagedChangesRows = useMemo(() => {
    if (!documentState) return undefined;
    const orig = originalDocumentRef.current;
    const origTotals = originalTotalsSnapshot;
    if (!orig || !origTotals) return undefined;
    return buildComposerStagedChanges({
      mode,
      dirty,
      originalDoc: stagedSliceFromEstimate(orig),
      currentDoc: stagedSliceFromEstimate(documentState),
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
    : (documentState?.available_locations ?? []);
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
    qc.setQueryData(['tenant-estimate-composer', json.data.id], json.data);
    if (!isLeavingRef.current) {
      setWorkingId(json.data.id);
    }
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
      return <PermissionDenied />;
    }
    return (
      <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6">
        <p className="text-base text-danger-700">{error instanceof Error ? error.message : 'Failed to load estimate composer.'}</p>
      </div>
    );
  }

  if (shouldBlockComposer(workingId, isLoading, Boolean(documentState))) {
    return <DocumentComposerLoadingSkeleton />;
  }

  if (!documentState) {
    return <DocumentComposerLoadingSkeleton />;
  }

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
        return {
          ...next,
          line_total: computeLineTaxableAmount(next),
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
      router.push(`/estimates/${saved.id}`);
    } catch (mutationError) {
      resetLeaving();
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save estimate');
    }
  }

  async function handleSend() {
    if (!documentState || isLeavingRef.current) return;
    const hadWorkingId = Boolean(workingId);
    beginLeaving('send');
    try {
      const saved = await saveDocumentNow(documentState, diffLines);
      const targetId = saved.id;

      const sendPayload = {
        channel: sendChannel,
        recipient: sendRecipient,
        message: sendMessage,
      };

      if (hadWorkingId) {
        sendMutation.mutate(sendPayload, {
          onSuccess: () => {
            setSendOpen(false);
            router.push(`/estimates/${targetId}`);
          },
          onError: () => {
            resetLeaving();
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
      resetLeaving();
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to send estimate');
    }
  }

  const footerLabel = composerSubmitFooterLabel(submitAction) ?? autoSaveMeta.label;
  const footerTone = submitAction ? 'pending' as const : autoSaveMeta.tone;
  const sendPrimaryLabel = mode === 'edit' ? 'Save & resend' : 'Send estimate';

  return (
    <>
      <DocumentComposerShell
        mode={mode === 'edit' ? 'edit' : 'create'}
        kind="estimate"
        breadcrumbItems={[
          { label: 'Sales' },
          { label: 'Estimates', href: '/estimates' },
          {
            label: mode === 'edit' ? documentState.estimate_number : 'Add an estimate',
            current: true,
          },
        ]}
        title={mode === 'edit' ? 'Edit estimate' : 'Add an estimate'}
        subtitle={buyer ? `${buyer.business_name} · ${buyer.place_of_supply}` : 'Pick a buyer to begin composing this estimate.'}
        status={
          mode === 'edit' && documentState.status === 'sent'
            ? { label: 'Editing live draft', tone: 'live' }
            : { label: 'Draft', tone: 'draft' }
        }
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
            kind="estimate"
            docNumber={documentState.estimate_number}
            locationId={documentState.location_id}
            locationName={documentState.location_name}
            availableLocations={availableLocationOptions}
            dateIssued={documentState.estimate_date}
            secondDate={documentState.valid_until}
            buyerPoRef={documentState.buyer_po_ref}
            onDateIssuedChange={(value) => {
              setDocumentState((current) => {
                if (!current) return current;
                const bumped = bumpSecondDateAfterFirst(value, current.valid_until);
                return bumped
                  ? { ...current, estimate_date: value, valid_until: bumped }
                  : { ...current, estimate_date: value };
              });
            }}
            onSecondDateChange={(value) => setDocumentPatch({ valid_until: value })}
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
                  buyer={buyer}
                  previewTotal={totals.grand_total}
                  paymentTermsValue={paymentTermsLabel}
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
              <DocumentMetaCard
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
            title="Estimate lines"
            description="Search and add Products to this estimate"
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
        )}
        right={(
          <div className="space-y-4">
            <TotalsCard
              title="Estimate summary"
              totals={totals}
              previousTotals={null}
              creditWarning={creditWarning}
              isInterState={isInterState}
              lineCount={activeLines.length}
              stagedChanges={stagedChangesRows}
              stagedCallout={
                mode === 'edit' && dirty && documentState.status === 'sent' ? (
                  <span>Saving these edits stages a new version before the estimate is re-sent.</span>
                ) : undefined
              }
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
              {submitAction === 'send' ? 'Sending…' : sendPrimaryLabel}
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
                Buyer sees {diffLines.filter((line) => line.diff !== 'removed').length} lines totaling {formatCompactInr(totals.grand_total)}.
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

export { DocumentComposerLoadingSkeleton as EstimateComposerLoadingSkeleton } from '@/components/seller/composer/DocumentComposerShell';
