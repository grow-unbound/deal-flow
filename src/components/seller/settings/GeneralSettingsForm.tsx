'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Bell, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BrowseUploadField } from '@/components/ui/browse-upload-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BusinessPolicySection } from '@/components/seller/settings/BusinessPolicySection';
import { NotificationToggleRow } from '@/components/seller/settings/NotificationToggleRow';
import { SettingsSectionCard } from '@/components/seller/settings/SettingsSectionCard';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import { TenantSettingsPatchSchema } from '@/types/tenant-settings';
import type { BusinessPolicy, GeneralSettingsView, TenantSettingsPatch } from '@/types/tenant-settings';
import { Navigation2 } from 'lucide-react';

function cloneView(v: GeneralSettingsView): GeneralSettingsView {
  return structuredClone(v);
}

export function GeneralSettingsForm() {
  const { data, isLoading, error, refetch, save, isSaving } = useTenantSettings();
  const [draft, setDraft] = useState<GeneralSettingsView | null>(null);

  useEffect(() => {
    if (data) setDraft(cloneView(data.general));
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(data.general) !== JSON.stringify(draft);
  }, [data, draft]);

  function updateBusiness(partial: Partial<GeneralSettingsView['business']>) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        business: { ...prev.business, ...partial },
      };
    });
  }

  function updateAddress(partial: Partial<GeneralSettingsView['business']['address']>) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        business: {
          ...prev.business,
          address: { ...prev.business.address, ...partial },
        },
      };
    });
  }

  function updateWhatsapp(partial: Partial<GeneralSettingsView['notifications']['whatsapp']>) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notifications: {
          ...prev.notifications,
          whatsapp: { ...prev.notifications.whatsapp, ...partial },
        },
      };
    });
  }

  function updateBusinessPolicy(business_policy: BusinessPolicy) {
    setDraft((prev) => (prev ? { ...prev, business_policy } : prev));
  }

  function updateRoutingThreshold(km: number) {
    setDraft((prev) => (prev ? { ...prev, delivery_routing_threshold_km: km } : prev));
  }

  function handleDiscard() {
    if (data) setDraft(cloneView(data.general));
  }

  async function handleSave() {
    if (!draft) return;
    const patch: TenantSettingsPatch = {
      business: draft.business,
      notifications: { whatsapp: draft.notifications.whatsapp },
      business_policy: draft.business_policy,
      delivery_routing_threshold_km: draft.delivery_routing_threshold_km,
    };
    const parsed = TenantSettingsPatchSchema.safeParse(patch);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? 'Invalid settings');
      return;
    }
    await save(parsed.data);
  }

  if (isLoading || !draft) {
    return (
      <div className="w-full space-y-6" aria-busy="true">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-xl border border-cream-100 bg-cream-50" />
          <div className="h-64 animate-pulse rounded-xl border border-cream-100 bg-cream-50" />
        </div>
        <div className="h-72 animate-pulse rounded-xl border border-cream-100 bg-cream-50" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full rounded-lg border border-ember-200 bg-ember-50 px-4 py-3 text-base text-ember-900">
        <p className="font-medium">Could not load settings.</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const logoUrls = draft.business.logo_url ? [draft.business.logo_url] : [];

  return (
    <div className="w-full space-y-6">
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <SettingsSectionCard
          className="mb-0"
          title="Business Profile"
          subtitle="Appears on buyer-facing documents, invoices, and the buyer app."
          icon={Building2}
        >
        <div className="flex flex-col gap-4 border-b border-cream-200 pb-5 sm:flex-row sm:items-start">
          <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[14px] border-2 border-dashed border-cream-400 bg-cream-50">
            {logoUrls[0] ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote tenant logo URL
              <img src={logoUrls[0]} alt="Company logo" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-cream-500">
                <span className="text-sm">No logo</span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-base font-medium text-cream-900">Company logo</p>
            <p className="text-sm text-cream-600">PNG, JPG or WebP, up to 5 MB. Used on invoices and in the buyer app.</p>
            <BrowseUploadField
              value={logoUrls}
              onChange={(urls) => updateBusiness({ logo_url: urls[0] ?? null })}
              maxFiles={1}
              label="Upload logo"
              helperText="JPG, PNG, WebP • Max 5MB"
              emptyLabel="Drop an image here or browse from your computer"
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
            <p className="text-sm text-cream-600">Your 15-character GST Identification Number</p>
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
            <Input
              id="addr2"
              value={draft.business.address.line2}
              onChange={(e) => updateAddress({ line2: e.target.value })}
              placeholder="Landmark, floor, etc. (optional)"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_100px_110px]">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={draft.business.address.city} onChange={(e) => updateAddress({ city: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={draft.business.address.state}
                onChange={(e) => updateAddress({ state: e.target.value.toUpperCase() })}
                maxLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">Pincode</Label>
              <Input
                id="pin"
                value={draft.business.address.pincode}
                onChange={(e) => updateAddress({ pincode: e.target.value })}
                maxLength={10}
                className="font-mono text-sm"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Business phone</Label>
            <Input
              id="phone"
              type="tel"
              value={draft.business.phone}
              onChange={(e) => updateBusiness({ phone: e.target.value })}
              className="font-mono text-sm"
            />
            <p className="text-sm text-cream-600">WhatsApp sender number for OTP messages to buyers</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Business email</Label>
            <Input
              id="email"
              type="email"
              value={draft.business.email}
              onChange={(e) => updateBusiness({ email: e.target.value })}
              autoComplete="email"
            />
            <p className="text-sm text-cream-600">Reply-to address on order confirmation emails</p>
          </div>
        </div>
        </SettingsSectionCard>

        <BusinessPolicySection
          className="mb-0"
          value={draft.business_policy}
          onChange={updateBusinessPolicy}
        />
      </div>

      <SettingsSectionCard
        title="Order Routing"
        subtitle="Controls how buyer orders and enquiries are assigned to your warehouses."
        icon={Navigation2}
      >
        <div className="space-y-2">
          <Label htmlFor="routing_threshold">Nearest warehouse threshold (km)</Label>
          <div className="flex items-center gap-3">
            <Input
              id="routing_threshold"
              type="number"
              min={1}
              max={5000}
              step={10}
              value={draft.delivery_routing_threshold_km}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1 && v <= 5000) updateRoutingThreshold(v);
              }}
              className="w-32 font-mono text-sm"
            />
            <span className="text-sm text-cream-600">km</span>
          </div>
          <p className="text-sm text-cream-600">
            Orders and enquiries are assigned to the nearest warehouse within this radius. If no warehouse is within range, the default warehouse is used instead.
          </p>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="WhatsApp Notifications"
        subtitle="Each message uses one WhatsApp credit. Turn off anything that is not useful for your workflow."
        icon={Bell}
        footer={
          <div className="flex items-start gap-2 text-base text-cream-700">
            <Info size={14} className="mt-0.5 shrink-0 text-cream-500" aria-hidden />
            <span>
              Requires Buyer App to be enabled. Credits are managed in{' '}
              <Link href="/settings/billing" className="font-medium text-teal-600 hover:underline">
                Billing & Plan
              </Link>
              .
            </span>
          </div>
        }
      >
        <NotificationToggleRow
          label="Buyer enquiry received"
          description="Notifies you when a buyer submits an enquiry via the app"
          checked={draft.notifications.whatsapp.enquiry_received}
          onCheckedChange={(v) => updateWhatsapp({ enquiry_received: v })}
        />
        <NotificationToggleRow
          label="Order placed by buyer"
          description="Notifies you when a buyer places an order"
          checked={draft.notifications.whatsapp.order_placed}
          onCheckedChange={(v) => updateWhatsapp({ order_placed: v })}
        />
        <NotificationToggleRow
          label="Order confirmed — notify buyer"
          description="Sends a WhatsApp confirmation to the buyer when you confirm their order"
          checked={draft.notifications.whatsapp.order_confirmed_to_buyer}
          onCheckedChange={(v) => updateWhatsapp({ order_confirmed_to_buyer: v })}
        />
        <NotificationToggleRow
          label="Order dispatched — notify buyer"
          description="Sends a dispatch update to the buyer when you mark an order as dispatched"
          checked={draft.notifications.whatsapp.dispatch_to_buyer}
          onCheckedChange={(v) => updateWhatsapp({ dispatch_to_buyer: v })}
        />
        <NotificationToggleRow
          label="Catalog shared — notify buyer"
          description="Notifies the buyer when you create a catalog share link for them"
          checked={draft.notifications.whatsapp.catalog_shared_to_buyer}
          onCheckedChange={(v) => updateWhatsapp({ catalog_shared_to_buyer: v })}
        />
        <NotificationToggleRow
          label="OTP delivery"
          description="Login passcode sent to buyers when they sign in. Cannot be turned off."
          checked
          onCheckedChange={() => undefined}
          readOnlySystemOn
        />
      </SettingsSectionCard>

      <div className="flex justify-end gap-3 pb-8">
        <Button type="button" variant="ghost" disabled={!dirty || isSaving} onClick={handleDiscard}>
          Discard changes
        </Button>
        <Button type="button" disabled={!dirty || isSaving} onClick={() => void handleSave()}>
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
