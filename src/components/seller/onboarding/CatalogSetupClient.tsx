'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, PartyPopper, Store, Upload } from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { CatalogSetupChrome, CatalogSetupNav } from '@/components/seller/onboarding/CatalogSetupChrome';
import { OnboardingPreviewFrame } from '@/components/seller/onboarding/OnboardingPreviewFrame';
import { OnboardingReviewPanel } from '@/components/seller/onboarding/OnboardingReviewPanel';
import { useTenant } from '@/contexts/TenantContext';
import { apiFetch, apiPatch, apiPost } from '@/lib/api-fetch';
import { parseSpreadsheetFile } from '@/lib/onboarding/spreadsheet-parse';
import {
  applyMappings,
  buildColumnMappings,
  duplicateYuktiFields,
  hashHeaderRow,
  isOverriddenMapping,
  mappingsToRecord,
  missingEssentialFields,
  reassignMappingField,
  yuktiFieldLabel,
} from '@/lib/onboarding/column-mapping';
import { mapRawRowToImport } from '@/lib/onboarding/import-rows';
import {
  collectDataTransferFiles,
  extractPhotoFiles,
  filesToPhotoEntries,
  folderNameFromPhotoEntries,
  snapshotFileList,
  folderUploadDialogCopy,
  matchPhotosToCandidates,
} from '@/lib/onboarding/photo-match';
import { uploadMatchedPhotos } from '@/lib/onboarding/upload-matched-photos';
import { filterReviewAnomalies, reviewCountLabel, reviewRowKey } from '@/lib/onboarding/review-anomalies';
import { ONBOARDING_YUKTI_FIELDS, type ColumnMappingEntry, type ImportAnomaly, type OnboardingYuktiFieldOption } from '@/lib/onboarding/types';
import { cn } from '@/lib/utils';
import type { CatalogPricingMode } from '@/lib/server/public-catalog';
import type { BuyerBrand, BuyerCatalogItem, BuyerCategory } from '@/types/buyer';
import {
  applyOnboardingPreviewPrices,
  assignedPricesFromPreviewItems,
  needsAssignedPriceFetch,
  type AssignedPriceMap,
} from '@/lib/onboarding/preview-pricing';

const ONBOARDING_TITLE_CLASS = 'font-display text-h2 font-medium text-cream-900';
const CHUNK = 120;

type WizardStep = 1 | 2 | 'done';

interface PreviewState {
  productCount: number;
  items: BuyerCatalogItem[];
  brands: BuyerBrand[];
  categories: BuyerCategory[];
  anomalies: ImportAnomaly[];
  slug: string;
  businessName: string;
  live: boolean;
  priceLists: Array<{ id: string; name: string }>;
  photoTargets: Array<{
    key: string;
    entityId: string;
    entityType: 'tenant_product' | 'tenant_brand' | 'tenant_category';
    label: string;
  }>;
}

