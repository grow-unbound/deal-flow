'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, Upload, Pencil } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { DataTable } from '@/components/seller/DataTable';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';

interface Buyer {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  tier: 'A' | 'B' | 'C' | null;
  is_active: boolean;
  credit_limit: number | null;
  external_ref: string | null;
}

const TIER_BADGE: Record<string, string> = {
  A: 'bg-teal-100 text-teal-700',
  B: 'bg-cream-200 text-cream-700',
  C: 'bg-cream-100 text-cream-500',
};

async function fetchCustomers(): Promise<Buyer[]> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

  const res = await fetch('/api/customers', { headers });
  if (!res.ok) throw new Error('Failed to load customers');
  const body = await res.json();
  return body.buyers as Buyer[];
}

export default function CustomersPage() {
  const router = useRouter();
  const { data: buyers, isLoading, error, refetch } = useQuery({
    queryKey: ['customers'],
    queryFn: fetchCustomers,
  });

  const addCustomerAction = (
    <div className="flex items-center gap-3">
      <Link href="/customers/import">
        <Button variant="outline" className="flex items-center gap-2">
          <Upload size={16} />
          Import CSV
        </Button>
      </Link>
      <Link href="/customers/new">
        <Button className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2">
          <UserPlus size={16} />
          Add Customer
        </Button>
      </Link>
    </div>
  );

  return (
    <div className="px-8 py-6">
      <SellerTopbar
        title="Customers"
        subtitle="Manage buyer accounts, contact details, and activation status for your tenant."
        action={addCustomerAction}
      />
      <FeatureGate flag="CUSTOMER_MASTER">
        {error && (
          <ErrorState
            heading="Couldn't load customers"
            description="There was a problem fetching your customer list. Please try again."
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !error && buyers?.length === 0 && (
          <EmptyState
            icon={<UserPlus size={28} strokeWidth={1.5} />}
            heading="No customers yet"
            description="Add your first customer to start managing buyers in your workspace."
            action={
              <Link href="/customers/new">
                <Button className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2">
                  <UserPlus size={16} />
                  Add Customer
                </Button>
              </Link>
            }
          />
        )}

        {(!error && buyers && buyers.length > 0) || isLoading ? (
          <DataTable
            data={buyers ?? []}
            loading={isLoading}
            loadingMessage="Loading customers..."
            columns={[
              {
                key: 'business_name',
                header: 'Business Name',
                accessor: (buyer) => <span className="font-medium text-cream-900">{buyer.business_name}</span>,
              },
              {
                key: 'contact_name',
                header: 'Contact',
                accessor: (buyer) => <span className="text-cream-700">{buyer.contact_name ?? '—'}</span>,
              },
              {
                key: 'phone',
                header: 'Phone',
                accessor: (buyer) => <span className="font-mono text-sm text-cream-700">{buyer.phone ?? '—'}</span>,
              },
              {
                key: 'tier',
                header: 'Tier',
                accessor: (buyer) =>
                  buyer.tier ? (
                    <span className={`inline-block rounded px-2 py-0.5 text-caption font-medium ${TIER_BADGE[buyer.tier] ?? ''}`}>
                      {buyer.tier}
                    </span>
                  ) : (
                    <span className="text-caption text-cream-400">—</span>
                  ),
              },
              {
                key: 'status',
                header: 'Status',
                accessor: (buyer) => (
                  <span
                    className={[
                      'inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em]',
                      buyer.is_active ? 'bg-teal-50 text-teal-700' : 'bg-cream-200 text-cream-500',
                    ].join(' ')}
                  >
                    {buyer.is_active ? 'Active' : 'Inactive'}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                accessor: (buyer) => (
                  <Link
                    href={`/customers/${buyer.id}/edit`}
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex items-center gap-1 text-caption font-medium text-teal-600 hover:text-teal-700"
                  >
                    <Pencil size={14} />
                    Edit
                  </Link>
                ),
              },
            ]}
            onRowClick={(buyer) => router.push(`/customers/${buyer.id}`)}
            rowClassName={(buyer) => (!buyer.is_active ? 'opacity-70' : undefined)}
          />
        ) : null}
      </FeatureGate>
    </div>
  );
}
