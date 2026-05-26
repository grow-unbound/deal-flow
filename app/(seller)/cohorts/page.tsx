'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { UsersRound, Pencil } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
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
    <>
      <SellerTopbar title="Cohorts" action={createAction} />
      <div style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <FeatureGate flag="COHORTS">
          <RoleGuard roles={[ROLES.SELLER_ADMIN]}>
            <div className="px-8 py-6">
              {isLoading && (
                <p className="text-cream-600 text-center py-12">Loading cohorts…</p>
              )}
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
              {!isLoading && !error && cohorts && cohorts.length > 0 && (
                <div className="max-w-5xl">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-cream-200 text-cream-700 font-semibold text-caption">
                        <th className="text-left px-4 py-3 rounded-tl-lg">Name</th>
                        <th className="text-left px-4 py-3">Type</th>
                        <th className="text-left px-4 py-3">Members</th>
                        <th className="text-left px-4 py-3">Description</th>
                        <th className="text-left px-4 py-3 rounded-tr-lg">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cohorts.map((cohort, idx) => (
                        <tr
                          key={cohort.id}
                          className={idx % 2 === 0 ? 'bg-cream-50' : 'bg-cream-100'}
                        >
                          <td className="px-4 py-3 text-body-sm font-medium text-cream-900">
                            {cohort.name}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-caption font-medium ${
                                cohort.is_static
                                  ? 'bg-cream-200 text-cream-700'
                                  : 'bg-ember-50 text-ember-700'
                              }`}
                            >
                              {cohort.is_static ? 'Static' : 'Dynamic'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-body-sm font-mono text-cream-700">
                            {cohort.cached_member_count ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-body-sm text-cream-600">
                            {cohort.description ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/cohorts/${cohort.id}/edit`}
                              className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 text-caption font-medium"
                            >
                              <Pencil size={14} />
                              Edit
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </RoleGuard>
        </FeatureGate>
      </div>
    </>
  );
}
