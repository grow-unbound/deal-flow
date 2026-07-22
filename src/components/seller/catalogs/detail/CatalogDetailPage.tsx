'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ExternalLink, Link2, PencilIcon, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useRole } from '@/hooks/useRole';
import {
  type CatalogNotifyRecipientFilter,
  useCatalogPublishPreview,
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

function CatalogDetailSkeleton() {
  return (
    <PageWrap className="pt-7">
      <div className="space-y-6">
        <Skeleton className="h-6 w-56" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-[14px]" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-36" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[14px]" />
          ))}
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-28" />
          ))}
        </div>
        <Skeleton className="h-[28rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}

export function CatalogDetailPage({ id }: CatalogDetailPageProps) {
  const router = useRouter();
  const { state: tab, setState: setTab } = useRouteSnapshot<TabId>({
    storageKey: 'seller-catalog-detail-tab',
    scopeKey: id,
    initialState: 'performance',
  });
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'first_publish' | 'publish_updates' | 'notify_buyers'>('first_publish');
  const [notifyWhatsappPreview, setNotifyWhatsappPreview] = useState(true);
  const { isSellerAdmin } = useRole();
  const { data, isLoading, isError } = useTenantCatalogDetail(id);
  const publishMutation = usePublishCatalog(id);
  const publishUpdatesMutation = usePublishCatalogUpdates(id);
  const notifyBuyersMutation = useNotifyCatalogBuyers(id);
  const ensureShareLinkMutation = useEnsureCatalogShareLink(id);
  const publishPreviewQuery = useCatalogPublishPreview(
    id,
    {
      notifyWhatsapp: dialogMode === 'notify_buyers' ? true : notifyWhatsappPreview,
      mode: dialogMode === 'notify_buyers' ? 'notify_buyers' : 'first_publish',
    },
    publishConfirmOpen && isSellerAdmin && (dialogMode === 'first_publish' || dialogMode === 'notify_buyers'),
  );

  const tiles = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: 'Campaign-linked demand value',
        value: formatNumberValue(data.meta_strip_4.gmv, 'CURRENCY_THRESHOLD'),
        sub: (
          <span>
            <span className={data.meta_strip_4.growth_pct >= 0 ? 'up' : 'down'}>
              {data.meta_strip_4.growth_pct >= 0 ? '↑ +' : '↓ '}
              {Math.abs(data.meta_strip_4.growth_pct)}%
            </span>{' '}
            vs previous campaign
          </span>
        ),
      },
      {
        label: 'Customers with demand',
        value: `${data.meta_strip_4.demand_customers ?? data.meta_strip_4.conversions ?? data.meta_strip_4.orders}`,
        sub: `${data.meta_strip_4.conversion_rate}% open-to-demand`,
      },
      {
        label: 'Customers who opened',
        value: `${data.meta_strip_4.unique_viewers}/${data.meta_strip_4.cohort_members}`,
        sub: 'opened in Buyer App',
      },
      {
        label: 'Days left',
        value: `${data.meta_strip_4.days_left} d`,
        sub: `valid until ${data.meta_strip_4.valid_until_label}`,
      },
    ];
  }, [data]);

  const publishUpdatesPreview = useMemo(() => {
    if (!data || dialogMode !== 'publish_updates') return undefined;
    return {
      campaign: {
        id: data.header.id,
        name: data.composer?.name ?? data.header.name,
        valid_from: data.composer?.valid_from ?? data.header.valid_until_iso ?? new Date().toISOString(),
        valid_to: data.composer?.valid_to ?? data.header.valid_until_iso ?? null,
        audience_label: data.header.selected_cohort.display_label,
        products_count: data.products_summary.included_count,
        pricing_scheme: data.composer?.price_source === 'price_list'
          ? 'Price list'
          : 'Manual campaign prices',
        buyer_note: data.composer?.message ?? '',
        hero_image_url: null,
        header_image_url: data.header.share_url ?? '',
        header_image_source: 'platform_default' as const,
      },
      whatsapp: {
        feature_enabled: false,
        notify_available: false,
        can_notify: false,
        blockers: [],
        recipient_count: 0,
        credits_per_message: 0,
        estimated_credits: 0,
        estimated_inr: 0,
        credits_balance: 0,
        credit_price_inr: 0,
        template_approved: false,
        tenant_phone_configured: false,
        broadcast_sending_paused: false,
        quality_rating_blocked: false,
      },
      template: {
        seller_name: 'Your business',
        seller_phone_display: 'Your business number',
        footer_text: 'Powered by Yukti',
        buttons: [
          { label: 'View campaign', type: 'url' as const },
          { label: 'Enquire now', type: 'url' as const },
          { label: 'Unsubscribe', type: 'quick_reply' as const },
        ],
      },
    };
  }, [data, dialogMode]);

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
  const activeMutationPending =
    publishMutation.isPending
    || publishUpdatesMutation.isPending
    || notifyBuyersMutation.isPending;

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
    setNotifyWhatsappPreview(true);
    setPublishConfirmOpen(true);
  }

  return (
    <PageWrap className="pt-7">
      <DetailHeader
        crumbPath={[
          { label: 'Campaigns', href: '/campaigns' },
          { label: data.header.name, current: true },
        ]}
        avatar={{ kind: 'catalog', initials: data.header.initials }}
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
              preview={dialogMode === 'publish_updates' ? publishUpdatesPreview : publishPreviewQuery.data}
              previewLoading={dialogMode === 'publish_updates' ? false : publishPreviewQuery.isLoading}
              previewError={dialogMode === 'publish_updates' ? null : publishPreviewQuery.error instanceof Error ? publishPreviewQuery.error.message : null}
              isPublishing={activeMutationPending}
              onNotifyWhatsappChange={setNotifyWhatsappPreview}
              onPublish={handlePublishCatalog}
            />
          </div>
        }
      />

      <MetricGrid className="mt-6" showSupportingText tiles={tiles} />

      <DetailTabs
        tabs={[
          { id: 'products', label: 'Products', badge: data.header.products_count },
          { id: 'performance', label: 'Performance' },
          { id: 'buyers', label: 'Buyers', badge: data.meta_strip_4.cohort_members },
        ]}
        active={tab}
        onChange={(tabId) => setTab(tabId as TabId)}
      />

      {tab === 'products' ? (
        <CatalogCompositionTab
          catalogId={id}
          summary={data.products_summary}
        />
      ) : null}

      {tab === 'performance' ? (
        <CatalogPerformanceTab performanceCards={data.performance_cards} />
      ) : null}
      {tab === 'buyers' ? <CatalogBuyersTab catalogId={id} buyers={data.buyers} selectedCohort={data.header.selected_cohort} /> : null}

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
          valid_to: data.composer?.valid_to ? new Date(data.composer.valid_to) : undefined,
          buyer_note: data.composer?.message ?? '',
          hero_image_url: '',
          target_mode: data.composer?.scope_type === 'cohort' ? 'customer_group' : 'individual_buyers',
          target_cohort_id: data.composer?.scope_type === 'cohort' ? (data.composer.cohort_id ?? null) : null,
          pricing_mode: data.composer?.price_source === 'price_list' ? 'pricelist' : 'individual_prices',
          price_list_id: data.composer?.price_source === 'price_list' ? (data.composer.price_list_id ?? null) : null,
        }}
      />
    </PageWrap>
  );
}
