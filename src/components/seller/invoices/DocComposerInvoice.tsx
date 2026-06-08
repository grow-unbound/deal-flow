'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileText, Mail, MessageCircle, Send, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { FeatureDisabledState } from '@/components/FeatureGate';
import { ComposerSidebarCard } from '@/components/seller/composer/ComposerLayout';
import {
  DocumentBasicsStrip,
  DocumentComposerFooterRow,
} from '@/components/seller/composer/DocumentBasicsStrip';
import { DocumentComposerShell, DocumentComposerLoadingSkeleton } from '@/components/seller/composer/DocumentComposerShell';
import {
  BuyerCardEmpty,
  BuyerCardFilled,
  InsightsCard,
  LinesTable,
  TotalsCard,
  type EstimateComposerLineRow,
} from '@/components/seller/document-composer';
import { FEATURE_FLAGS } from '@/constants';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useBuyerEstimateContext } from '@/hooks/useEstimates';
import { useInvoiceComposer, useNextInvoiceNumber, useSaveInvoiceComposer, useSendInvoice } from '@/hooks/useInvoices';
import { useDebounce } from '@/hooks/useDebounce';
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
import { apiPatch, apiPost } from '@/lib/api-fetch';
import type { Database } from '@/types/database';
import type {
  InvoiceComposerBuyerContext,
  InvoiceComposerDocument,
  InvoiceComposerProductSearchRow,
  InvoiceComposerSavePayload,
} from '@/types/invoice-composer';
import { computeLineTotal, computeTotals, defaultPaymentTerms } from '@/lib/documents/composer-math';
import { formatCompactInr } from '@/lib/utils';

type SendChannel = 'whatsapp' | 'email' | 'download';

type BuyerPickerRow = Pick<
  InvoiceComposerBuyerContext,
  'id' | 'business_name' | 'place_of_supply' | 'credit_used'
>;

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function buildNewInvoiceDraft(invoiceNumber = 'Reserving next number...'): InvoiceComposerDocument {
  return {
    id: '',
    invoice_number: invoiceNumber,
    status: 'draft',
    buyer_id: null,
    invoice_date: isoToday(),
    due_date: null,
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
    order_id: null,
    estimate_id: null,
    linked_order_number: null,
    linked_estimate_number: null,
  };
}

