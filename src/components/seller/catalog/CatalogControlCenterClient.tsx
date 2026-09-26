'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, Copy, Edit3, Image, Package, Save, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { StatusPill } from '@/components/ui/status-pill';
import { OnboardingPreviewFrame } from '@/components/seller/onboarding/OnboardingPreviewFrame';
import { useTenant } from '@/contexts/TenantContext';
import { apiFetch, apiPatch } from '@/lib/api-fetch';
import { applyOnboardingPreviewPrices, assignedPricesFromPreviewItems, needsAssignedPriceFetch, type AssignedPriceMap } from '@/lib/onboarding/preview-pricing';
import type { CatalogAccessMode, CatalogPricingMode, CatalogProductDisplayMode } from '@/lib/server/public-catalog';
import type { BuyerBrand, BuyerCatalogItem, BuyerCategory } from '@/types/buyer';
import type { TenantSettingsApiPayload } from '@/types/tenant-settings';

interface CatalogSetupState {
  productCount: number;
  catalogUpdatedAt: string | null;
  liveAt: string | null;
  productReadiness: {
    activeProductCount: number;
    anomalyCount: number;
    missingProductImageCount: number;
  };
  brandRestrictionSummary: {
    totalCustomerGroups: number;
    restrictedCustomerGroups: number;
    restrictedBrandCount: number;
    sampleCustomerGroups: string[];
  };
  items: BuyerCatalogItem[];
  brands: BuyerBrand[];
  categories: BuyerCategory[];
  slug: string;
  storefrontHost: string;
  businessName: string;
  tagline: string | null;
  logoUrl: string | null;
  live: boolean;
  pricingMode: CatalogPricingMode | null;
  priceListId: string | null;
  accessMode: CatalogAccessMode;
  collectTargetUnitPriceRange: boolean;
  productDisplayMode: CatalogProductDisplayMode;
  priceLists: Array<{ id: string; name: string }>;
  settings: TenantSettingsApiPayload;
}

type EditSection = 'access' | 'tagline' | 'pricing' | 'display' | null;

