'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, LayoutGrid, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FeatureModuleCard } from '@/components/seller/settings/FeatureModuleCard';
import { FeatureToggleRow } from '@/components/seller/settings/FeatureToggleRow';
import { NumberFormatBuilder } from '@/components/seller/settings/NumberFormatBuilder';
import { ProductDefaultsSection } from '@/components/seller/settings/ProductDefaultsSection';
import { TierLimitWarningBanner } from '@/components/seller/settings/TierLimitWarningBanner';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import { INVENTORY_LOCK_STAGE_OPTIONS, PRICE_VISIBILITY_OPTIONS } from '@/constants/settings-modules';
import { previewOrderNumberFormat } from '@/lib/tenant-settings/order-number-format';
import { TenantSettingsPatchSchema } from '@/types/tenant-settings';
import type { ModuleSettingsView, TenantSettingsPatch } from '@/types/tenant-settings';

type OrderStageKey = 'enquiries' | 'sales_orders' | 'invoices';

function cloneModules(m: ModuleSettingsView): ModuleSettingsView {
  return structuredClone(m);
}

function orderStageLabels(key: OrderStageKey): { title: string; plural: string } {
  switch (key) {
    case 'enquiries':
      return { title: 'Estimates', plural: 'estimates' };
    case 'sales_orders':
      return { title: 'Sales orders', plural: 'sales orders' };
    case 'invoices':
      return { title: 'Invoices', plural: 'invoices' };
  }
}

function buildModulesPatch(base: ModuleSettingsView, next: ModuleSettingsView): TenantSettingsPatch {
  const patch: TenantSettingsPatch = {};
  if (JSON.stringify(base.product_defaults) !== JSON.stringify(next.product_defaults)) {
    patch.product_defaults = next.product_defaults;
  }
  if (JSON.stringify(base.orders) !== JSON.stringify(next.orders)) {
    patch.orders = {
      enquiry_number_format: next.orders.enquiry_number_format,
      sales_order_number_format: next.orders.sales_order_number_format,
      invoice_number_format: next.orders.invoice_number_format,
      inventory_lock_stage: next.orders.inventory_lock_stage,
      invoice_pdf_enabled: next.orders.invoice_pdf_enabled,
      features: next.orders.features,
    };
  }
  if (JSON.stringify(base.buyer_app) !== JSON.stringify(next.buyer_app)) {
    patch.buyer_app = { ...next.buyer_app };
  }
  if (JSON.stringify(base.catalog) !== JSON.stringify(next.catalog)) {
    patch.catalog = { ...next.catalog };
  }
  return patch;
}

function modulesEditableDirty(base: ModuleSettingsView, next: ModuleSettingsView): boolean {
  return (
    JSON.stringify(base.product_defaults) !== JSON.stringify(next.product_defaults) ||
    JSON.stringify(base.orders) !== JSON.stringify(next.orders) ||
    JSON.stringify(base.buyer_app) !== JSON.stringify(next.buyer_app) ||
    JSON.stringify(base.catalog) !== JSON.stringify(next.catalog)
  );
}

