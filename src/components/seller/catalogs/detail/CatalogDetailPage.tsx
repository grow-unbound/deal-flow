'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Link2, PencilLine, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useRole } from '@/hooks/useRole';
import {
  useEnsureCatalogShareLink,
  usePublishCatalog,
  useTenantCatalogDetail,
} from '@/hooks/useCatalogs';
import { DetailHeader, DetailTabs, MetaStrip4 } from '@/components/seller/detail';
import { PageWrap } from '@/components/seller/layout';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCompactInr } from '@/lib/utils';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import { CatalogCompositionTab } from './CatalogCompositionTab';
import { CatalogPerformanceTab } from './CatalogPerformanceTab';
import { CatalogBuyersTab } from './CatalogBuyersTab';

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
  const { isSellerAdmin } = useRole();
  const { data, isLoading, isError } = useTenantCatalogDetail(id);
  const publishMutation = usePublishCatalog(id);
  const ensureShareLinkMutation = useEnsureCatalogShareLink(id);

  const tiles = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: 'GMV',
        value: formatCompactInr(data.meta_strip_4.gmv),
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
        label: 'Orders',
        value: `${data.meta_strip_4.orders}`,
        sub: `${data.meta_strip_4.conversion_rate}% conversion`,
      },
      {
        label: 'Unique viewers',
        value: `${data.meta_strip_4.unique_viewers}/${data.meta_strip_4.cohort_members}`,
        sub: 'opened in app',
      },
      {
        label: 'Days left',
        value: `${data.meta_strip_4.days_left} d`,
        sub: `valid until ${data.meta_strip_4.valid_until_label}`,
      },
    ];
  }, [data]);

  if (isLoading) return <CatalogDetailSkeleton />;
  if (isError || !data) {
    return <ErrorState heading="Couldn't load campaign" description="There was a problem fetching this campaign detail page." />;
  }

  const isDraft = data.header.status_value === 'draft';
  const isPublished = data.header.status_value === 'published';

  async function handleCopyShareLink() {
    try {
      const response = await ensureShareLinkMutation.mutateAsync();
      await navigator.clipboard.writeText(response.share_link.share_url);
      toast.success('Share link copied');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to copy share link');
    }
  }

  async function handlePublishCatalog() {
    try {
      const response = await publishMutation.mutateAsync();
      setPublishConfirmOpen(false);
      toast.success('Campaign published', {
        action: {
          label: 'Copy link',
          onClick: () => {
            void navigator.clipboard.writeText(response.share_link.share_url);
          },
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to publish campaign');
    }
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
          isPublished ? (
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
              <Button type="button" variant="accent" size="sm" onClick={() => router.push(`/campaigns/${id}/edit`)}>
                <PencilLine size={14} />
                Edit Campaign
              </Button>
            ) : null}

            {isDraft ? (
              <Dialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
                <Button type="button" size="sm" onClick={() => setPublishConfirmOpen(true)} disabled={publishMutation.isPending}>
                  <Send size={14} />
                  Publish Catalog
                </Button>
                <DialogContent className="max-w-[420px]">
                  <DialogHeader>
                    <DialogTitle>Publish this campaign?</DialogTitle>
                    <DialogDescription>
                      Buyers will immediately be able to open this campaign with its share link.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogBody className="pt-4 text-base leading-6 text-cream-700">
                    {data.header.products_count} products will go live for {data.header.selected_cohort.member_count} buyers in {data.header.selected_cohort.display_label}.
                  </DialogBody>
                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => setPublishConfirmOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={() => void handlePublishCatalog()} disabled={publishMutation.isPending}>
                      Confirm publish
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}

          </div>
        }
      />

      <MetaStrip4 tiles={tiles} />

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
          summary={data.products_summary}
          rows={data.products}
        />
      ) : null}

      {tab === 'performance' ? <CatalogPerformanceTab performance={data.performance} /> : null}
      {tab === 'buyers' ? <CatalogBuyersTab buyers={data.buyers} selectedCohort={data.header.selected_cohort} /> : null}
    </PageWrap>
  );
}