export function CatalogControlCenterClient(): ReactNode {
  const { currentTenant } = useTenant();
  const [state, setState] = useState<CatalogSetupState | null>(null);
  const [pricingMode, setPricingMode] = useState<CatalogPricingMode | ''>('');
  const [priceListId, setPriceListId] = useState('');
  const [accessMode, setAccessMode] = useState<CatalogAccessMode>('public_link');
  const [taglineDraft, setTaglineDraft] = useState('');
  const [collectTarget, setCollectTarget] = useState(false);
  const [productDisplayMode, setProductDisplayMode] = useState<CatalogProductDisplayMode>('sku_list');
  const [assignedByList, setAssignedByList] = useState<Record<string, AssignedPriceMap>>({});
  const [editing, setEditing] = useState<EditSection>(null);
  const [saving, setSaving] = useState(false);
  const [hasSavedUnpublishedChanges, setHasSavedUnpublishedChanges] = useState(false);

  const load = useCallback(async (assignedListId?: string) => {
    const params = new URLSearchParams();
    if (assignedListId) {
      params.set('pricing_mode', 'assigned_price_list');
      params.set('price_list_id', assignedListId);
    }
    const res = await apiFetch(`/api/tenant/catalog/setup?${params.toString()}`, { fresh: true });
    if (!res.ok) throw new Error('Failed to load catalog');
    const data = (await res.json()) as CatalogSetupState;
    setState(data);
    setPricingMode(data.pricingMode ?? '');
    setPriceListId(data.priceListId ?? '');
    setAccessMode(data.accessMode);
    setTaglineDraft(data.tagline ?? '');
    setCollectTarget(data.collectTargetUnitPriceRange);
    setProductDisplayMode(data.productDisplayMode);
    if (assignedListId) {
      setAssignedByList((prev) => ({
        ...prev,
        [assignedListId]: assignedPricesFromPreviewItems(data.items),
      }));
    }
  }, []);

  useEffect(() => {
    void load().catch(() => toast.error('Could not load catalog setup'));
  }, [load]);

  const previewItems = useMemo(
    () =>
      applyOnboardingPreviewPrices(
        state?.items ?? [],
        pricingMode,
        pricingMode === 'assigned_price_list' && priceListId
          ? assignedByList[priceListId] ?? null
          : null,
      ),
    [assignedByList, priceListId, pricingMode, state?.items],
  );

  const canSave = Boolean(pricingMode) && (pricingMode !== 'assigned_price_list' || Boolean(priceListId));
  const href = currentTenant?.storefront_url ?? (state?.storefrontHost ? `https://${state.storefrontHost}` : '');

  async function save(publish = false, options: { includeSettings?: boolean } = {}) {
    if (!canSave && !options.includeSettings) {
      toast.error('Choose how prices work before saving');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { publish };
      if (canSave) {
        payload.pricing_mode = pricingMode;
        payload.price_list_id = pricingMode === 'assigned_price_list' ? priceListId : null;
        payload.access_mode = accessMode;
        payload.collect_target_unit_price_range = pricingMode === 'hide_price_collect_enquiry' ? collectTarget : false;
        payload.product_display_mode = productDisplayMode;
      }
      if (options.includeSettings) {
        payload.settings = { business: { tagline: taglineDraft } };
      }
      const res = await apiPatch('/api/tenant/catalog/setup', payload);
      const json = (await res.json().catch(() => ({}))) as { error?: string; state?: CatalogSetupState };
      if (!res.ok) {
        toast.error(json.error ?? 'Could not save catalog');
        return;
      }
      if (json.state) {
        setState(json.state);
        setPricingMode(json.state.pricingMode ?? '');
        setPriceListId(json.state.priceListId ?? '');
        setAccessMode(json.state.accessMode);
        setTaglineDraft(json.state.tagline ?? '');
        setCollectTarget(json.state.collectTargetUnitPriceRange);
        setProductDisplayMode(json.state.productDisplayMode);
        setHasSavedUnpublishedChanges(publish ? false : json.state.live);
      }
      setEditing(null);
      toast.success(publish ? 'Catalog published' : 'Catalog settings saved');
    } finally {
      setSaving(false);
    }
  }

  function resetDraftFromState() {
    if (!state) return;
    setPricingMode(state.pricingMode ?? '');
    setPriceListId(state.priceListId ?? '');
    setAccessMode(state.accessMode);
    setTaglineDraft(state.tagline ?? '');
    setCollectTarget(state.collectTargetUnitPriceRange);
    setProductDisplayMode(state.productDisplayMode);
  }

  function cancelEdit() {
    resetDraftFromState();
    setEditing(null);
  }

  async function copyLink() {
    if (!href) return;
    try {
      await navigator.clipboard.writeText(href);
      toast.success('Catalog link copied');
    } catch {
      toast.error('Could not copy link');
    }
  }

  if (!state) {
    return (
      <div className="space-y-6">
        <SellerTopbar
          eyebrow="Market"
          title="Catalog"
          subtitle="Control what buyers see, whether prices are shown, and how enquiries are collected."
        />
        <div className="h-96 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />
      </div>
    );
  }

  const pricingLabel = pricingSummaryLabel(pricingMode, state.priceLists, priceListId);
  const lastUpdated = formatCatalogDate(state.catalogUpdatedAt);
  const publishDisabled = saving || !canSave || (state.live && !hasSavedUnpublishedChanges);
  const hasOperationalIssues = state.productReadiness.anomalyCount > 0 || state.productReadiness.missingProductImageCount > 0;

  return (
    <div className="space-y-6">
      <SellerTopbar
        eyebrow="Market"
        title="Catalog"
        subtitle="Control what buyers see, whether prices are shown, and how enquiries are collected."
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            {state.live && hasSavedUnpublishedChanges ? (
              <span className="rounded-full border border-ember-100 bg-ember-50 px-2 py-0.5 text-caption font-medium text-ember-700">
                Saved changes unpublished
              </span>
            ) : null}
            <Button type="button" variant="accent" disabled={publishDisabled} onClick={() => void save(true)}>
              <UploadCloud className="h-4 w-4" />
              {state.live ? 'Update live catalog' : 'Publish catalog'}
            </Button>
          </div>
        )}
      />

      {hasOperationalIssues ? (
        <p className="flex items-start gap-2 rounded-[8px] border border-warning-50 bg-warning-50 p-3 text-body-sm text-warning-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Fixing product data and photos improves buyer trust, but it does not block saving catalog settings.
        </p>
      ) : null}

      <section className="rounded-[8px] border border-cream-200 bg-white p-5 shadow-sm" data-testid="catalog-live-banner">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill label={state.live ? 'Live' : 'Not live'} tone={state.live ? 'success' : 'warning'} />
              <p className="truncate font-mono text-body-sm text-cream-800">
                {href ? href.replace(/^https?:\/\//, '') : state.storefrontHost}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-[8px] text-cream-600 hover:bg-cream-100 hover:text-cream-950"
                aria-label="Copy catalog link"
                title="Copy catalog link"
                onClick={() => void copyLink()}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-body font-semibold text-cream-950">
              {state.live ? 'Your catalog is live' : 'Complete setup to share this catalog'}
            </p>
            <p className="mt-0.5 text-body-sm text-cream-600">
              {accessMode === 'public_link' ? 'Anyone with the link can browse.' : 'Approved buyers must log in before browsing.'}
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
            <BannerMetric
              icon={<Package className="h-4 w-4" />}
              title="Products"
              value={`${state.productReadiness.activeProductCount}`}
              description={state.productReadiness.anomalyCount > 0 ? `${state.productReadiness.anomalyCount} rows need review` : 'Data ready'}
              href="/products/import"
              action="Import"
            />
            <BannerMetric
              icon={<Image className="h-4 w-4" />}
              title="Photos"
              value={`${state.productReadiness.missingProductImageCount}`}
              description={state.productReadiness.missingProductImageCount > 0 ? 'Missing images' : 'Images ready'}
              href="/setup/catalog"
              action="Upload"
            />
          </div>
        </div>
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,38rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-[8px] border border-cream-200 bg-white p-5">
            <div>
              <h2 className="text-h4 font-semibold text-cream-950">Setup summary</h2>
              <p className="mt-1 text-body-sm text-cream-600">Last updated {lastUpdated}</p>
            </div>

            <div className="mt-4 divide-y divide-cream-200 rounded-[8px] border border-cream-200">
              <SummaryRow
                label="Access"
                value={accessMode === 'public_link' ? 'Public link' : 'Approved buyers only'}
                editing={editing === 'access'}
                canSave={canSave}
                saving={saving}
                onEdit={() => setEditing('access')}
                onCancel={cancelEdit}
                onSave={() => void save(false)}
              >
                {renderAccessEditor(accessMode, setAccessMode)}
              </SummaryRow>
              <SummaryRow
                label="Tagline"
                value={taglineDraft || 'Not set'}
                editing={editing === 'tagline'}
                canSave
                saving={saving}
                onEdit={() => setEditing('tagline')}
                onCancel={cancelEdit}
                onSave={() => void save(false, { includeSettings: true })}
              >
                <TaglineEditor value={taglineDraft} onChange={setTaglineDraft} />
              </SummaryRow>
              <SummaryRow
                label="Pricing"
                value={pricingLabel}
                editing={editing === 'pricing'}
                canSave={canSave}
                saving={saving}
                onEdit={() => setEditing('pricing')}
                onCancel={cancelEdit}
                onSave={() => void save(false)}
              >
                {renderPricingEditor({
                  pricingMode,
                  priceListId,
                  state,
                  assignedByList,
                  collectTarget,
                  setPricingMode,
                  setPriceListId,
                  setCollectTarget,
                  load,
                })}
              </SummaryRow>
              <SummaryRow
                label="Product display"
                value={productDisplayMode === 'group_variants' ? 'Grouped variants' : 'SKU list'}
                editing={editing === 'display'}
                canSave={canSave}
                saving={saving}
                onEdit={() => setEditing('display')}
                onCancel={cancelEdit}
                onSave={() => void save(false)}
              >
                {renderDisplayEditor(productDisplayMode, setProductDisplayMode)}
              </SummaryRow>
            </div>
          </section>
        </div>

        <div className="min-h-[680px] min-w-0">
          <OnboardingPreviewFrame
            slug={state.slug}
            businessName={state.businessName}
            logoUrl={state.logoUrl}
            items={previewItems}
            brands={state.brands}
            categories={state.categories}
            pricingMode={pricingMode}
            storefrontHost={state.storefrontHost}
            collectTargetUnitPriceRange={collectTarget}
            productDisplayMode={productDisplayMode}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  editing,
  canSave,
  saving,
  onEdit,
  onCancel,
  onSave,
  children,
}: {
  label: string;
  value: string;
  editing: boolean;
  canSave: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 px-4 py-3 ${editing ? 'bg-cream-50/60' : ''}`}>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-body-sm text-cream-600">{label}</p>
          <p className="mt-0.5 break-words text-body font-semibold text-cream-950">{value}</p>
        </div>
        {editing ? (
          <div className="flex shrink-0 gap-2 self-start sm:self-auto">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={!canSave || saving} onClick={onSave}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        ) : (
          <Button type="button" variant="ghost" size="sm" className="shrink-0 self-start sm:self-auto" aria-label={`Edit ${label}`} onClick={onEdit}>
            <Edit3 className="h-4 w-4" />
            Edit
          </Button>
        )}
      </div>
      {editing ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

function TaglineEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="catalog-tagline">Tagline</Label>
      <Textarea
        id="catalog-tagline"
        value={value}
        maxLength={120}
        rows={3}
        placeholder="Short buyer-facing line for your storefront"
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-caption text-cream-500">{value.length}/120 characters</p>
    </div>
  );
}

function renderAccessEditor(accessMode: CatalogAccessMode, setAccessMode: (mode: CatalogAccessMode) => void) {
  return (
    <RadioGroup className="space-y-2" value={accessMode} onValueChange={(value) => setAccessMode(value as CatalogAccessMode)}>
      <CatalogOption value="public_link" title="Anyone with the link" active={accessMode === 'public_link'}>
        Buyers can browse before logging in. Customer group restrictions apply after login.
      </CatalogOption>
      <CatalogOption value="approved_buyers_only" title="Approved buyers only" active={accessMode === 'approved_buyers_only'}>
        Visitors must log in or be approved before browsing.
      </CatalogOption>
    </RadioGroup>
  );
}

function renderPricingEditor({
  pricingMode,
  priceListId,
  state,
  assignedByList,
  collectTarget,
  setPricingMode,
  setPriceListId,
  setCollectTarget,
  load,
}: {
  pricingMode: CatalogPricingMode | '';
  priceListId: string;
  state: CatalogSetupState;
  assignedByList: Record<string, AssignedPriceMap>;
  collectTarget: boolean;
  setPricingMode: (mode: CatalogPricingMode) => void;
  setPriceListId: (id: string) => void;
  setCollectTarget: (value: boolean) => void;
  load: (assignedListId?: string) => Promise<void>;
}) {
  return (
    <>
      <RadioGroup
        className="space-y-2"
        value={pricingMode || undefined}
        onValueChange={(value) => {
          const next = value as CatalogPricingMode;
          setPricingMode(next);
          if (next !== 'hide_price_collect_enquiry') setCollectTarget(false);
          if (needsAssignedPriceFetch(next, priceListId, assignedByList)) void load(priceListId);
        }}
      >
        <CatalogOption value="base_selling_rate" title="Show prices" active={pricingMode === 'base_selling_rate'}>
          Buyers see rates while browsing.
        </CatalogOption>
        <div className={`rounded-[8px] border ${pricingMode === 'hide_price_collect_enquiry' ? 'border-teal-500 bg-cream-50 ring-2 ring-teal-500/15' : 'border-cream-300 bg-white'}`}>
          <Label className="flex cursor-pointer gap-3 p-4">
            <RadioGroupItem value="hide_price_collect_enquiry" className="mt-1" />
            <span>
              <span className="block font-semibold text-cream-950">Hide prices and collect enquiries</span>
              <span className="mt-0.5 block text-body-sm text-cream-600">Buyers choose products and quantities. Your team responds with prices.</span>
            </span>
          </Label>
          {pricingMode === 'hide_price_collect_enquiry' ? (
            <div className="px-4 pb-4 pl-11">
              <label className="flex items-start gap-3 rounded-[8px] border border-cream-200 bg-cream-50 p-4">
                <Checkbox checked={collectTarget} onCheckedChange={(checked) => setCollectTarget(checked === true)} className="mt-1" />
                <span>
                  <span className="block font-semibold text-cream-950">Ask for target unit price range</span>
                  <span className="mt-0.5 block text-body-sm text-cream-600">Buyers can share the per-unit rate they are hoping for.</span>
                </span>
              </label>
            </div>
          ) : null}
        </div>
        <CatalogOption value="hidden_until_login" title="Login to see pricing" active={pricingMode === 'hidden_until_login'}>
          Guests browse first, then approved buyers log in to see prices.
        </CatalogOption>
        <label className="block rounded-[8px] border border-cream-300 bg-white p-4">
          <span className="flex gap-3">
            <RadioGroupItem value="assigned_price_list" className="mt-1" disabled={state.priceLists.length === 0} />
            <span>
              <span className="block font-semibold text-cream-950">Show a selected price list</span>
              <span className="mt-0.5 block text-body-sm text-cream-600">Guests see this list. Approved buyers still get their own rates.</span>
            </span>
          </span>
          {pricingMode === 'assigned_price_list' && state.priceLists.length > 0 ? (
            <div className="mt-3 pl-7">
              <Select
                value={priceListId}
                onValueChange={(id) => {
                  setPriceListId(id);
                  if (needsAssignedPriceFetch('assigned_price_list', id, assignedByList)) void load(id);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Choose a price list" /></SelectTrigger>
                <SelectContent>
                  {state.priceLists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </label>
      </RadioGroup>
    </>
  );
}

function renderDisplayEditor(productDisplayMode: CatalogProductDisplayMode, setProductDisplayMode: (mode: CatalogProductDisplayMode) => void) {
  return (
    <RadioGroup className="space-y-2" value={productDisplayMode} onValueChange={(value) => setProductDisplayMode(value as CatalogProductDisplayMode)}>
      <CatalogOption value="sku_list" title="Show SKUs directly" active={productDisplayMode === 'sku_list'}>
        Each SKU appears as its own catalog item.
      </CatalogOption>
      <CatalogOption value="group_variants" title="Group variants under products" active={productDisplayMode === 'group_variants'}>
        We will group variants where SKU attributes are already clear. Incomplete rows stay as SKU cards.
      </CatalogOption>
    </RadioGroup>
  );
}

function CatalogOption({
  value,
  title,
  active,
  children,
}: {
  value: string;
  title: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Label className={`flex cursor-pointer gap-3 rounded-[8px] border p-4 ${active ? 'border-teal-500 bg-cream-50 ring-2 ring-teal-500/15' : 'border-cream-300 bg-white'}`}>
      <RadioGroupItem value={value} className="mt-1" />
      <span>
        <span className="block font-semibold text-cream-950">{title}</span>
        <span className="mt-0.5 block text-body-sm text-cream-600">{children}</span>
      </span>
    </Label>
  );
}

function BannerMetric({
  icon,
  title,
  value,
  description,
  href,
  action,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <section className="flex min-w-[15rem] items-center justify-between gap-4 rounded-[8px] border border-cream-200 bg-cream-50 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-body-sm font-semibold text-cream-700">
          {icon}
          {title}
        </div>
        <p className="mt-1 text-body-sm text-cream-600">{description}</p>
      </div>
      <p className="shrink-0 text-h3 font-semibold text-cream-950">{value}</p>
      <Button type="button" variant="secondary" size="sm" className="shrink-0" asChild>
        <Link href={href}>{action}</Link>
      </Button>
    </section>
  );
}

function pricingSummaryLabel(
  mode: CatalogPricingMode | '',
  priceLists: Array<{ id: string; name: string }>,
  priceListId: string,
): string {
  if (mode === 'hide_price_collect_enquiry') return 'Hide prices and collect enquiries';
  if (mode === 'hidden_until_login') return 'Login to see pricing';
  if (mode === 'assigned_price_list') {
    const listName = priceLists.find((list) => list.id === priceListId)?.name;
    return listName ? `Selected price list: ${listName}` : 'Selected price list';
  }
  if (mode === 'base_selling_rate') return 'Show prices';
  return 'Not configured';
}

function formatCatalogDate(value: string | null): string {
  if (!value) return 'not recorded';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
