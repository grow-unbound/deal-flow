'use client';

import Image from 'next/image';
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
import { BrowseUploadField } from '@/components/ui/browse-upload-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, Radio, Settings2 } from 'lucide-react';
import { BusinessPolicySection } from '@/components/seller/settings/BusinessPolicySection';
import { FeatureToggleRow } from '@/components/seller/settings/FeatureToggleRow';
import { NotificationToggleRow } from '@/components/seller/settings/NotificationToggleRow';
import { SettingsSectionCard } from '@/components/seller/settings/SettingsSectionCard';
import type { BusinessPolicy, TenantSettingsApiPayload, UnifiedSettingsView } from '@/types/tenant-settings';

type OrderStageKey = 'enquiries' | 'sales_orders' | 'invoices';

function orderStageLabels(key: OrderStageKey): { title: string; plural: string } {
  switch (key) {
    case 'enquiries': return { title: 'Estimates', plural: 'estimates' };
    case 'sales_orders': return { title: 'Sales orders', plural: 'sales orders' };
    case 'invoices': return { title: 'Invoices', plural: 'invoices' };
  }
}

async function uploadLogo(file: File): Promise<string> {
  const res = await fetch('/api/uploads/r2/logo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: file.size }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Failed to get upload URL');
  }
  const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };
  if (uploadUrl && !uploadUrl.includes('undefined')) {
    const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
  }
  return publicUrl;
}

export interface GeneralSettingsFormProps {
  data: TenantSettingsApiPayload | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  draft: UnifiedSettingsView | null;
  setDraft: React.Dispatch<React.SetStateAction<UnifiedSettingsView | null>>;
  pendingOff: OrderStageKey | null;
  setPendingOff: React.Dispatch<React.SetStateAction<OrderStageKey | null>>;
  onOrderFeatureChange: (key: OrderStageKey, checked: boolean) => void;
  onConfirmDisableStage: () => void;
  onCampaignsToggle: (enabled: boolean) => void;
  isSaving: boolean;
}