export function ModuleSettingsForm() {
  const { data, isLoading, error, refetch, save, isSaving } = useTenantSettings();
  const [draft, setDraft] = useState<ModuleSettingsView | null>(null);
  const [pendingOff, setPendingOff] = useState<OrderStageKey | null>(null);

  useEffect(() => {
    if (data) setDraft(cloneModules(data.modules));
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return modulesEditableDirty(data.modules, draft);
  }, [data, draft]);

  function handleDiscard() {
    if (data) setDraft(cloneModules(data.modules));
  }

  async function handleSave() {
    if (!data || !draft) return;

    // Auto-reset inventory lock stage if the selected stage is being disabled
    let finalDraft = draft;
    if (
      draft.orders.inventory_lock_stage === 'enquiry' &&
      !draft.orders.features.enquiries
    ) {
      const resetTo = draft.orders.features.sales_orders
        ? 'sales_order'
        : draft.orders.features.invoices
          ? 'invoice'
          : 'sales_order';
      finalDraft = {
        ...draft,
        orders: { ...draft.orders, inventory_lock_stage: resetTo },
      };
      setDraft(finalDraft);
      toast.warning('Inventory lock stage reset to Sales Order because Estimates was disabled.');
    }

    const patch = buildModulesPatch(data.modules, finalDraft);
    if (Object.keys(patch).length === 0) return;
    const parsed = TenantSettingsPatchSchema.safeParse(patch);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? 'Invalid settings');
      return;
    }
    await save(parsed.data);
  }

  function handleOrderFeatureChange(key: OrderStageKey, checked: boolean) {
    if (!draft) return;
    if (checked) {
      setDraft((d) =>
        d
          ? {
              ...d,
              orders: {
                ...d.orders,
                features: { ...d.orders.features, [key]: true },
              },
            }
          : d,
      );
      return;
    }
    const count =
      key === 'enquiries'
        ? draft.open_counts.enquiries
        : key === 'sales_orders'
          ? draft.open_counts.sales_orders
          : draft.open_counts.invoices;
    if (count > 0) {
      setPendingOff(key);
      return;
    }
    setDraft((d) =>
      d
        ? {
            ...d,
            orders: {
              ...d.orders,
              features: { ...d.orders.features, [key]: false },
            },
          }
        : d,
    );
  }

  function confirmDisableStage() {
    if (!pendingOff || !draft) return;
    const key = pendingOff;
    setDraft({
      ...draft,
      orders: {
        ...draft.orders,
        features: { ...draft.orders.features, [key]: false },
      },
    });
    setPendingOff(null);
  }

  if (isLoading || !draft) {
    return (
      <div className="w-full space-y-6" aria-busy="true">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-40 animate-pulse rounded-xl border border-cream-100 bg-cream-50" />
          <div className="h-52 animate-pulse rounded-xl border border-cream-100 bg-cream-50" />
        </div>
        <div className="h-52 animate-pulse rounded-xl border border-cream-100 bg-cream-50" />
        <div className="h-52 animate-pulse rounded-xl border border-cream-100 bg-cream-50" />
        <div className="h-52 animate-pulse rounded-xl border border-cream-100 bg-cream-50" />
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

  const pendingCount =
    pendingOff === 'enquiries'
      ? draft.open_counts.enquiries
      : pendingOff === 'sales_orders'
        ? draft.open_counts.sales_orders
        : pendingOff === 'invoices'
          ? draft.open_counts.invoices
          : 0;
  const pendingLabels = pendingOff ? orderStageLabels(pendingOff) : { title: '', plural: '' };

  return (
    <div className="w-full space-y-6">
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <ProductDefaultsSection
          className="mb-0"
          value={draft.product_defaults}
          onChange={(product_defaults) => setDraft((d) => (d ? { ...d, product_defaults } : d))}
        />

        <FeatureModuleCard
          className="mb-0"
          title="Order Workflows"
          description="Configure how orders flow through your system — from estimate to invoice."
          icon={FileText}
          headerActive
          headerRight={
            <span className="rounded-md bg-teal-100 px-2 py-0.5 text-sm font-medium text-teal-800">Always on</span>
          }
        >
        {/* Inventory lock stage — always visible */}
        <div className="border-t border-cream-200 bg-cream-50 px-5 py-4 space-y-2">
          <Label className="text-base font-medium">Inventory lock stage</Label>
          <Select
            value={draft.orders.inventory_lock_stage}
            onValueChange={(v) =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      orders: {
                        ...d.orders,
                        inventory_lock_stage: v as ModuleSettingsView['orders']['inventory_lock_stage'],
                      },
                    }
                  : d,
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVENTORY_LOCK_STAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-cream-600">When stock is reserved against demand in your workflow.</p>
        </div>

        {/* Estimates */}
        <FeatureToggleRow
          label="Enable Estimates"
          description="Let buyers request quotes before committing to an order."
          checked={draft.orders.features.enquiries}
          onCheckedChange={(v) => handleOrderFeatureChange('enquiries', v)}
        />
        {draft.orders.features.enquiries && (
          <div className="border-b border-cream-200 bg-cream-50 px-5 py-4 space-y-4">
            <NumberFormatBuilder
              label="Estimate number format"
              value={draft.orders.enquiry_number_format}
              onChange={(enquiry_number_format) =>
                setDraft((d) => (d ? { ...d, orders: { ...d.orders, enquiry_number_format } } : d))
              }
              preview={previewOrderNumberFormat(draft.orders.enquiry_number_format)}
              defaultValue="EST-{YYYY}-{SEQ}"
            />
          </div>
        )}

        {/* Sales Orders */}
        <FeatureToggleRow
          label="Enable Sales Orders"
          description="Formal order documents after a quote is accepted."
          checked={draft.orders.features.sales_orders}
          onCheckedChange={(v) => handleOrderFeatureChange('sales_orders', v)}
        />
        {draft.orders.features.sales_orders && (
          <div className="border-b border-cream-200 bg-cream-50 px-5 py-4 space-y-4">
            <NumberFormatBuilder
              label="Sales order number format"
              value={draft.orders.sales_order_number_format}
              onChange={(sales_order_number_format) =>
                setDraft((d) => (d ? { ...d, orders: { ...d.orders, sales_order_number_format } } : d))
              }
              preview={previewOrderNumberFormat(draft.orders.sales_order_number_format)}
              defaultValue="SO-{YYYY}-{SEQ}"
            />
          </div>
        )}

        {/* Invoices */}
        <FeatureToggleRow
          label="Enable Invoices"
          description="Bill buyers and track payment status."
          checked={draft.orders.features.invoices}
          onCheckedChange={(v) => handleOrderFeatureChange('invoices', v)}
        />
        {draft.orders.features.invoices && (
          <div className="border-b border-cream-200 bg-cream-50 px-5 py-4 space-y-4">
            <NumberFormatBuilder
              label="Invoice number format"
              value={draft.orders.invoice_number_format}
              onChange={(invoice_number_format) =>
                setDraft((d) => (d ? { ...d, orders: { ...d.orders, invoice_number_format } } : d))
              }
              preview={previewOrderNumberFormat(draft.orders.invoice_number_format)}
              defaultValue="INV-{YYYY}-{SEQ}"
            />
            <FeatureToggleRow
              label="Invoice PDF"
              description="Generate a PDF when an invoice is created or updated."
              checked={draft.orders.invoice_pdf_enabled}
              onCheckedChange={(invoice_pdf_enabled) =>
                setDraft((d) => (d ? { ...d, orders: { ...d.orders, invoice_pdf_enabled } } : d))
              }
            />
          </div>
        )}
      </FeatureModuleCard>
      </div>

      <FeatureModuleCard
        title="Buyer App"
        description="WhatsApp-first storefront for your buyers — catalog, cart, and order tracking."
        icon={Smartphone}
        headerActive={draft.buyer_app.enabled}
        headerRight={
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-cream-700">Enable</span>
            <Switch
              checked={draft.buyer_app.enabled}
              onCheckedChange={(enabled) => setDraft((d) => (d ? { ...d, buyer_app: { ...d.buyer_app, enabled } } : d))}
              aria-label="Enable buyer app"
            />
          </div>
        }
      >
        {!draft.buyer_app.enabled ? (
          <div className="border-t border-cream-200 px-5 py-4 text-base text-cream-600">
            Turn on the buyer app to share catalogs and let customers place orders from their phone.
          </div>
        ) : (
          <div className="border-t border-cream-200 bg-cream-50 px-5 py-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-base font-medium" htmlFor="buyer-whatsapp">WhatsApp number</Label>
              <Input
                id="buyer-whatsapp"
                value={draft.buyer_app.whatsapp_number}
                onChange={(e) =>
                  setDraft((d) =>
                    d ? { ...d, buyer_app: { ...d.buyer_app, whatsapp_number: e.target.value } } : d,
                  )
                }
                placeholder="+91 …"
                maxLength={40}
              />
              <p className="text-sm text-cream-600">Shown to buyers for support and OTP delivery where applicable.</p>
            </div>
            <FeatureToggleRow
              label="Share link expiry"
              description="Automatically expire catalog share links after a set number of days."
              checked={draft.buyer_app.share_link_expiry_enabled}
              onCheckedChange={(share_link_expiry_enabled) =>
                setDraft((d) => (d ? { ...d, buyer_app: { ...d.buyer_app, share_link_expiry_enabled } } : d))
              }
            />
            {draft.buyer_app.share_link_expiry_enabled ? (
              <div className="space-y-2 border-t border-cream-200 pt-4">
                <Label className="text-base font-medium" htmlFor="share-expiry-days">Expiry (days)</Label>
                <Input
                  id="share-expiry-days"
                  type="number"
                  min={1}
                  max={3650}
                  className="max-w-[140px]"
                  value={draft.buyer_app.share_link_expiry_days}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isNaN(n)) return;
                    setDraft((d) =>
                      d ? { ...d, buyer_app: { ...d.buyer_app, share_link_expiry_days: n } } : d,
                    );
                  }}
                />
              </div>
            ) : null}
            <FeatureToggleRow
              label="Show credit limit"
              description="Let buyers see their approved credit in the app."
              checked={draft.buyer_app.credit_limit_visible}
              onCheckedChange={(credit_limit_visible) =>
                setDraft((d) => (d ? { ...d, buyer_app: { ...d.buyer_app, credit_limit_visible } } : d))
              }
            />
            <FeatureToggleRow
              label="Show out-of-stock products"
              description="Display OOS items in catalog (read-only) vs hide them entirely."
              checked={draft.buyer_app.show_out_of_stock}
              onCheckedChange={(show_out_of_stock) =>
                setDraft((d) => (d ? { ...d, buyer_app: { ...d.buyer_app, show_out_of_stock } } : d))
              }
            />
          </div>
        )}
      </FeatureModuleCard>

      <FeatureModuleCard
        title="Catalog & Pricing"
        description="Cohort-specific pricing and publishing buyer-facing catalogs."
        icon={LayoutGrid}
        headerActive={draft.catalog.cohort_pricing_enabled || draft.catalog.catalog_publishing_enabled}
      >
        <div className="border-t border-cream-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-cream-600">
          Cohort pricing
        </div>
        <FeatureToggleRow
          label="Cohort pricing"
          description="Different prices for different buyer groups via cohorts and price lists."
          checked={draft.catalog.cohort_pricing_enabled}
          onCheckedChange={(cohort_pricing_enabled) =>
            setDraft((d) => (d ? { ...d, catalog: { ...d.catalog, cohort_pricing_enabled } } : d))
          }
        />
        {draft.catalog.cohort_pricing_enabled ? (
          <div className="border-b border-cream-200 bg-cream-50 px-5 py-4 space-y-3">
            <TierLimitWarningBanner plan={draft.plan} resource="cohorts" used={draft.usage.cohorts} />
            <div className="space-y-2">
              <Label className="text-base font-medium">Price visibility</Label>
              <Select
                value={draft.catalog.price_visibility}
                onValueChange={(v) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          catalog: {
                            ...d.catalog,
                            price_visibility: v as ModuleSettingsView['catalog']['price_visibility'],
                          },
                        }
                      : d,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_VISIBILITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        <div className="border-t border-cream-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-cream-600">
          Catalog publishing
        </div>
        <FeatureToggleRow
          label="Catalog publishing"
          description="Create share links and published catalogs for buyers."
          checked={draft.catalog.catalog_publishing_enabled}
          onCheckedChange={(catalog_publishing_enabled) =>
            setDraft((d) => (d ? { ...d, catalog: { ...d.catalog, catalog_publishing_enabled } } : d))
          }
        />
        {draft.catalog.catalog_publishing_enabled ? (
          <div className="border-b border-cream-200 bg-cream-50 px-5 py-4 space-y-2">
            <Label className="text-base font-medium" htmlFor="catalog-expiry-days">Default catalog expiry (days)</Label>
            <Input
              id="catalog-expiry-days"
              type="number"
              min={0}
              max={3650}
              className="max-w-[140px]"
              value={draft.catalog.default_catalog_expiry_days}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isNaN(n)) return;
                setDraft((d) =>
                  d ? { ...d, catalog: { ...d.catalog, default_catalog_expiry_days: n } } : d,
                );
              }}
            />
            <p className="text-sm text-cream-600">Use 0 for no default expiry when publishing.</p>
          </div>
        ) : null}
      </FeatureModuleCard>

      <div className="flex justify-end gap-3 pb-8">
        <Button type="button" variant="ghost" disabled={!dirty || isSaving} onClick={handleDiscard}>
          Discard changes
        </Button>
        <Button type="button" disabled={!dirty || isSaving} onClick={() => void handleSave()}>
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      <AlertDialog open={pendingOff !== null} onOpenChange={(open) => !open && setPendingOff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {pendingLabels.title.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              You have <strong>{pendingCount}</strong> open {pendingLabels.plural}. Disabling will hide them from the
              cockpit but not delete them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={confirmDisableStage}>
              Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
