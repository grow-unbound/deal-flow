'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ExternalLink, Link2, PencilIcon, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useRole } from '@/hooks/useRole';
import {
  type CatalogDetailResponse,
  type CatalogNotifyRecipientFilter,
  useEnsureCatalogShareLink,
  useNotifyCatalogBuyers,
  usePublishCatalog,
  usePublishCatalogUpdates,
  useTenantCatalogDetail,
} from '@/hooks/useCatalogs';
import { DetailHeader, DetailTabs, MetricGrid } from '@/components/seller/detail';
import { PageWrap } from '@/components/seller/layout';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumberValue } from '@/lib/utils';
import { CatalogDetailSkeleton as SharedCatalogDetailSkeleton } from '@/components/seller/loading/SellerLoadingSkeletons';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { CatalogCompositionTab } from './CatalogCompositionTab';
import { CatalogBuyersTab } from './CatalogBuyersTab';
import { PublishCampaignDialog } from './PublishCampaignDialog';
import { CampaignFormSheet } from '../CampaignFormSheet';

const CatalogPerformanceTab = dynamic(
  () => import('./CatalogPerformanceTab').then((m) => m.CatalogPerformanceTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

type TabId = 'products' | 'performance' | 'buyers';

interface CatalogDetailPageProps {
  id: string;
}

function buildBuyerPreviewLaunchHref(shareToken?: string | null) {
  const params = new URLSearchParams();
  if (shareToken) params.set('share_token', shareToken);
  const query = params.toString();
  return query ? `/api/buyer/preview/launch?${query}` : '/api/buyer/preview/launch';
}

function normalizeBuyerNotifyStatus(status: CatalogDetailResponse['buyers'][number]['opened_status']) {
  if (status === 'Converted' || status === 'CONVERTED') return 'CONVERTED';
  if (status === 'Opened' || status === 'OPENED') return 'OPENED';
  return 'NOT YET OPENED';
}

export function CatalogDetailPage({ id }: CatalogDetailPageProps) {
  const showPerformanceTab = false;
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-catalog-detail-tab',
    scopeKey: id,
    initialState: 'products',
  });
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'first_publish' | 'publish_updates' | 'notify_buyers'>('first_publish');
  const { isSellerAdmin } = useRole();
  const { data, isLoading, isError } = useTenantCatalogDetail(id, { includePerformance: false });
  const publishMutation = usePublishCatalog(id);
  const publishUpdatesMutation = usePublishCatalogUpdates(id);
  const notifyBuyersMutation = useNotifyCatalogBuyers(id);
  const ensureShareLinkMutation = useEnsureCatalogShareLink(id);

  const tiles = useMemo(() => {
    if (!data) return [];
    const m = data.meta_strip_4;
    return [
      {
        label: 'View rate · QTD',
        value: `${m.view_rate_pct}%`,
        sub: `${m.viewed_buyer_count}/${m.target_buyer_count} customers · ${m.view_count} views`,
      },
      {
        label: 'Enquiry rate · QTD',
        value: `${m.enquiry_rate_pct}%`,
        sub: `${m.demand_buyer_count} customers · ${formatNumberValue(m.demand_value, 'CURRENCY_THRESHOLD')} (${m.demand_count})`,
      },
      {
        label: 'Billing rate · QTD',
        value: `${m.billing_rate_pct}%`,
        sub: `${m.revenue_buyer_count} customers · ${formatNumberValue(m.invoice_value, 'CURRENCY_THRESHOLD')} (${m.invoice_count})`,
      },
      {
        label: 'Expiring in',
        value: `${m.days_left} d`,
        sub: `valid until ${m.valid_until_label}`,
      },
    ];
  }, [data]);

  const publishUpdatesPreview = useMemo(() => {
    if (!data || dialogMode !== 'publish_updates') return undefined;
    return {
      name: data.composer?.name ?? data.header.name,
      valid_from: data.composer?.valid_from ?? data.header.valid_until_iso ?? new Date().toISOString(),
      valid_to: data.composer?.valid_to ?? data.header.valid_until_iso ?? null,
      audience_label: data.header.selected_cohort.display_label,
      products_count: data.products_summary.included_count,
      pricing_scheme: data.composer?.price_source === 'price_list'
        ? 'Price list'
        : 'Manual campaign prices',
      buyer_note: data.composer?.message ?? '',
      hero_image_url: data.header.hero_image_url,
    };
  }, [data, dialogMode]);

  const dialogCampaignSummary = useMemo(() => {
    if (!data) return undefined;
    return {
      name: data.composer?.name ?? data.header.name,
      valid_from: data.composer?.valid_from ?? new Date().toISOString(),
      valid_to: data.composer?.valid_to ?? data.header.valid_until_iso ?? null,
      audience_label: data.header.selected_cohort.display_label,
      products_count: data.products_summary.included_count,
      pricing_scheme: data.composer?.price_source === 'price_list'
        ? 'Price list'
        : 'Manual campaign prices',
      buyer_note: data.composer?.message ?? '',
      hero_image_url: data.header.hero_image_url,
    };
  }, [data]);

  const dialogRecipientSegments = useMemo(() => {
    if (!data) return undefined;
    const allEligible = data.buyers.length || data.header.selected_cohort.member_count;
    const notViewed = data.buyers.filter((buyer) => normalizeBuyerNotifyStatus(buyer.opened_status) === 'NOT YET OPENED').length;
    const viewedNotOrdered = data.buyers.filter((buyer) => normalizeBuyerNotifyStatus(buyer.opened_status) === 'OPENED').length;
    return {
      all_eligible: allEligible,
      not_viewed: notViewed,
      viewed_not_ordered: viewedNotOrdered,
    };
  }, [data]);

  if (isLoading) return <SharedCatalogDetailSkeleton />;
  if (isError || !data) {
    return <ErrorState heading="Couldn't load campaign" description="There was a problem fetching this campaign detail page." />;
  }

  const isDraft = data.header.status_value === 'draft';
  const isPublishedDirty = data.header.status_value === 'published_dirty';
  const isPublished = data.header.status_value === 'published';
  const hasPublishedLinkTools =
    data.header.status_raw_value === 'published'
    || data.header.status_value === 'published'
    || data.header.status_value === 'published_dirty'
    || data.header.status_value === 'scheduled'
    || data.header.status_value === 'expired';
  const editValidTo = data.composer?.valid_to ?? data.header.valid_until_iso ?? null;
  const activeMutationPending =
    publishMutation.isPending
    || publishUpdatesMutation.isPending
    || notifyBuyersMutation.isPending;
  const tabs = [
    { id: 'products', label: 'Products', badge: data.header.products_count },
    ...(showPerformanceTab ? [{ id: 'performance', label: 'Performance' as const }] : []),
    { id: 'buyers', label: 'Buyers', badge: data.meta_strip_4.target_buyer_count },
  ] as const;
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0].id;

  async function handleCopyShareLink() {
    try {
      const response = await ensureShareLinkMutation.mutateAsync();
      await navigator.clipboard.writeText(response.share_link.share_url);
      toast.success('Share link copied');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to copy share link');
    }
  }

  async function handlePublishCatalog(input: {
    notifyWhatsapp: boolean;
    buyerNote: string;
    notifyScheduledFor: string | null;
    heroImageUrl: string | null;
    recipientFilter?: CatalogNotifyRecipientFilter;
  }) {
    try {
      if (dialogMode === 'notify_buyers') {
        const response = await notifyBuyersMutation.mutateAsync({
          recipientFilter: input.recipientFilter ?? 'all_eligible',
          buyerNote: input.buyerNote,
          notifyScheduledFor: input.notifyScheduledFor,
        });
        setPublishConfirmOpen(false);
        const notifySuffix = response.whatsapp_notify
          ? input.notifyScheduledFor
            ? ` scheduled for ${response.whatsapp_notify.recipient_count} buyers.`
            : ` queued for ${response.whatsapp_notify.recipient_count} buyers.`
          : '.';
        toast.success(`Buyer notify${notifySuffix}`);
        return;
      }

      if (dialogMode === 'publish_updates') {
        await publishUpdatesMutation.mutateAsync({
          buyerNote: input.buyerNote,
          heroImageUrl: input.heroImageUrl,
        });
        setPublishConfirmOpen(false);
        toast.success('Campaign updates published.');
        return;
      }

      const response = await publishMutation.mutateAsync({
        notifyWhatsapp: input.notifyWhatsapp,
        buyerNote: input.buyerNote,
        notifyScheduledFor: input.notifyScheduledFor,
        heroImageUrl: input.heroImageUrl,
      });
      setPublishConfirmOpen(false);
      const notifySuffix = response.whatsapp_notify
        ? input.notifyScheduledFor
          ? ` WhatsApp notify scheduled for ${response.whatsapp_notify.recipient_count} buyers.`
          : ` WhatsApp notify queued for ${response.whatsapp_notify.recipient_count} buyers.`
        : '';
      toast.success(`Campaign published.${notifySuffix}`, {
        action: {
          label: 'Copy link',
          onClick: () => {
            void navigator.clipboard.writeText(response.share_link.share_url);
          },
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to complete campaign action');
    }
  }

  function openDialog(mode: 'first_publish' | 'publish_updates' | 'notify_buyers') {
    setDialogMode(mode);
    setPublishConfirmOpen(true);
  }

  return (
    <PageWrap className="pt-7">
      <DetailHeader
        avatar={{ kind: 'catalog', initials: data.header.initials, imageUrl: data.header.hero_image_url }}
        title={data.header.name}
        status={{ label: data.header.status_label, tone: data.header.status_tone }}
        statusActions={
          hasPublishedLinkTools ? (
            <>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-[9px] text-teal-700 hover:bg-cream-100"
                aria-label="View in Buyer App"
              >
                <a
                  href={buildBuyerPreviewLaunchHref(data.header.share_token)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} />
                </a>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-[9px] text-teal-700 hover:bg-cream-100"
                onClick={() => void handleCopyShareLink()}
                disabled={ensureShareLinkMutation.isPending}
                aria-label="Copy link"
              >
                <Link2 size={14} />
              </Button>
            </>
          ) : null
        }
        subtitle={[
          `${data.header.products_count} products · ${data.header.brands_covered} brands`,
          `Customer group: ${data.header.cohort_name}`,
          `Valid ${data.header.valid_from_label} → ${data.header.valid_until_label}`,
          `Published by ${data.header.published_by}`,
        ]}
        actions={
          <div className="flex items-center gap-2 pt-1">
            {isSellerAdmin ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <PencilIcon size={14} />
                Edit campaign
              </Button>
            ) : null}

            {isDraft || isPublishedDirty ? (
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={() => openDialog(isDraft ? 'first_publish' : 'publish_updates')}
                disabled={activeMutationPending}
              >
                <Send size={14} />
                Publish campaign
              </Button>
            ) : null}

            {isPublished ? (
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={() => openDialog('notify_buyers')}
                disabled={activeMutationPending}
              >
                <Send size={14} />
                Notify buyers
              </Button>
            ) : null}

            <PublishCampaignDialog
              campaignId={id}
              open={publishConfirmOpen}
              onOpenChange={setPublishConfirmOpen}
              mode={dialogMode}
              campaignSummary={dialogMode === 'publish_updates' ? publishUpdatesPreview : dialogCampaignSummary}
              recipientSegments={dialogRecipientSegments}
              isPublishing={activeMutationPending}
              onPublish={handlePublishCatalog}
            />
          </div>
        }
      />

      <MetricGrid className="mt-6" showSupportingText tiles={tiles} />

      <DetailTabs tabs={tabs as unknown as Array<{ id: string; label: string; badge?: number }>} active={activeTab} onChange={(tabId) => setTab(tabId as TabId)} />

      {activeTab === 'products' ? (
        <CatalogCompositionTab
          catalogId={id}
          summary={data.products_summary}
          composer={data.composer}
          headerName={data.header.name}
          heroImageUrl={data.header.hero_image_url}
        />
      ) : null}

      {showPerformanceTab && activeTab === 'performance' ? (
        <CatalogPerformanceTab />
      ) : null}
      {activeTab === 'buyers' ? (
        <CatalogBuyersTab
          catalogId={id}
          buyers={data.buyers}
          selectedCohort={data.header.selected_cohort}
          composer={data.composer}
          headerName={data.header.name}
          heroImageUrl={data.header.hero_image_url}
        />
      ) : null}

      <CampaignFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        campaignId={id}
        defaultValues={{
          form_mode: 'simple',
          name: data.header.name,
          description: data.composer?.description ?? '',
          valid_from: new Date(data.composer?.valid_from ?? new Date().toISOString()),
          valid_to: editValidTo ? new Date(editValidTo) : undefined,
          buyer_note: data.composer?.message ?? '',
          hero_image_url: data.header.hero_image_url ?? '',
          target_mode: data.composer?.scope_type === 'cohort' ? 'customer_group' : 'individual_buyers',
          target_cohort_id: data.composer?.scope_type === 'cohort' ? (data.composer.cohort_id ?? null) : null,
          pricing_mode: data.composer?.pricing_source ?? 'individual_prices',
          price_list_id: data.composer?.price_source === 'price_list' ? (data.composer.price_list_id ?? null) : null,
          pricing_strategy: data.composer?.bulk_pricing_strategy ?? 'edit_each',
          strategy_value: data.composer?.bulk_pricing_strategy_value ?? null,
          buyer_target_mode: data.composer?.buyer_target_mode,
          buyer_ids: data.composer?.buyer_ids ?? data.buyers.filter((buyer) => buyer.is_member !== false).map((buyer) => buyer.buyer_id),
          buyer_rules: data.composer?.buyer_rules,
          product_membership_mode: data.composer?.product_membership_mode,
          selected_product_ids: data.composer?.items.map((item) => item.tenant_product_id) ?? [],
          product_rules: data.composer?.product_rules,
        }}
      />
    </PageWrap>
  );
}
