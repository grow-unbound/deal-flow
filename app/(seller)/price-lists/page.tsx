'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IndianRupee } from 'lucide-react';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { DataTable } from '@/components/seller/DataTable';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { usePriceLists } from '@/hooks/usePriceLists';
import { PriceListStatusBadge } from '@/components/seller/price-lists/PriceListStatusBadge';
import { ROLES } from '@/constants';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function PriceListsPage() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = usePriceLists();
  const priceLists = data?.price_lists ?? [];

  const createButton = (
    <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
      <Link href="/price-lists/new">
        <Button className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2">
          <IndianRupee size={16} />
          Create Price List
        </Button>
      </Link>
    </RoleGuard>
  );

  return (
    <div className="px-8 py-6">
      <SellerTopbar
        title="Price Lists"
        subtitle="Define reusable pricing rules, validity windows, and assignment priority for buyers and cohorts."
        action={createButton}
      />
      <FeatureGate flag="PRICING_ENGINE">
        {isError && (
          <ErrorState
            heading="Could not load price lists"
            description="There was a problem fetching your price lists. Please try again."
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && priceLists.length === 0 && (
          <EmptyState
            icon={<IndianRupee size={28} strokeWidth={1.5} />}
            heading="No price lists yet"
            description="Create your first price list to start defining custom pricing for cohorts and buyers."
            action={
              <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
                <Link href="/price-lists/new">
                  <Button className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2">
                    <IndianRupee size={16} />
                    Create Price List
                  </Button>
                </Link>
              </RoleGuard>
            }
          />
        )}

        {(!isError && priceLists.length > 0) || isLoading ? (
          <DataTable
            data={priceLists}
            loading={isLoading}
            loadingMessage="Loading price lists..."
            columns={[
              {
                key: 'name',
                header: 'Name',
                accessor: (pl) => <span className="font-medium text-cream-900">{pl.name}</span>,
              },
              {
                key: 'currency',
                header: 'Currency',
                accessor: (pl) => <span className="font-mono text-sm text-cream-700">{pl.currency}</span>,
              },
              {
                key: 'priority',
                header: 'Priority',
                accessor: (pl) => <span className="font-mono text-sm text-cream-700">{pl.priority}</span>,
              },
              {
                key: 'valid_from',
                header: 'Valid From',
                accessor: (pl) => <span className="text-cream-600">{formatDate(pl.valid_from)}</span>,
              },
              {
                key: 'valid_to',
                header: 'Valid To',
                accessor: (pl) => <span className="text-cream-600">{formatDate(pl.valid_to)}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                accessor: (pl) => (
                  <PriceListStatusBadge
                    is_active={pl.is_active}
                    valid_from={pl.valid_from}
                    valid_to={pl.valid_to}
                  />
                ),
              },
            ]}
            onRowClick={(pl) => router.push(`/price-lists/${pl.id}`)}
          />
        ) : null}
      </FeatureGate>
    </div>
  );
}
