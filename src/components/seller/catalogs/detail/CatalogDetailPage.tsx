'use client';

import { useMemo, useState } from 'react';
import { Copy, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { useRole } from '@/hooks/useRole';
import {
  useAddCatalogProduct,
  useExtendCatalogValidity,
  useRemoveCatalogProduct,
  useTenantCatalogDetail,
} from '@/hooks/useCatalogs';
import { DetailHeader, DetailTabs, MetaStrip4 } from '@/components/seller/detail';
import { PageWrap } from '@/components/seller/layout';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { formatCompactInr } from '@/lib/utils';
import { CatalogCompositionTab } from './CatalogCompositionTab';
import { CatalogPerformanceTab } from './CatalogPerformanceTab';
import { CatalogBuyersTab } from './CatalogBuyersTab';

type TabId = 'details' | 'performance' | 'buyers';

interface CatalogDetailPageProps {
  id: string;
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
  const [tab, setTab] = useState<TabId>('performance');
  const [validUntil, setValidUntil] = useState('');
  const { isSellerAdmin } = useRole();
  const { data, isLoading, isError } = useTenantCatalogDetail(id);
  const extendMutation = useExtendCatalogValidity(id);
  const addMutation = useAddCatalogProduct(id);
  const removeMutation = useRemoveCatalogProduct(id);

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
            vs previous catalog
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
    return <ErrorState heading="Couldn't load catalog" description="There was a problem fetching this catalog detail page." />;
  }

  return (
    <PageWrap className="pt-7">
      <DetailHeader
        crumbPath={[
          { label: 'Catalogs', href: '/catalogs' },
          { label: data.header.name, current: true },
        ]}
        avatar={{ kind: 'catalog', initials: data.header.initials }}
        title={data.header.name}
        status={{ label: data.header.status_label, tone: data.header.status_tone }}
        subtitle={[
          `${data.header.products_count} products · ${data.header.brands_covered} brands`,
          `Cohort: ${data.header.cohort_name}`,
          `Valid ${data.header.valid_from_label} → ${data.header.valid_until_label}`,
          `Published by ${data.header.published_by}`,
        ]}
        actions={
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              className="cockpit-btn cockpit-btn-secondary h-9 px-4"
              onClick={async () => {
                if (!data.header.share_url) return;
                await navigator.clipboard.writeText(data.header.share_url);
                toast.success('Share link copied');
              }}
            >
              <Copy size={14} />
              Copy share link
            </button>

            {isSellerAdmin && data.permissions.can_extend_validity ? (
              <AlertDialog>
                <AlertDialogTrigger className="cockpit-btn cockpit-btn-secondary h-9 px-4">
                  <CalendarClock size={14} />
                  Extend validity
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Extend catalog validity?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Set a new validity end date for this catalog.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <input
                    type="date"
                    className="h-10 rounded-[8px] border border-cream-300 px-3 text-[13px]"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                  />
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        if (!validUntil) return;
                        extendMutation.mutate({ valid_until: new Date(validUntil).toISOString() });
                      }}
                    >
                      Confirm
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        }
      />

      <MetaStrip4 tiles={tiles} />

      <DetailTabs
        tabs={[
          { id: 'details', label: 'Composition' },
          { id: 'performance', label: 'Performance' },
          { id: 'buyers', label: 'Buyers', badge: data.meta_strip_4.cohort_members },
        ]}
        active={tab}
        onChange={(tabId) => setTab(tabId as TabId)}
      />

      {tab === 'details' ? (
        <CatalogCompositionTab
          rows={data.composition}
          canEdit={data.permissions.can_edit_composition}
          isMutating={addMutation.isPending || removeMutation.isPending}
          onAdd={(tenantProductId) => addMutation.mutate({ tenant_product_id: tenantProductId })}
          onRemove={(tenantProductId) => removeMutation.mutate({ tenant_product_id: tenantProductId })}
        />
      ) : null}

      {tab === 'performance' ? <CatalogPerformanceTab performance={data.performance} /> : null}
      {tab === 'buyers' ? <CatalogBuyersTab buyers={data.buyers} /> : null}
    </PageWrap>
  );
}
