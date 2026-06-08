'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, FileText, Mail, MessageCircle, Send, Trash2 } from 'lucide-react';
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
import { FEATURE_FLAGS } from '@/constants';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useCreateInvoiceDraft, useInvoiceComposer, useSaveInvoiceComposer, useSendInvoice } from '@/hooks/useInvoices';
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
import type { Database } from '@/types/database';
import type {
  InvoiceComposerBuyerContext,
  InvoiceComposerDocument,
  InvoiceComposerProductSearchRow,
  InvoiceComposerSavePayload,
  InvoiceComposerTotals,
} from '@/types/invoice-composer';
import { formatCompactInr } from '@/lib/utils';

const NEW_DRAFT_STORAGE_KEY = 'df:invoice-composer:new-draft';

type SendChannel = 'whatsapp' | 'email' | 'download';

type BuyerPickerRow = Pick<
  InvoiceComposerBuyerContext,
  'id' | 'business_name' | 'place_of_supply' | 'credit_used'
>;

function defaultPaymentTerms(days: number) {
  return days > 0 ? `Net ${days}` : 'Due on receipt';
}

function computeLineTotal(line: Pick<EstimateComposerLineRow, 'qty' | 'unit_price' | 'disc_pct' | 'tax_pct'>) {
  const taxable = line.qty * line.unit_price * (1 - line.disc_pct / 100);
  return Number((taxable + taxable * (line.tax_pct / 100)).toFixed(2));
}