export function CatalogSetupClient(): React.ReactNode {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const [step, setStep] = useState<WizardStep>(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = useState<ColumnMappingEntry[]>([]);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [catalogCount, setCatalogCount] = useState<number | null>(null);
  const [slug, setSlug] = useState('');
  const [pricingMode, setPricingMode] = useState<CatalogPricingMode | ''>('');
  const [priceListId, setPriceListId] = useState<string>('');
  const [assignedByList, setAssignedByList] = useState<Record<string, AssignedPriceMap>>({});
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [unmatchedPhotos, setUnmatchedPhotos] = useState(0);
  const [matchedPhotos, setMatchedPhotos] = useState(0);
  const [pendingFolderUpload, setPendingFolderUpload] = useState<{
    folderName: string;
    fileCount: number;
    entries: Array<{ file: File; relativePath: string }>;
  } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [liveUrl, setLiveUrl] = useState('');
  const [fileStashed, setFileStashed] = useState(false);
  const [mobilePane, setMobilePane] = useState<'settings' | 'preview' | 'review'>('settings');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [ignoredReviewKeys, setIgnoredReviewKeys] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const bindFolderInput = useCallback((el: HTMLInputElement | null) => {
    folderInputRef.current = el;
    if (!el) return;
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('directory', '');
    el.setAttribute('mozdirectory', '');
  }, []);

  useEffect(() => {
    if (currentTenant?.public_catalog_live) {
      router.replace('/dashboard');
    }
  }, [currentTenant?.public_catalog_live, router]);

  const loadPreview = useCallback(async (assignedListId?: string) => {
    const params = new URLSearchParams();
    if (assignedListId) {
      params.set('pricing_mode', 'assigned_price_list');
      params.set('price_list_id', assignedListId);
    }
    const res = await apiFetch(`/api/tenant/onboarding/catalog?${params.toString()}`, { fresh: true });
    if (!res.ok) throw new Error('Failed to load preview');
    const data = (await res.json()) as PreviewState;
    setPreview(data);
    setCatalogCount(data.productCount);
    setSlug((prev) => prev || data.slug);
    if (assignedListId) {
      setAssignedByList((prev) => ({
        ...prev,
        [assignedListId]: assignedPricesFromPreviewItems(data.items),
      }));
    }
    return data;
  }, []);

  const loadSummary = useCallback(async () => {
    const res = await apiFetch('/api/tenant/onboarding/catalog?summary=1', { fresh: true });
    if (!res.ok) throw new Error('Failed to load catalog summary');
    const data = (await res.json()) as { productCount: number; slug: string; businessName: string };
    setCatalogCount(data.productCount);
    setSlug((prev) => prev || data.slug);
  }, []);

  useEffect(() => {
    void loadSummary().catch(() => setCatalogCount(0));
  }, [loadSummary]);

  useEffect(() => {
    if (step !== 2) return;
    void loadPreview().catch(() => undefined);
  }, [step, loadPreview]);

  async function handleFile(file: File) {
    try {
      const parsed = await parseSpreadsheetFile(file);
      if (parsed.rowCount === 0) {
        toast.error('No rows found in that file');
        return;
      }
      const built = buildColumnMappings(parsed.headers, parsed.rows[0] ?? {});
      const hash = await hashHeaderRow(parsed.headers);
      const saved = await apiFetch(`/api/tenant/onboarding/column-map?hash=${hash}`);
      if (saved.ok) {
        const json = (await saved.json()) as { mapping: Record<string, OnboardingYuktiFieldOption> | null };
        if (json.mapping) {
          const used = new Set<string>();
          setMappings(
            built.map((entry) => {
              const savedField = json.mapping?.[entry.sourceHeader] ?? entry.yuktiField;
              if (savedField === 'unmapped' || used.has(savedField)) {
                return { ...entry, yuktiField: 'unmapped' as const };
              }
              used.add(savedField);
              return { ...entry, yuktiField: savedField };
            }),
          );
        } else {
          setMappings(built);
        }
      } else {
        setMappings(built);
      }
      setFileName(file.name);
      setRowCount(parsed.rowCount);
      setRawRows(parsed.rows);
      setFileStashed(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read file');
    }
  }

  function stashFileForReupload() {
    setFileStashed(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function assignMapping(index: number, next: OnboardingYuktiFieldOption) {
    const previousOwner = next !== 'unmapped'
      ? mappings.find((row, i) => i !== index && row.yuktiField === next)
      : undefined;
    setMappings((prev) => reassignMappingField(prev, index, next));
    if (previousOwner) {
      toast.message(`${yuktiFieldLabel(next as typeof ONBOARDING_YUKTI_FIELDS[number])} moved off ${previousOwner.sourceHeader}`);
    }
  }

  async function runImport() {
    if (duplicateYuktiFields(mappings).length > 0) {
      toast.error('Each Yukti field can only be mapped once');
      return;
    }
    const mapped = applyMappings(rawRows, mappings).map(mapRawRowToImport).filter((row): row is NonNullable<typeof row> => row != null);
    if (mapped.length === 0) {
      toast.error('Map at least SKU so we can import rows');
      return;
    }
    const hash = await hashHeaderRow(mappings.map((m) => m.sourceHeader));
    await apiFetch('/api/tenant/onboarding/column-map', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ header_hash: hash, mapping: mappingsToRecord(mappings) }),
    });

    let imported = 0;
    let updated = 0;
    let failed = 0;
    for (let i = 0; i < mapped.length; i += CHUNK) {
      const chunk = mapped.slice(i, i + CHUNK);
      setImportProgress(`Imported ${Math.min(i, mapped.length)} / ${mapped.length}`);
      const res = await apiPost('/api/tenant/onboarding/import', { products: chunk });
      if (!res.ok) {
        toast.error('Import chunk failed — continuing with remaining rows');
        failed += chunk.length;
        continue;
      }
      const json = (await res.json()) as { imported: number; updated: number; failed: number };
      imported += json.imported;
      updated += json.updated;
      failed += json.failed;
      setImportProgress(`Imported ${Math.min(i + chunk.length, mapped.length)} / ${mapped.length} · ${failed} failed`);
    }
    setImportProgress(null);
    toast.success(`Imported ${imported}, updated ${updated}`);
    setAssignedByList({});
    await loadPreview();
    setStep(2);
  }

  async function queuePhotoUpload(entries: Array<{ file: File; relativePath: string }>) {
    if (entries.length === 0) {
      toast.message('No files in that folder');
      return;
    }
    setPendingFolderUpload({
      folderName: folderNameFromPhotoEntries(entries),
      fileCount: entries.length,
      entries,
    });
  }

  async function pickPhotoFolder() {
    folderInputRef.current?.click();
  }

  async function handleDroppedPhotos(dataTransfer: DataTransfer) {
    const entries = await collectDataTransferFiles(dataTransfer);
    await queuePhotoUpload(entries);
  }

  async function handlePhotos(fileList: FileList | Array<{ file: File; relativePath: string }> | null) {
    if (!fileList || !preview || !currentTenant?.id) return;
    const photos = extractPhotoFiles(fileList);
    const results = matchPhotosToCandidates(photos, preview.photoTargets);
    const matched = results.filter((r) => r.candidate);
    setMatchedPhotos(matched.length);
    setUnmatchedPhotos(results.length - matched.length);
    if (matched.length === 0) {
      toast.message('No filename matches yet — review unmatched files');
      return;
    }
    setPhotoStatus(`Uploading 0 / ${matched.length}`);
    const outcome = await uploadMatchedPhotos({
      matches: matched,
      tenantId: currentTenant.id,
      onProgress: (done, total) => setPhotoStatus(`Uploading ${done} / ${total}`),
    });
    setPhotoStatus(`Uploaded ${outcome.uploaded} · ${outcome.failed} failed`);
    await loadPreview();
  }

  async function publish() {
    if (!pricingMode) {
      toast.error('Pick a pricing visibility option');
      return;
    }
    setPublishing(true);
    try {
      const res = await apiPatch('/api/tenant/onboarding/catalog', {
        slug,
        pricing_mode: pricingMode,
        price_list_id: pricingMode === 'assigned_price_list' ? priceListId : null,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; storefront_url?: string };
      if (!res.ok) {
        toast.error(json.error ?? 'Publish failed');
        return;
      }
      setLiveUrl(json.storefront_url ?? `https://${slug}.useyukti.in`);
      setStep('done');
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        void confetti({ particleCount: 120, spread: 70, origin: { y: 0.35 } });
      }
    } finally {
      setPublishing(false);
    }
  }

  const skuMapped = mappings.some((m) => m.yuktiField === 'internal_sku');
  const showingMapping = Boolean(fileName) && mappings.length > 0 && !fileStashed;
  const countLoading = catalogCount === null;
  const existingCount = catalogCount ?? preview?.productCount ?? 0;
  const missingEssentials = showingMapping ? missingEssentialFields(mappings) : [];
  const duplicateFields = showingMapping ? duplicateYuktiFields(mappings) : [];
  const hasPriceLists = (preview?.priceLists.length ?? 0) > 0;
  const previewItems = useMemo(
    () =>
      applyOnboardingPreviewPrices(
        preview?.items ?? [],
        pricingMode,
        pricingMode === 'assigned_price_list' && priceListId
          ? assignedByList[priceListId] ?? null
          : null,
      ),
    [preview?.items, pricingMode, priceListId, assignedByList],
  );
  const reviewAnomalies = useMemo(
    () =>
      filterReviewAnomalies(preview?.anomalies ?? []).filter(
        (row) => !ignoredReviewKeys.includes(reviewRowKey(row)),
      ),
    [preview?.anomalies, ignoredReviewKeys],
  );
  const existingSkus = useMemo(
    () => (preview?.items ?? []).map((item) => item.internal_sku).filter(Boolean),
    [preview?.items],
  );
  const folderUploadCopy = pendingFolderUpload
    ? folderUploadDialogCopy(pendingFolderUpload.fileCount, pendingFolderUpload.folderName)
    : null;

  function closeReview() {
    setReviewOpen(false);
    setMobilePane((pane) => (pane === 'review' ? 'settings' : pane));
    void loadPreview();
  }
  const mappedOwnerByField = new Map(
    mappings
      .filter((m) => m.yuktiField !== 'unmapped')
      .map((m) => [m.yuktiField, m.sourceHeader] as const),
  );
  const progress = step === 1 ? 40 : step === 2 ? 80 : 100;
  const stepLabel = step === 1 ? 'Step 1 of 2 · Bring products in' : step === 2 ? 'Step 2 of 2 · Review & publish' : 'Done · Your catalog is live';

  if (step === 'done') {
    return (
      <CatalogSetupChrome
        stepLabel={stepLabel}
        progress={progress}
        footer={(
          <div className="flex w-full justify-end">
            <Button type="button" onClick={() => router.push('/dashboard')}>
              See it in action
            </Button>
          </div>
        )}
      >
        <div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
          <PartyPopper className="mb-4 h-10 w-10 text-ember-500" />
          <h1 className={ONBOARDING_TITLE_CLASS}>Your storefront is live!</h1>
          <p className="mt-4 w-full rounded-lg bg-cream-100 px-4 py-3 font-mono text-body text-cream-800">{liveUrl.replace(/^https?:\/\//, '')}</p>
          <p className="mt-3 text-body-sm text-cream-600">You can add photos, edit pricing, or unpublish anytime from Catalog Settings.</p>
        </div>
      </CatalogSetupChrome>
    );
  }

  return (
    <CatalogSetupChrome
      stepLabel={stepLabel}
      progress={progress}
      containViewport={step === 2}
      footer={(
        <div className="flex w-full items-center justify-between">
          {step === 1 ? (
            <CatalogSetupNav
              onBack={() => router.push('/dashboard')}
              primaryLabel={showingMapping ? 'Mapping correct, import now' : 'Continue'}
              primaryDisabled={Boolean(importProgress) || countLoading || (showingMapping ? !skuMapped || duplicateFields.length > 0 : existingCount < 1)}
              onPrimary={() => {
                if (showingMapping) void runImport();
                else if (existingCount >= 1) setStep(2);
              }}
              secondaryLabel={showingMapping && existingCount > 0 ? `Continue with ${existingCount} existing products` : undefined}
              secondaryDisabled={Boolean(importProgress)}
              onSecondary={showingMapping && existingCount > 0 ? () => setStep(2) : undefined}
            />
          ) : (
            <CatalogSetupNav
              onBack={() => {
                setMobilePane('settings');
                setReviewOpen(false);
                setStep(1);
              }}
              primaryLabel={publishing ? 'Publishing…' : 'Publish catalog'}
              primaryDisabled={!pricingMode || publishing}
              onPrimary={() => void publish()}
            />
          )}
        </div>
      )}
    >
      {step === 1 ? (
        <div className="mx-auto max-w-3xl">
          <h1 className={ONBOARDING_TITLE_CLASS}>Bring your products in</h1>
          <p className="mt-2 text-body text-cream-600">Upload the price list you already use. Excel or CSV, any layout.</p>
          {!showingMapping && countLoading ? (
            <div
              className="mt-6 min-h-[7.25rem] animate-pulse rounded-xl border border-cream-200 bg-cream-100 sm:min-h-[5.5rem]"
              aria-hidden
            />
          ) : existingCount > 0 && !showingMapping ? (
            <div className="mt-6 flex min-h-[7.25rem] flex-col items-stretch gap-3 rounded-xl border border-teal-200 bg-teal-50 px-5 py-4 sm:min-h-[5.5rem] sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-body font-semibold text-cream-900">
                  {existingCount} {existingCount === 1 ? 'product is' : 'products are'} already in this catalog
                </p>
                <p className="mt-1 text-body-sm text-cream-700">You can continue without uploading a file.</p>
              </div>
              <Button type="button" variant="secondary" className="w-full shrink-0 sm:w-auto" onClick={() => setStep(2)}>
                Continue with existing products
              </Button>
            </div>
          ) : null}
          {!showingMapping ? (
            <>
              <div
                className="mt-6 rounded-xl border border-dashed border-ember-200 bg-ember-50/40 px-6 py-12 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) void handleFile(file);
                }}
              >
                <Upload className="mx-auto h-8 w-8 text-ember-500" />
                <p className="mt-3 text-body font-medium text-cream-900">Drag your Excel/CSV file here</p>
                <Button type="button" className="mt-4" onClick={() => fileInputRef.current?.click()}>
                  Browse files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />
              </div>
              {fileStashed && fileName ? (
                <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-cream-300 bg-white px-4 py-3">
                  <p className="min-w-0 text-body-sm text-cream-800">
                    Last uploaded file: <span className="font-medium">{fileName}</span> · {rowCount} products
                  </p>
                  <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => setFileStashed(false)}>
                    Use the same file
                  </Button>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-body-sm">
                <button
                  type="button"
                  className="font-medium text-cream-700 underline-offset-2 hover:underline"
                  onClick={() => {
                    void fetch('/api/products/template').then(async (res) => {
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'product-import-template.csv';
                      a.click();
                      URL.revokeObjectURL(url);
                    });
                  }}
                >
                  Download our template
                </button>
                <button
                  type="button"
                  className="font-medium text-cream-600"
                  onClick={() => toast.message('Add products one by one is coming in the next pass')}
                >
                  Don't have a file? Add products one by one
                </button>
              </div>
            </>
          ) : null}
          {importProgress ? (
            <p className="mt-4 flex items-center gap-2 text-body-sm text-cream-700">
              <Spinner className="h-4 w-4" />
              {importProgress}
            </p>
          ) : null}
          {showingMapping ? (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-cream-300 bg-white px-5 py-4">
                <div className="min-w-0">
                  {existingCount > 0 ? (
                    <>
                      <p className="text-body font-semibold text-cream-900">
                        {existingCount} {existingCount === 1 ? 'product exists' : 'products exist'} in your catalog
                      </p>
                      <p className="mt-1 text-body-sm text-cream-600">
                        {rowCount} {rowCount === 1 ? 'product' : 'products'} will be imported from {fileName}
                      </p>
                    </>
                  ) : (
                    <p className="text-body font-semibold text-cream-900">
                      {rowCount} {rowCount === 1 ? 'product' : 'products'} will be imported from {fileName}
                    </p>
                  )}
                </div>
                <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={stashFileForReupload}>
                  Change file
                </Button>
              </div>
              <h2 className="mt-8 font-display text-h3 font-medium text-cream-900">Confirm data mapping</h2>
              <p className="mt-1 text-body-sm text-cream-600">
                We matched your columns automatically — change any field that's wrong.
              </p>
              {missingEssentials.length > 0 || !skuMapped ? (
                <div className="callout callout--warning mt-4 px-4 py-3">
                  <p className="text-body font-semibold">Important fields missing</p>
                  <p className="mt-0.5 text-body-sm opacity-90">
                    Map your file's data to these fields if available.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!skuMapped ? (
                      <span className="inline-flex items-center rounded-full border border-danger-500 bg-danger-50 px-3 py-1 text-xs font-semibold text-danger-700">
                        SKU required
                      </span>
                    ) : null}
                    {missingEssentials.map((field) => (
                      <span
                        key={field}
                        className="inline-flex items-center rounded-full border border-warning-500 bg-white px-3 py-1 text-xs font-semibold text-warning-700"
                      >
                        {yuktiFieldLabel(field)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {duplicateFields.length > 0 ? (
                <div className="callout callout--warning mt-3 px-4 py-3 text-body-sm">
                  Each Yukti field can only map once: {duplicateFields.map(yuktiFieldLabel).join(', ')}.
                </div>
              ) : null}
              <div className="mt-4 overflow-hidden rounded-lg border border-cream-200">
                <div className="grid grid-cols-[minmax(0,1.1fr)_1.25rem_minmax(0,1fr)_6.75rem_auto] items-center gap-2 bg-cream-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-600">
                  <span>Your file</span>
                  <span />
                  <span>Yukti field</span>
                  <span />
                  <span className="sr-only">Ignore or include</span>
                </div>
                {mappings.map((mapping, index) => {
                  const ignored = mapping.yuktiField === 'unmapped';
                  const overridden = isOverriddenMapping(mapping);
                  return (
                    <div
                      key={mapping.sourceHeader}
                      className={cn(
                        'grid grid-cols-[minmax(0,1.1fr)_1.25rem_minmax(0,1fr)_6.75rem_auto] items-center gap-2 border-t border-cream-200 px-4 py-3',
                        ignored && 'bg-cream-50',
                        overridden && 'bg-ember-50/40',
                      )}
                    >
                      <div className={cn(ignored && 'opacity-50')}>
                        <p className="font-medium text-cream-900">{mapping.sourceHeader}</p>
                        <p className="text-body-sm text-cream-600">{mapping.sampleValue || '—'}</p>
                      </div>
                      <span className={cn('text-center text-ember-500', ignored && 'text-cream-400')}>→</span>
                      <Select
                        value={ignored ? undefined : mapping.yuktiField}
                        onValueChange={(value) => assignMapping(index, value as typeof ONBOARDING_YUKTI_FIELDS[number])}
                      >
                        <SelectTrigger className={cn(ignored && 'opacity-50', overridden && 'border-ember-400')}>
                          <SelectValue placeholder="Map field" />
                        </SelectTrigger>
                        <SelectContent>
                          {ONBOARDING_YUKTI_FIELDS.map((field) => {
                            const owner = mappedOwnerByField.get(field);
                            const mappedElsewhere = Boolean(owner) && owner !== mapping.sourceHeader;
                            return (
                              <SelectItem
                                key={field}
                                value={field}
                                trailing={
                                  mappedElsewhere ? (
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-cream-500">
                                      Mapped
                                    </span>
                                  ) : undefined
                                }
                              >
                                {yuktiFieldLabel(field)}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <div className="flex justify-start">
                        {ignored ? (
                          <span className="text-xs text-cream-500">ignored</span>
                        ) : overridden ? (
                          <span className="rounded-full bg-ember-100 px-2 py-0.5 text-xs font-medium text-ember-800">
                            Override
                          </span>
                        ) : mapping.confidence >= 90 ? (
                          <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs text-success-700">{mapping.confidence}% match</span>
                        ) : (
                          <span className="callout callout--warning px-2 py-0.5 text-xs">{mapping.confidence}% — check</span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant={ignored ? 'secondary' : 'ghost'}
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          if (!ignored) {
                            assignMapping(index, 'unmapped');
                            return;
                          }
                          const suggested = mapping.suggestedField;
                          const restore = suggested !== 'unmapped'
                            ? suggested
                            : ONBOARDING_YUKTI_FIELDS.find((field) => !mappedOwnerByField.has(field)) ?? 'unmapped';
                          assignMapping(index, restore);
                        }}
                      >
                        {ignored ? 'Include' : 'Ignore'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
          <div
            className={cn(
              'w-full shrink-0 overflow-y-auto lg:h-full lg:w-[28rem] xl:w-[32rem]',
              mobilePane === 'settings' && 'max-lg:min-h-0 max-lg:flex-1',
              mobilePane !== 'settings' && 'max-lg:hidden',
            )}
          >
            <Button
              type="button"
              className="sticky top-0 z-10 mb-4 w-full lg:hidden"
              onClick={() => setMobilePane('preview')}
            >
              <Store className="h-4 w-4" />
              Preview Catalog
            </Button>
              <h1 className={ONBOARDING_TITLE_CLASS}>Review & publish</h1>
              <p className="mt-2 text-body text-cream-600">
                {preview?.productCount ?? 0} products are ready. Real photos can wait — category icons stand in until you add them.
              </p>
              {reviewAnomalies.length > 0 ? (
                <div className="mt-4 flex w-full items-center gap-3 rounded-xl border border-warning-500/35 bg-warning-50 px-4 py-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-warning-700">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold text-cream-900">
                      {reviewCountLabel(reviewAnomalies.length)}
                    </span>
                    <span className="mt-0.5 block text-body-sm text-cream-700">
                      Fix missing data for imported products (optional)
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setReviewOpen(true);
                      setMobilePane('review');
                    }}
                  >
                    Review
                  </Button>
                </div>
              ) : null}
              <div className="mt-6">
                <Label htmlFor="catalog-slug">Your catalog link</Label>
                <div className="mt-1 flex items-stretch">
                  <Input id="catalog-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="rounded-r-none font-mono" />
                  <span className="inline-flex items-center rounded-r-[8px] border border-l-0 border-cream-400 bg-cream-200 px-3 text-body-sm text-cream-700">
                    .useyukti.in
                  </span>
                </div>
                <p className="mt-1 text-body-sm text-cream-600">Updates the preview address bar live.</p>
              </div>
              <div className="mt-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-600">Pricing visibility</p>
                <RadioGroup
                  className="mt-3 space-y-2"
                  value={pricingMode || undefined}
                  onValueChange={(value) => {
                    const next = value as CatalogPricingMode;
                    setPricingMode(next);
                    if (needsAssignedPriceFetch(next, priceListId, assignedByList)) {
                      void loadPreview(priceListId);
                    }
                  }}
                >
                  <label
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-xl border px-4 py-3',
                      pricingMode === 'hidden_until_login'
                        ? 'border-teal-500 bg-cream-50 ring-2 ring-teal-500/15'
                        : 'border-cream-300 bg-white',
                    )}
                  >
                    <RadioGroupItem value="hidden_until_login" className="mt-0.5" />
                    <span>
                      <span className="block font-medium text-cream-900">Login to see pricing</span>
                      <span className="mt-0.5 block text-body-sm text-cream-600">
                        Range stays public. Guests tap Login for Price until you approve them.
                      </span>
                    </span>
                  </label>
                  <label
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-xl border px-4 py-3',
                      pricingMode === 'base_selling_rate'
                        ? 'border-teal-500 bg-cream-50 ring-2 ring-teal-500/15'
                        : 'border-cream-300 bg-white',
                    )}
                  >
                    <RadioGroupItem value="base_selling_rate" className="mt-0.5" />
                    <span>
                      <span className="block font-medium text-cream-900">Show base selling rate</span>
                      <span className="mt-0.5 block text-body-sm text-cream-600">
                        Anyone with the link sees prices and can start an order.
                      </span>
                    </span>
                  </label>
                  <label
                    className={cn(
                      'flex cursor-pointer flex-col gap-2 rounded-xl border px-4 py-3',
                      pricingMode === 'assigned_price_list'
                        ? 'border-teal-500 bg-cream-50 ring-2 ring-teal-500/15'
                        : 'border-cream-300 bg-white',
                      !hasPriceLists && 'opacity-70',
                    )}
                  >
                    <span className="flex gap-3">
                      <RadioGroupItem value="assigned_price_list" className="mt-0.5" disabled={!hasPriceLists} />
                      <span>
                        <span className="block font-medium text-cream-900">Assign a price list</span>
                        <span className="mt-0.5 block text-body-sm text-cream-600">
                          {hasPriceLists
                            ? 'Guests see this list. Approved buyers still get their own rates.'
                            : 'No price lists yet — add one after publish if you need guest-specific rates.'}
                        </span>
                      </span>
                    </span>
                    {hasPriceLists && pricingMode === 'assigned_price_list' ? (
                      <div className="pl-7">
                        <Select
                          value={priceListId}
                          onValueChange={(id) => {
                            setPriceListId(id);
                            if (needsAssignedPriceFetch('assigned_price_list', id, assignedByList)) {
                              void loadPreview(id);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a price list" />
                          </SelectTrigger>
                          <SelectContent>
                            {preview?.priceLists.map((list) => (
                              <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </label>
                </RadioGroup>
              </div>
              <div
                className="mt-6 rounded-xl border border-dashed border-cream-400 p-4"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleDroppedPhotos(event.dataTransfer);
                }}
              >
                <p className="font-medium text-cream-900">Drop your product photo folder</p>
                <p className="mt-1 text-body-sm text-cream-600">
                  Filenames are matched to SKUs — you review matches before anything changes.
                </p>
                <div className="mt-3">
                  <Button type="button" variant="secondary" onClick={() => void pickPhotoFolder()}>Choose folder</Button>
                </div>
                <input
                  ref={bindFolderInput}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    const files = snapshotFileList(e.target.files);
                    e.target.value = '';
                    void queuePhotoUpload(filesToPhotoEntries(files));
                  }}
                />
                {matchedPhotos || unmatchedPhotos ? (
                  <p className="mt-3 text-body-sm text-cream-700">
                    <span className="rounded-full bg-success-50 px-2 py-0.5 text-success-700">{matchedPhotos} matched</span>
                    {' '}
                    <span className="callout callout--warning ml-2 px-2 py-0.5">{unmatchedPhotos} unmatched</span>
                  </p>
                ) : null}
                {photoStatus ? <p className="mt-2 text-body-sm text-cream-700">{photoStatus}</p> : null}
              </div>
          </div>
          <div
            className={cn(
              'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
              mobilePane !== 'preview' && 'max-lg:hidden',
            )}
          >
            <Button type="button" variant="secondary" className="mb-3 w-full shrink-0 lg:hidden" onClick={() => setMobilePane('settings')}>
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Button>
            <div className="relative isolate z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <OnboardingPreviewFrame
              slug={slug || preview?.slug || ''}
              businessName={preview?.businessName || currentTenant?.business_name || ''}
              items={previewItems}
              brands={preview?.brands ?? []}
              categories={preview?.categories ?? []}
              pricingMode={pricingMode}
            />
            {reviewOpen ? (
              <div className="absolute inset-0 z-30 hidden overflow-hidden rounded-xl border border-cream-300 bg-cream-50 lg:flex">
                <OnboardingReviewPanel
                  anomalies={reviewAnomalies}
                  existingSkus={existingSkus}
                  closeMode="dismiss"
                  onClose={closeReview}
                  onIgnore={(key) => setIgnoredReviewKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))}
                />
              </div>
            ) : null}
            </div>
          </div>
          <div
            className={cn(
              'min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-cream-300',
              mobilePane === 'review' ? 'flex lg:hidden' : 'hidden',
            )}
          >
            <OnboardingReviewPanel
              anomalies={reviewAnomalies}
              existingSkus={existingSkus}
              closeMode="back"
              onClose={closeReview}
              onIgnore={(key) => setIgnoredReviewKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))}
            />
          </div>
        </div>
      )}
      <AlertDialog
        open={pendingFolderUpload !== null}
        onOpenChange={(open) => {
          if (!open) setPendingFolderUpload(null);
        }}
      >
        <AlertDialogContent className="border-cream-200 bg-cream-50">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-cream-900">
              {folderUploadCopy?.title ?? 'Upload files to your catalog'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-cream-700">
              {folderUploadCopy?.message ?? ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                const pending = pendingFolderUpload;
                setPendingFolderUpload(null);
                if (pending) void handlePhotos(pending.entries);
              }}
            >
              Upload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CatalogSetupChrome>
  );
}
