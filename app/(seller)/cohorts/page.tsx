'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { UsersRound, Pencil } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { DataTable } from '@/components/seller/DataTable';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ROLES } from '@/constants';

interface Cohort {
  id: string;
  name: string;
  description: string | null;
  is_static: boolean;
  cached_member_count: number | null;
  created_at: string;
}

async function fetchCohorts(): Promise<Cohort[]> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  const res = await fetch('/api/cohorts', { headers });
  if (!res.ok) throw new Error('Failed to load cohorts');
  const body = await res.json();
  return body.cohorts as Cohort[];
}

export default function CohortsPage() {
  const router = useRouter();
  const { data: cohorts, isLoading, error, refetch } = useQuery({
    queryKey: ['cohorts'],
    queryFn: fetchCohorts,
  });

  const createAction = (
    <Link href="/cohorts/new">
      <Button className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2">
        <UsersRound size={16} />
        Create Cohort
      </Button>
    </Link>
  );

  return (
    <div className="px-8 py-6">
      <SellerTopbar
        title="Cohorts"
        subtitle="Segment buyers into reusable groups for catalog targeting and pricing logic."
        action={createAction}
      />
      <FeatureGate flag="COHORTS">
        <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
          {error && (
            <ErrorState
              heading="Couldn't load cohorts"
              description="There was a problem fetching your cohorts. Please try again."
              onRetry={() => refetch()}
            />
          )}
          {!isLoading && !error && cohorts?.length === 0 && (
            <EmptyState
              icon={<UsersRound size={28} strokeWidth={1.5} />}
              heading="No cohorts yet"
              description="Create your first cohort to segment buyers for targeted catalog publishing."
              action={
                <Link href="/cohorts/new">
                  <Button className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2">
                    <UsersRound size={16} />
                    Create Cohort
                  </Button>
                </Link>
              }
            />
          )}
          {(!error && cohorts && cohorts.length > 0) || isLoading ? (
            <DataTable
              data={cohorts ?? []}
              loading={isLoading}
              loadingMessage="Loading cohorts..."
              columns={[
                {
                  key: 'name',
                  header: 'Name',
                  accessor: (cohort) => <span className="font-medium text-cream-900">{cohort.name}</span>,
                },
                {
                  key: 'type',
                  header: 'Type',
                  accessor: (cohort) => (
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-caption font-medium ${
                        cohort.is_static ? 'bg-cream-200 text-cream-700' : 'bg-ember-50 text-ember-700'
                      }`}
                    >
                      {cohort.is_static ? 'Static' : 'Dynamic'}
                    </span>
                  ),
                },
                {
                  key: 'members',
                  header: 'Members',
                  accessor: (cohort) => <span className="font-mono text-sm text-cream-700">{cohort.cached_member_count ?? '—'}</span>,
                },
                {
                  key: 'description',
                  header: 'Description',
                  accessor: (cohort) => <span className="text-cream-600">{cohort.description ?? '—'}</span>,
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  accessor: (cohort) => (
                    <Link
                      href={`/cohorts/${cohort.id}/edit`}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center gap-1 text-caption font-medium text-teal-600 hover:text-teal-700"
                    >
                      <Pencil size={14} />
                      Edit
                    </Link>
                  ),
                },
              ]}
              onRowClick={(cohort) => router.push(`/cohorts/${cohort.id}/edit`)}
            />
          ) : null}
        </RoleGuard>
      </FeatureGate>
    </div>
  );
}