function computeTotals(
  lines: EstimateComposerLineRow[],
  discountFlat: number,
  freight: number,
  roundOff: number,
): InvoiceComposerTotals {
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

export function InvoiceComposerLoadingSkeleton() {
  return (
    <div className="max-w-[1440px] mx-auto w-full px-8 py-6" role="status" aria-label="Loading invoice composer">
      <div className="space-y-4">
        <div className="rounded-[14px] border border-cream-300 bg-white px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-3 w-52 animate-pulse rounded bg-cream-200" />
            <div className="h-7 w-24 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
            <div className="h-7 w-20 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
            <div className="ml-auto flex items-center gap-3">
              <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
              <div className="h-9 w-24 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-44 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-72 animate-pulse rounded bg-cream-200" />
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

export function DocComposerInvoice({
  mode,
  invoiceId,
}: {
  mode: 'create' | 'edit';
  invoiceId?: string;
}) {
  const router = useRouter();
  const orderManagement = useFlagState('ORDER_MANAGEMENT');
  const invoicesFlag = useFlagState('INVOICES');

  const createDraftMutation = useCreateInvoiceDraft();
  const [workingId, setWorkingId] = useState<string | null>(invoiceId ?? null);
  const { data, isLoading, isError, error } = useInvoiceComposer(workingId);

  const [documentState, setDocumentState] = useState<InvoiceComposerDocument | null>(null);
  const [lineState, setLineState] = useState<EstimateComposerLineRow[]>([]);
  const [buyerQuery, setBuyerQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [paymentTermsLabel, setPaymentTermsLabel] = useState('Due on receipt');
  const [sendOpen, setSendOpen] = useState(false);
  const [sendChannel, setSendChannel] = useState<SendChannel>('whatsapp');
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendMessage, setSendMessage] = useState('Please review and pay this invoice.');
  const [autoSaveMeta, setAutoSaveMeta] = useState<{ label: string; tone: 'draft' | 'saved' | 'warning' }>({
    label: 'Draft created',
    tone: 'draft',
  });
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [freightExpanded, setFreightExpanded] = useState(false);
  const [internalExpanded, setInternalExpanded] = useState(false);

  const originalDocumentRef = useRef<InvoiceComposerDocument | null>(null);
  const originalLinesRef = useRef<EstimateComposerLineRow[]>([]);
  const initializedForIdRef = useRef<string | null>(null);
  const createDraftCalledRef = useRef(false);

  const saveMutation = useSaveInvoiceComposer(workingId);
  const sendMutation = useSendInvoice(workingId);
  const buyerPickerQuery = useBuyerPicker(buyerQuery);

  // Product search reuses the estimate endpoint — same tenant product catalogue
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
    if (mode !== 'create') return;
    if (invoiceId) return;
    if (workingId) return;
    if (createDraftCalledRef.current) return;

    const existingId = window.sessionStorage.getItem(NEW_DRAFT_STORAGE_KEY);
    if (existingId) {
      setWorkingId(existingId);
      return;
    }

    createDraftCalledRef.current = true;
    createDraftMutation.mutate(undefined, {
      onSuccess: ({ data: created }) => {
        window.sessionStorage.setItem(NEW_DRAFT_STORAGE_KEY, created.id);
        setWorkingId(created.id);
      },
      onError: (mutationError) => {
        createDraftCalledRef.current = false;
        toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to create draft');
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, invoiceId, workingId]);

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
      label: mode === 'create' ? 'Draft created' : 'Draft saved',
      tone: mode === 'create' ? 'draft' : 'saved',
    });
  }, [data, mode]);

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

  if (isLoading || createDraftMutation.isPending || !documentState) {
    return <InvoiceComposerLoadingSkeleton />;
  }

  const buyer = documentState.buyer_context ?? null;
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
    window.sessionStorage.removeItem(NEW_DRAFT_STORAGE_KEY);
    router.push('/invoices');
  }

  function handleSaveAndClose() {
    if (!documentState) return;
    saveMutation.mutate(toSavePayload(documentState, diffLines), {
      onSuccess: () => {
        window.sessionStorage.removeItem(NEW_DRAFT_STORAGE_KEY);
        router.push('/invoices');
      },
      onError: (mutationError) => {
        toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save invoice');
      },
    });
  }

  function handleSend() {
    if (!documentState) return;
    saveMutation.mutate(toSavePayload(documentState, diffLines), {
      onSuccess: () => {
        sendMutation.mutate(undefined, {
          onSuccess: () => {
            window.sessionStorage.removeItem(NEW_DRAFT_STORAGE_KEY);
            setSendOpen(false);
            router.push(`/invoices/${workingId}`);
          },
          onError: (mutationError) => {
            toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to send invoice');
          },
        });
      },
      onError: (mutationError) => {
        toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save before sending');
      },
    });
  }

  return (
    <>
      <DocComposerFrame
        mode={mode === 'edit' ? 'edit' : 'create'}
        kind="invoice"
        top={(
          <DocTop
            kind="invoice"
            docNumber={documentState.invoice_number}
            modeChip={{ tone: 'draft', label: 'Draft' }}
            autoSave={autoSaveMeta}
            onClose={() => router.push('/invoices')}
          />
        )}
        titleRow={(
          <DocTitleRow
            title={mode === 'edit' ? 'Edit invoice' : 'New invoice'}
            subtitle={buyer ? `${buyer.business_name} · ${buyer.place_of_supply}` : 'Pick a buyer to begin composing this invoice.'}
            rightActions={activeLines.length > 0 ? (
              <Button type="button" variant="outline" size="sm" className="gap-2">
                <Eye className="h-4 w-4" />
                Preview PDF
              </Button>
            ) : undefined}
          />
        )}
        strip={(
          <DocStrip
            kind="invoice"
            docNumber={documentState.invoice_number}
            dateIssued={documentState.invoice_date}
            validUntil={documentState.due_date ?? ''}
            buyerPoRef={documentState.buyer_po_ref}
            placeOfSupply={documentState.place_of_supply}
            placeOptions={['Delhi', 'Haryana', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Unknown']}
            onDocNumberChange={(value) => setDocumentPatch({ invoice_number: value })}
            onDateIssuedChange={(value) => setDocumentPatch({ invoice_date: value })}
            onValidUntilChange={(value) => setDocumentPatch({ due_date: value || null })}
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
        center={(
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
          <DocComposerFoot
            autoSaveLabel={autoSaveMeta.label}
            autoSaveTone={autoSaveMeta.tone}
            actions={(
              <>
                <Button type="button" variant="ghost" className="gap-2" onClick={handleDiscard}>
                  <Trash2 className="h-4 w-4" />
                  Discard draft
                </Button>
                <Button type="button" variant="outline" className="gap-2" onClick={handleSaveAndClose}>
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
              </>
            )}
          />
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
              onClick={handleSend}
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
