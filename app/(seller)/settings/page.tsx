'use client';

import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { GeneralSettingsForm } from '@/components/seller/settings/GeneralSettingsForm';
import { PageWrap } from '@/components/seller/layout';
import { Button } from '@/components/ui/button';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import { TenantSettingsPatchSchema } from '@/types/tenant-settings';
import type { TenantSettingsPatch, UnifiedSettingsView } from '@/types/tenant-settings';

type OrderStageKey = 'enquiries' | 'sales_orders' | 'invoices';

function cloneUnified(v: UnifiedSettingsView): UnifiedSettingsView {
  return structuredClone(v);
}

export default function SettingsPage() {
  const { data, isLoading, error, refetch, save, isSaving } = useTenantSettings();
  const [draft, setDraft] = useState<UnifiedSettingsView | null>(null);
  const [pendingOff, setPendingOff] = useState<OrderStageKey | null>(null);

  useEffect(() => {
    if (data) setDraft(cloneUnified(data.unified));
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(data.unified) !== JSON.stringify(draft);
  }, [data, draft]);

  function handleDiscard() {
    if (data) setDraft(cloneUnified(data.unified));
  }

  function handleOrderFeatureChange(key: OrderStageKey, checked: boolean) {
    if (!draft) return;
    if (checked) {
      setDraft((prev) =>
        prev ? { ...prev, orders: { ...prev.orders, features: { ...prev.orders.features, [key]: true } } } : prev,
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
    setDraft((prev) =>
      prev ? { ...prev, orders: { ...prev.orders, features: { ...prev.orders.features, [key]: false } } } : prev,
    );
  }

  function confirmDisableStage() {
    if (!pendingOff) return;
    setDraft((prev) =>
      prev
        ? { ...prev, orders: { ...prev.orders, features: { ...prev.orders.features, [pendingOff]: false } } }
        : prev,
    );
    setPendingOff(null);
  }

  function handleCampaignsToggle(enabled: boolean) {
    if (enabled) {
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              catalog: {
                ...prev.catalog,
                catalog_publishing_enabled: true,
                price_lists_enabled: true,
                cohort_pricing_enabled: true,
              },
            }
          : prev,
      );
    } else {
      setDraft((prev) =>
        prev ? { ...prev, catalog: { ...prev.catalog, catalog_publishing_enabled: false } } : prev,
      );
    }
  }

  async function handleSave() {
    if (!draft || !data) return;

    let finalDraft = draft;
    const lockStage = draft.orders.inventory_lock_stage;
    if (
      (lockStage === 'enquiry' && !draft.orders.features.enquiries) ||
      (lockStage === 'sales_order' && !draft.orders.features.sales_orders)
    ) {
      finalDraft = { ...draft, orders: { ...draft.orders, inventory_lock_stage: 'invoice' } };
      setDraft(finalDraft);
      toast.warning('Inventory lock stage reset to Invoice.');
    }

    const patch: TenantSettingsPatch = {
      business: finalDraft.business,
      notifications: { whatsapp: finalDraft.notifications.whatsapp },
      business_policy: finalDraft.business_policy,
      delivery_routing_threshold_km: finalDraft.delivery_routing_threshold_km,
      product_defaults: finalDraft.product_defaults,
      orders: {
        enquiry_number_format: finalDraft.orders.enquiry_number_format,
        sales_order_number_format: finalDraft.orders.sales_order_number_format,
        invoice_number_format: finalDraft.orders.invoice_number_format,
        inventory_lock_stage: finalDraft.orders.inventory_lock_stage,
        invoice_pdf_enabled: finalDraft.orders.invoice_pdf_enabled,
        features: finalDraft.orders.features,
      },
      buyer_app: {
        enabled: finalDraft.buyer_app.enabled,
        whatsapp_number: finalDraft.buyer_app.whatsapp_number,
        whatsapp_display_name: finalDraft.buyer_app.whatsapp_display_name,
        stock_visibility_enabled: finalDraft.buyer_app.stock_visibility_enabled,
        block_order_on_oos: finalDraft.buyer_app.block_order_on_oos,
      },
      catalog: {
        price_lists_enabled: finalDraft.catalog.price_lists_enabled,
        cohort_pricing_enabled: finalDraft.catalog.cohort_pricing_enabled,
        catalog_publishing_enabled: finalDraft.catalog.catalog_publishing_enabled,
      },
    };

    const parsed = TenantSettingsPatchSchema.safeParse(patch);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? 'Invalid settings');
      return;
    }
    await save(parsed.data);
  }

  return (
    <PageWrap>
      <SellerTopbar
        eyebrow="Settings"
        title="Settings"
        subtitle="Manage your business profile, policies, and feature configuration."
        action={
          <>
            <Button type="button" variant="outline" disabled={!dirty || isSaving} onClick={handleDiscard}>
              Cancel
            </Button>
            <Button type="button" disabled={!dirty || isSaving} onClick={() => void handleSave()}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      />
      <GeneralSettingsForm
        data={data}
        isLoading={isLoading}
        error={error}
        refetch={() => void refetch()}
        draft={draft}
        setDraft={setDraft}
        pendingOff={pendingOff}
        setPendingOff={setPendingOff}
        onOrderFeatureChange={handleOrderFeatureChange}
        onConfirmDisableStage={confirmDisableStage}
        onCampaignsToggle={handleCampaignsToggle}
        isSaving={isSaving}
      />
    </PageWrap>
  );
}