function snapshotPayload(document: InvoiceComposerDocument, lines: EstimateComposerLineRow[]) {
  return JSON.stringify({
    invoice_number: document.invoice_number,
    buyer_id: document.buyer_id,
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

function useBuyerPicker(query: string) {
  const debounced = useDebounce(query, 200);
  return useQuery({
    queryKey: ['invoice-buyer-picker', debounced],
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

export function DocComposerInvoice({
  mode,
  invoiceId,
}: {
  mode: 'create' | 'edit';
  invoiceId?: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const invoicesFlag = useFlagState('INVOICES');

  const [workingId, setWorkingId] = useState<string | null>(invoiceId ?? null);
  const { data, isLoading, isError, error } = useInvoiceComposer(workingId);
  const nextInvoiceNumberQuery = useNextInvoiceNumber(mode === 'create' && !invoiceId);

  const [documentState, setDocumentState] = useState<InvoiceComposerDocument | null>(() => (
    mode === 'create' && !invoiceId ? buildNewInvoiceDraft() : null
  ));
  const [lineState, setLineState] = useState<EstimateComposerLineRow[]>([]);
  const [buyerQuery, setBuyerQuery] = useState('');
  const [buyerSearchOpen, setBuyerSearchOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [paymentTermsLabel, setPaymentTermsLabel] = useState('Due on receipt');
  const [sendOpen, setSendOpen] = useState(false);
  const [sendChannel, setSendChannel] = useState<SendChannel>('whatsapp');
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendMessage, setSendMessage] = useState('Please review and pay this invoice.');
  const [autoSaveMeta, setAutoSaveMeta] = useState<{ label: string; tone: 'draft' | 'saved' | 'warning' }>({
    label: mode === 'create' ? 'Not saved yet' : 'Ready to save',
    tone: 'draft',
  });
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [freightExpanded, setFreightExpanded] = useState(false);
  const [internalExpanded, setInternalExpanded] = useState(false);

  const originalDocumentRef = useRef<InvoiceComposerDocument | null>(null);
  const originalLinesRef = useRef<EstimateComposerLineRow[]>([]);
  const initializedForIdRef = useRef<string | null>(null);

  const saveMutation = useSaveInvoiceComposer(workingId);
  const sendMutation = useSendInvoice(workingId);
  const buyerPickerQuery = useBuyerPicker(buyerQuery);
  const buyerContextQuery = useBuyerEstimateContext(documentState?.buyer_id ?? null);

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

  const productSearchQuery = useQuery({
    queryKey: ['invoice-product-search', productQuery, documentState?.buyer_id ?? null],
    queryFn: async (): Promise<InvoiceComposerProductSearchRow[]> => {
      const params = new URLSearchParams({ q: productQuery });
      if (documentState?.buyer_id) params.set('buyerId', documentState.buyer_id);
      const res = await fetch(`/api/tenant/products/search?${params.toString()}`);
      if (!res.ok) return [];
      const json = (await res.json()) as { products: InvoiceComposerProductSearchRow[] };
      return json.products;
    },
    enabled: productQuery.trim().length >= 1 && Boolean(documentState?.buyer_id),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (mode !== 'create' || invoiceId || !nextInvoiceNumberQuery.data) return;
    setDocumentState((current) => current ? { ...current, invoice_number: nextInvoiceNumberQuery.data } : current);
  }, [invoiceId, mode, nextInvoiceNumberQuery.data]);

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
    setSendRecipient(data.buyer_context?.phone ?? data.buyer_context?.email ?? '');
    originalDocumentRef.current = data;
    originalLinesRef.current = mappedLines;
    initializedForIdRef.current = data.id;
    setAutoSaveMeta({
      label: mode === 'create' ? 'Not saved yet' : 'Draft saved',
      tone: mode === 'create' ? 'draft' : 'saved',
    });
  }, [data, mode]);

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

  const diffLines = useMemo(() => mapDiffLines(lineState, originalLinesRef.current), [lineState]);
  const totals = useMemo(
    () => computeTotals(
      diffLines,
      documentState?.discount_flat ?? 0,
      documentState?.freight ?? 0,
      documentState?.round_off ?? 0,
    ),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documentState?.id],
  );
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

  async function createDraftOnDemand(): Promise<InvoiceComposerDocument> {
    if (workingId && data) {
      return data;
    }

    const res = await apiPost('/api/tenant/invoices', {});
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Failed to create draft');
    }
    const json = (await res.json()) as { data: InvoiceComposerDocument };
    qc.setQueryData(['tenant-invoice-composer', json.data.id], json.data);
    setWorkingId(json.data.id);
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
      return <FeatureDisabledState />;
    }
    return (
      <div className="max-w-[1920px] mx-auto w-full px-8 pt-7 pb-6">
        <p className="text-[13px] text-danger-700">{error instanceof Error ? error.message : 'Failed to load invoice composer.'}</p>
      </div>
    );
  }

  if ((workingId && isLoading) || !documentState) {
    return <DocumentComposerLoadingSkeleton />;
  }

  const buyer = documentState.buyer_context ?? buyerContextQuery.data ?? null;
  const recentBuyers = buyerPickerQuery.data ?? [];
  const activeLines = diffLines.filter((line) => line.diff !== 'removed');
  const primaryDisabled = !documentState.buyer_id || activeLines.length === 0;
  const overLimitBy = buyer ? totals.grand_total - buyer.credit_available : 0;
  const creditWarning = buyer && overLimitBy > 0
    ? `Over limit by ${formatCompactInr(overLimitBy)}.`
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
    setDocumentPatch({ buyer_id: buyerId, buyer_context: null });
    setBuyerQuery('');
    setProductQuery('');
    setSearchOpen(false);
    setBuyerSearchOpen(false);
  }

  function handleAddProduct(product: InvoiceComposerProductSearchRow) {
    setLineState((current) => {
      const existing = current.find(
        (line) => line.tenant_product_id === product.tenant_product_id && line.diff !== 'removed',
      );
      if (existing) {
        return current.map((line) =>
          line.id === existing.id
            ? { ...line, qty: line.qty + 1, line_total: computeLineTotal({ ...line, qty: line.qty + 1 }) }
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
        return { ...next, line_total: computeLineTotal(next) };
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
    router.push('/invoices');
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
      setAutoSaveMeta({ label: 'Draft saved just now', tone: 'saved' });
      router.push('/invoices');
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save invoice');
    }
  }

  async function handleSend() {
    if (!documentState) return;
    const hadWorkingId = Boolean(workingId);
    try {
      const saved = await saveDocumentNow(documentState, diffLines);
      const targetId = saved.id;
      setWorkingId(targetId);
      setDocumentState(saved);
      originalDocumentRef.current = saved;
      originalLinesRef.current = saved.items.map((line) => ({
        ...line,
        diff: 'clean' as const,
        line_total: computeLineTotal(line),
      }));
      setLineState(originalLinesRef.current);

      if (hadWorkingId) {
        sendMutation.mutate(undefined, {
          onSuccess: () => {
            setSendOpen(false);
            router.push(`/invoices/${targetId}`);
          },
          onError: (mutationError) => {
            toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to send invoice');
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
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save or send invoice');
    }
  }

  return (
    <>
      <DocumentComposerShell
        mode={mode === 'edit' ? 'edit' : 'create'}
        kind="invoice"
        breadcrumbItems={[
          { label: 'Sales' },
          { label: 'Invoices', href: '/invoices' },
          {
            label: mode === 'edit' ? documentState.invoice_number : 'New invoice',
            current: true,
          },
        ]}
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
            <Button type="button" variant="ghost" className="gap-2" onClick={() => router.push('/invoices')}>
              <X className="h-3.5 w-3.5" />
              Close
            </Button>
          </>
        )}
        basics={(
          <DocumentBasicsStrip
            kind="invoice"
            docNumber={documentState.invoice_number}
            dateIssued={documentState.invoice_date}
            secondDate={documentState.due_date ?? ''}
            buyerPoRef={documentState.buyer_po_ref}
            placeOfSupply={documentState.place_of_supply}
            onDateIssuedChange={(value) => setDocumentPatch({ invoice_date: value })}
            onSecondDateChange={(value) => setDocumentPatch({ due_date: value || null })}
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
            kind="invoice"
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
              creditWarning={creditWarning}
              isInterState={isInterState}
              lineCount={activeLines.length}
            />
            <InsightsCard buyer={buyer} expiringSoon={false} />
          </div>
        )}
        footer={(
          <DocumentComposerFooterRow autoSaveLabel={autoSaveMeta.label} autoSaveTone={autoSaveMeta.tone}>
            <Button type="button" variant="ghost" className="gap-2" onClick={handleDiscard}>
              <Trash2 className="h-4 w-4" />
              Discard draft
            </Button>
            <Button type="button" variant="outline" className="gap-2" onClick={() => void handleSaveAndClose()}>
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
              Send invoice
            </Button>
          </DocumentComposerFooterRow>
        )}
      />

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
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
                Buyer sees {activeLines.length} lines totaling {formatCompactInr(totals.grand_total)}.
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSendOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={sendMutation.isPending || saveMutation.isPending}
              onClick={() => void handleSend()}
            >
              <Send className="h-4 w-4" />
              Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { DocumentComposerLoadingSkeleton as InvoiceComposerLoadingSkeleton } from '@/components/seller/composer/DocumentComposerShell';