export function GeneralSettingsForm({
  data,
  isLoading,
  error,
  refetch,
  draft,
  setDraft,
  pendingOff,
  setPendingOff,
  onOrderFeatureChange,
  onConfirmDisableStage,
  onCampaignsToggle,
  isSaving: _isSaving,
}: GeneralSettingsFormProps) {
  // ── Update helpers ──

  function updateBusiness(partial: Partial<UnifiedSettingsView['business']>) {
    setDraft((prev) => prev ? { ...prev, business: { ...prev.business, ...partial } } : prev);
  }

  function updateAddress(partial: Partial<UnifiedSettingsView['business']['address']>) {
    setDraft((prev) =>
      prev ? { ...prev, business: { ...prev.business, address: { ...prev.business.address, ...partial } } } : prev,
    );
  }

  function updateBusinessPolicy(business_policy: BusinessPolicy) {
    setDraft((prev) => prev ? { ...prev, business_policy } : prev);
  }

  function updateNotifications(partial: Partial<UnifiedSettingsView['notifications']['whatsapp']>) {
    setDraft((prev) =>
      prev ? { ...prev, notifications: { whatsapp: { ...prev.notifications.whatsapp, ...partial } } } : prev,
    );
  }

  function updateOrders(partial: Partial<UnifiedSettingsView['orders']>) {
    setDraft((prev) => prev ? { ...prev, orders: { ...prev.orders, ...partial } } : prev);
  }

  function updateOrderFeature(partial: Partial<UnifiedSettingsView['orders']['features']>) {
    setDraft((prev) =>
      prev ? { ...prev, orders: { ...prev.orders, features: { ...prev.orders.features, ...partial } } } : prev,
    );
  }

  function updateCatalog(partial: Partial<UnifiedSettingsView['catalog']>) {
    setDraft((prev) => prev ? { ...prev, catalog: { ...prev.catalog, ...partial } } : prev);
  }

  function updateBuyerApp(partial: Partial<UnifiedSettingsView['buyer_app']>) {
    setDraft((prev) => prev ? { ...prev, buyer_app: { ...prev.buyer_app, ...partial } } : prev);
  }

  // ── Loading / error ──

  if (isLoading || !draft) {
    return (
      <div className="w-full space-y-4" aria-busy="true">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="h-96 animate-pulse rounded-xl border border-cream-100 bg-cream-50" />
            <div className="h-64 animate-pulse rounded-xl border border-cream-100 bg-cream-50" />
          </div>
          <div className="h-[600px] animate-pulse rounded-xl border border-cream-100 bg-cream-50" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full rounded-lg border border-ember-200 bg-ember-50 px-4 py-3 text-base text-ember-900">
        <p className="font-medium">Could not load settings.</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={refetch}>
          Retry
        </Button>
      </div>
    );
  }

  const campaignsDepsOff = !draft.catalog.price_lists_enabled || !draft.catalog.cohort_pricing_enabled;

  const pendingCount =
    pendingOff === 'enquiries' ? draft.open_counts.enquiries
    : pendingOff === 'sales_orders' ? draft.open_counts.sales_orders
    : pendingOff === 'invoices' ? draft.open_counts.invoices
    : 0;
  const pendingLabels = pendingOff ? orderStageLabels(pendingOff) : { title: '', plural: '' };

  const logoUrls = draft.business.logo_url ? [draft.business.logo_url] : [];

  return (
    <div className="w-full space-y-4">
      {/* 2-column grid */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">

        {/* ── Col 1: Business Profile + Business Policy ── */}
        <div className="space-y-6">

          {/* Business Profile */}
          <SettingsSectionCard
            title="Business Profile"
            subtitle="Appears on buyer-facing documents, invoices, and the buyer app."
            icon={Building2}
          >
            <div className="flex flex-col gap-4 border-b border-cream-200 pb-5 sm:flex-row sm:items-start">
              <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[14px] border-2 border-dashed border-cream-400 bg-cream-50">
                {logoUrls[0] ? (
                  <Image
                    src={logoUrls[0]}
                    alt="Company logo"
                    fill
                    sizes="72px"
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-cream-500">
                    <span className="text-sm">No logo</span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-base font-medium text-cream-900">Company logo</p>
                <p className="text-sm text-cream-600">PNG, JPG or WebP, up to 5 MB.</p>
                <BrowseUploadField
                  value={logoUrls}
                  onChange={(urls) => updateBusiness({ logo_url: urls[0] ?? null })}
                  maxFiles={1}
                  uploadFile={uploadLogo}
                  label="Upload logo"
                  helperText="JPG, PNG, WebP • Max 5MB"
                  emptyLabel="Drop an image here or browse"
                  previewInline
                  className="max-w-md"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company_name">
                  Company name <span className="text-ember-600">*</span>
                </Label>
                <Input
                  id="company_name"
                  value={draft.business.company_name}
                  onChange={(e) => updateBusiness({ company_name: e.target.value })}
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gstin">GSTIN</Label>
                <Input
                  id="gstin"
                  value={draft.business.gstin}
                  onChange={(e) => updateBusiness({ gstin: e.target.value.toUpperCase() })}
                  maxLength={15}
                  className="font-mono text-sm"
                  placeholder="15-character GSTIN"
                />
              </div>
            </div>

            <div className="space-y-3">
              <p className="eyebrow text-cream-600">Registered Address</p>
              <div className="space-y-2">
                <Label htmlFor="addr1">Address line 1</Label>
                <Input id="addr1" value={draft.business.address.line1} onChange={(e) => updateAddress({ line1: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr2">Address line 2</Label>
                <Input id="addr2" value={draft.business.address.line2} onChange={(e) => updateAddress({ line2: e.target.value })} placeholder="Landmark, floor, etc. (optional)" />
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_100px_110px]">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={draft.business.address.city} onChange={(e) => updateAddress({ city: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" value={draft.business.address.state} onChange={(e) => updateAddress({ state: e.target.value.toUpperCase() })} maxLength={2} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pin">Pincode</Label>
                  <Input id="pin" value={draft.business.address.pincode} onChange={(e) => updateAddress({ pincode: e.target.value })} maxLength={10} className="font-mono text-sm" />
                </div>
              </div>
            </div>

            {/* Phone fields — +91 prefix, 10-digit numeric */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Business phone</Label>
                <div className="flex items-stretch">
                  <span className="inline-flex items-center rounded-l-sm border border-r-0 border-cream-300 bg-cream-200 px-3 text-sm text-cream-700">
                    +91
                  </span>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    value={draft.business.phone}
                    onChange={(e) => updateBusiness({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    maxLength={10}
                    className="rounded-l-none font-mono tracking-wide"
                    placeholder="9876543210"
                  />
                </div>
                <p className="text-sm text-cream-600">WhatsApp sender number for OTP messages</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Business email</Label>
                <Input id="email" type="email" value={draft.business.email} onChange={(e) => updateBusiness({ email: e.target.value })} autoComplete="email" />
                <p className="text-sm text-cream-600">Reply-to on order confirmation emails</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="buyer-whatsapp">WhatsApp number (buyer app)</Label>
              <div className="flex items-stretch max-w-xs">
                <span className="inline-flex items-center rounded-l-sm border border-r-0 border-cream-300 bg-cream-200 px-3 text-sm text-cream-700">
                  +91
                </span>
                <Input
                  id="buyer-whatsapp"
                  type="tel"
                  inputMode="numeric"
                  value={draft.buyer_app.whatsapp_number}
                  onChange={(e) => updateBuyerApp({ whatsapp_number: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  maxLength={10}
                  className="rounded-l-none font-mono tracking-wide"
                  placeholder="9876543210"
                />
              </div>
              <p className="text-sm text-cream-600">Shown to buyers for support in the buyer app.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="buyer-whatsapp-display-name">WhatsApp display name</Label>
              <Input
                id="buyer-whatsapp-display-name"
                value={draft.buyer_app.whatsapp_display_name}
                onChange={(e) => updateBuyerApp({ whatsapp_display_name: e.target.value })}
                maxLength={200}
                placeholder="WineYard"
              />
              <p className="text-sm text-cream-600">Name shown to buyers in WhatsApp messages. Falls back to company name if empty.</p>
            </div>
          </SettingsSectionCard>

          {/* Business Policy */}
          <BusinessPolicySection
            value={draft.business_policy}
            onChange={updateBusinessPolicy}
            defaultUom={draft.product_defaults.uom}
            onDefaultUomChange={(uom) => setDraft((d) => d ? { ...d, product_defaults: { uom } } : d)}
            routingThresholdKm={draft.delivery_routing_threshold_km}
            onRoutingThresholdKmChange={(km) => setDraft((d) => d ? { ...d, delivery_routing_threshold_km: km } : d)}
          />
        </div>

        {/* ── Col 2: Feature Toggles ── */}
        <SettingsSectionCard
          title="Feature Toggles"
          subtitle="Enable or disable modules. Data is never deleted — features can be re-enabled at any time."
          icon={Settings2}
        >
          {/* Order stages */}
          <div className="px-5 pb-1 pt-4">
            <p className="eyebrow text-cream-600">Order workflow</p>
          </div>

          {/* Estimates */}
          <FeatureToggleRow
            label="Estimates"
            description="Let buyers request quotes before committing to an order."
            checked={draft.orders.features.enquiries}
            onCheckedChange={(v) => onOrderFeatureChange('enquiries', v)}
            hideBorderBottom={draft.orders.features.enquiries}
          />
          {draft.orders.features.enquiries && (
            <div className="border-b border-cream-200 bg-cream-50 pl-10 pr-5 pb-4 pt-2">
              <FeatureToggleRow
                label="Allow creation of Estimates in Yukti"
                description="When off, estimates are created in Zoho or another system — Yukti only tracks them."
                checked={draft.orders.features.create_enquiries}
                onCheckedChange={(v) => updateOrderFeature({ create_enquiries: v })}
              />
              {draft.orders.features.create_enquiries && (
                <p className="px-5 pb-1 text-xs text-cream-500">
                  Number format is auto-derived from your most recent estimate.
                </p>
              )}
            </div>
          )}

          {/* Sales Orders */}
          <FeatureToggleRow
            label="Sales Orders"
            description="Formal order documents after a quote is accepted."
            checked={draft.orders.features.sales_orders}
            onCheckedChange={(v) => onOrderFeatureChange('sales_orders', v)}
            hideBorderBottom={draft.orders.features.sales_orders}
          />
          {draft.orders.features.sales_orders && (
            <div className="border-b border-cream-200 bg-cream-50 pl-10 pr-5 pb-4 pt-2">
              <FeatureToggleRow
                label="Allow creation of Sales Orders in Yukti"
                description="When off, sales orders are created in Zoho or another system — Yukti only tracks them."
                checked={draft.orders.features.create_sales_orders}
                onCheckedChange={(v) => updateOrderFeature({ create_sales_orders: v })}
              />
              {draft.orders.features.create_sales_orders && (
                <p className="px-5 pb-1 text-xs text-cream-500">
                  Number format is auto-derived from your most recent sales order.
                </p>
              )}
            </div>
          )}

          {/* Invoices */}
          <FeatureToggleRow
            label="Invoices"
            description="Bill buyers and track payment status."
            checked={draft.orders.features.invoices}
            onCheckedChange={(v) => onOrderFeatureChange('invoices', v)}
            hideBorderBottom={draft.orders.features.invoices}
          />
          {draft.orders.features.invoices && (
            <div className="border-b border-cream-200 bg-cream-50 pl-10 pr-5 pb-4 pt-2">
              <FeatureToggleRow
                label="Allow creation of Invoices in Yukti"
                description="When off, invoices are created in Zoho or another system — Yukti only tracks them."
                checked={draft.orders.features.create_invoices}
                onCheckedChange={(v) => updateOrderFeature({ create_invoices: v })}
              />
              {draft.orders.features.create_invoices && (
                <p className="px-5 pb-1 text-xs text-cream-500">
                  Number format is auto-derived from your most recent invoice.
                </p>
              )}
            </div>
          )}

          {/* Inventory lock stage */}
          <div className="border-t border-cream-200 bg-cream-50 px-5 py-4 space-y-2">
            <div className="flex items-center gap-2">
              <Radio size={14} className="text-cream-600" />
              <Label className="text-base font-medium">Lock inventory when</Label>
            </div>
            <div className="flex flex-col gap-2 pl-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="inventory_lock_stage"
                  value="invoice"
                  checked={draft.orders.inventory_lock_stage === 'invoice'}
                  onChange={() => updateOrders({ inventory_lock_stage: 'invoice' })}
                  className="accent-teal-600"
                />
                <span className="text-base text-cream-800">Invoice is created</span>
              </label>
              {draft.orders.features.sales_orders && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="inventory_lock_stage"
                    value="sales_order"
                    checked={draft.orders.inventory_lock_stage === 'sales_order'}
                    onChange={() => updateOrders({ inventory_lock_stage: 'sales_order' })}
                    className="accent-teal-600"
                  />
                  <span className="text-base text-cream-800">Order is accepted</span>
                </label>
              )}
            </div>
            <p className="text-sm text-cream-600">When stock is reserved against demand in your workflow.</p>
          </div>

          {/* Pricing & campaigns */}
          <div className="border-t border-cream-200 px-5 pb-1 pt-4">
            <p className="eyebrow text-cream-600">Pricing &amp; campaigns</p>
          </div>

          <FeatureToggleRow
            label="Pricelists"
            description="Create custom price lists and assign them to buyer groups."
            checked={draft.catalog.price_lists_enabled}
            onCheckedChange={(price_lists_enabled) => updateCatalog({ price_lists_enabled })}
          />

          <FeatureToggleRow
            label="Customer Groups"
            description="Segment buyers into groups for targeted pricing."
            checked={draft.catalog.cohort_pricing_enabled}
            onCheckedChange={(cohort_pricing_enabled) => updateCatalog({ cohort_pricing_enabled })}
          />

          <FeatureToggleRow
            label="Campaigns"
            description={
              campaignsDepsOff && !draft.catalog.catalog_publishing_enabled
                ? 'Enable Pricelists and Customer Groups first to unlock Campaigns.'
                : 'Publish buyer-facing catalog campaigns with share links.'
            }
            checked={draft.catalog.catalog_publishing_enabled}
            onCheckedChange={onCampaignsToggle}
            disabled={campaignsDepsOff && !draft.catalog.catalog_publishing_enabled}
          />

          {/* Buyer App */}
          <div className="border-t border-cream-200 px-5 pb-1 pt-4">
            <p className="eyebrow text-cream-600">Buyer app</p>
          </div>

          <FeatureToggleRow
            label="Buyer App"
            description="WhatsApp-first storefront for your buyers."
            checked={draft.buyer_app.enabled}
            onCheckedChange={(enabled) => updateBuyerApp({ enabled })}
            hideBorderBottom={draft.buyer_app.enabled}
          />

          {draft.buyer_app.enabled && (
            <div className="border-b border-cream-200 bg-cream-50 pl-10 pr-5 pb-4 pt-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-cream-600 pb-2 pt-1">WhatsApp notifications (Credits Based)</p>
              <NotificationToggleRow
                label="Buyer enquiry received"
                description="Notify you when a buyer submits a quote request."
                checked={draft.notifications.whatsapp.enquiry_received}
                onCheckedChange={(v) => updateNotifications({ enquiry_received: v })}
              />
              <NotificationToggleRow
                label="Order placed by buyer"
                description="Notify you when a buyer places a new order."
                checked={draft.notifications.whatsapp.order_placed}
                onCheckedChange={(v) => updateNotifications({ order_placed: v })}
              />
              <NotificationToggleRow
                label="Order confirmed — notify buyer"
                description="Send buyer a WhatsApp when you confirm their order."
                checked={draft.notifications.whatsapp.order_confirmed_to_buyer}
                onCheckedChange={(v) => updateNotifications({ order_confirmed_to_buyer: v })}
              />
              <NotificationToggleRow
                label="Order dispatched — notify buyer"
                description="Send buyer a dispatch update via WhatsApp."
                checked={draft.notifications.whatsapp.dispatch_to_buyer}
                onCheckedChange={(v) => updateNotifications({ dispatch_to_buyer: v })}
              />
              <NotificationToggleRow
                label="Campaign shared — notify buyer"
                description="Send buyer a WhatsApp when a catalog is shared with them."
                checked={draft.notifications.whatsapp.catalog_shared_to_buyer}
                onCheckedChange={(v) => updateNotifications({ catalog_shared_to_buyer: v })}
              />
              <NotificationToggleRow
                label="OTP delivery"
                description="WhatsApp OTP for buyer login — always on."
                checked={true}
                onCheckedChange={() => {}}
                readOnlySystemOn
              />
            </div>
          )}
        </SettingsSectionCard>
      </div>

      {/* Disable stage confirmation dialog */}
      <AlertDialog open={pendingOff !== null} onOpenChange={(open) => !open && setPendingOff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {pendingLabels.title.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              You have <strong>{pendingCount}</strong> open {pendingLabels.plural}. Disabling will hide them from the cockpit but not delete them. They can be re-enabled at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" onClick={() => setPendingOff(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={onConfirmDisableStage}>
              Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
