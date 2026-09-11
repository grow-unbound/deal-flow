'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Eye, Save } from 'lucide-react';
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
  items: BuyerCatalogItem[];
  brands: BuyerBrand[];
  categories: BuyerCategory[];
  slug: string;
  storefrontHost: string;
  businessName: string;
  live: boolean;
  pricingMode: CatalogPricingMode | null;
  priceListId: string | null;
  accessMode: CatalogAccessMode;
  collectTargetUnitPriceRange: boolean;
  productDisplayMode: CatalogProductDisplayMode;
  priceLists: Array<{ id: string; name: string }>;
  settings: TenantSettingsApiPayload;
}

export function CatalogControlCenterClient(): React.ReactNode {
  const { currentTenant } = useTenant();
  const [state, setState] = useState<CatalogSetupState | null>(null);
  const [pricingMode, setPricingMode] = useState<CatalogPricingMode | ''>('');
  const [priceListId, setPriceListId] = useState('');
  const [accessMode, setAccessMode] = useState<CatalogAccessMode>('public_link');
  const [collectTarget, setCollectTarget] = useState(false);
  const [productDisplayMode, setProductDisplayMode] = useState<CatalogProductDisplayMode>('sku_list');
  const [assignedByList, setAssignedByList] = useState<Record<string, AssignedPriceMap>>({});
  const [saving, setSaving] = useState(false);

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

  async function save(publish = false) {
    if (!canSave) {
      toast.error('Choose how prices work before saving');
      return;
    }
    setSaving(true);
    try {
      const res = await apiPatch('/api/tenant/catalog/setup', {
        pricing_mode: pricingMode,
        price_list_id: pricingMode === 'assigned_price_list' ? priceListId : null,
        access_mode: accessMode,
        collect_target_unit_price_range: pricingMode === 'hide_price_collect_enquiry' ? collectTarget : false,
        product_display_mode: productDisplayMode,
        publish,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; state?: CatalogSetupState };
      if (!res.ok) {
        toast.error(json.error ?? 'Could not save catalog');
        return;
      }
      if (json.state) setState(json.state);
      toast.success(publish ? 'Catalog published' : 'Catalog settings saved');
    } finally {
      setSaving(false);
    }
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
    return <div className="h-96 animate-pulse rounded-[8px] border border-cream-200 bg-cream-100" />;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      <div className="space-y-5">
        <section className="rounded-[8px] border border-cream-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <StatusPill label={state.live ? 'Live' : 'Not live'} tone={state.live ? 'success' : 'warning'} />
                <span className="text-body-sm text-cream-600">{state.productCount} products</span>
              </div>
              <p className="mt-3 text-h4 font-semibold text-cream-950">
                {state.live ? 'Your catalog is live' : 'Complete setup to share this catalog'}
              </p>
              <p className="mt-1 text-body-sm text-cream-600">
                {accessMode === 'public_link' ? 'Anyone with the link can browse.' : 'Approved buyers must log in before browsing.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void copyLink()}>
                <Copy className="h-4 w-4" />
                Copy link
              </Button>
              <Button type="button" variant="secondary" asChild>
                <a href={href || '#'} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open catalog
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-[8px] border border-cream-200 bg-white p-5">
          <h2 className="text-h4 font-semibold text-cream-950">Who can browse your catalog?</h2>
          <RadioGroup className="mt-4 space-y-2" value={accessMode} onValueChange={(value) => setAccessMode(value as CatalogAccessMode)}>
            <CatalogOption value="public_link" title="Anyone with the link" active={accessMode === 'public_link'}>
              Buyers can browse before logging in. Customer group restrictions apply after login.
            </CatalogOption>
            <CatalogOption value="approved_buyers_only" title="Approved buyers only" active={accessMode === 'approved_buyers_only'}>
              Visitors must log in or be approved before browsing.
            </CatalogOption>
          </RadioGroup>
        </section>

        <section className="rounded-[8px] border border-cream-200 bg-white p-5">
          <h2 className="text-h4 font-semibold text-cream-950">How buyers buy</h2>
          <RadioGroup
            className="mt-4 space-y-2"
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
            <CatalogOption value="hide_price_collect_enquiry" title="Hide prices and collect enquiries" active={pricingMode === 'hide_price_collect_enquiry'}>
              Buyers choose products and quantities. Your team responds with prices.
            </CatalogOption>
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
          {pricingMode === 'hide_price_collect_enquiry' ? (
            <label className="mt-4 flex items-start gap-3 rounded-[8px] border border-cream-200 bg-cream-50 p-4">
              <Checkbox checked={collectTarget} onCheckedChange={(checked) => setCollectTarget(checked === true)} className="mt-1" />
              <span>
                <span className="block font-semibold text-cream-950">Ask for target unit price range</span>
                <span className="mt-0.5 block text-body-sm text-cream-600">Buyers can share the per-unit rate they are hoping for.</span>
              </span>
            </label>
          ) : null}
        </section>

        <section className="rounded-[8px] border border-cream-200 bg-white p-5">
          <h2 className="text-h4 font-semibold text-cream-950">How products appear</h2>
          <RadioGroup className="mt-4 space-y-2" value={productDisplayMode} onValueChange={(value) => setProductDisplayMode(value as CatalogProductDisplayMode)}>
            <CatalogOption value="sku_list" title="Show SKUs directly" active={productDisplayMode === 'sku_list'}>
              Each SKU appears as its own catalog item.
            </CatalogOption>
            <CatalogOption value="group_variants" title="Group variants under products" active={productDisplayMode === 'group_variants'}>
              We will group variants where SKU attributes are already clear. Incomplete rows stay as SKU cards.
            </CatalogOption>
          </RadioGroup>
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={!canSave || saving} onClick={() => void save(false)}>
            <Save className="h-4 w-4" />
            Save settings
          </Button>
          <Button type="button" disabled={!canSave || saving} onClick={() => void save(true)}>
            <Eye className="h-4 w-4" />
            {state.live ? 'Update live catalog' : 'Publish catalog'}
          </Button>
        </div>
      </div>
      <div className="min-h-[680px]">
        <OnboardingPreviewFrame
          slug={state.slug}
          businessName={state.businessName}
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
  children: React.ReactNode;
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
