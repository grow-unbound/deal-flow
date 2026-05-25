'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, Upload, Pencil } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
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
    <>
      <SellerTopbar title="Customers" action={addCustomerAction} />
      <div style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <FeatureGate flag="CUSTOMER_MASTER">
          <div className="px-8 py-6">
            {isLoading && (
              <p className="text-cream-600 text-center py-12">Loading customers…</p>
            )}

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

            {!isLoading && !error && buyers && buyers.length > 0 && (
              <div className="max-w-6xl">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-cream-200 text-cream-700 font-semibold text-caption">
                      <th className="text-left px-4 py-3 rounded-tl-lg">Business Name</th>
                      <th className="text-left px-4 py-3">Contact</th>
                      <th className="text-left px-4 py-3">Phone</th>
                      <th className="text-left px-4 py-3">Tier</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3 rounded-tr-lg">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buyers.map((buyer, idx) => (
                      <tr
                        key={buyer.id}
                        className={[
                          idx % 2 === 0 ? 'bg-cream-50' : 'bg-cream-100',
                          !buyer.is_active ? 'opacity-60' : '',
                        ].join(' ')}
                      >
                        <td className="px-4 py-3 text-body-sm font-medium text-cream-900">
                          {buyer.business_name}
                        </td>
                        <td className="px-4 py-3 text-body-sm text-cream-700">
                          {buyer.contact_name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-body-sm text-cream-700 font-mono">
                          {buyer.phone ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          {buyer.tier ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-caption font-medium ${TIER_BADGE[buyer.tier] ?? ''}`}
                            >
                              {buyer.tier}
                            </span>
                          ) : (
                            <span className="text-cream-400 text-caption">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {buyer.is_active ? (
                            <span className="inline-block px-2 py-0.5 rounded text-caption font-medium bg-teal-50 text-teal-700">
                              Active
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-caption font-medium bg-cream-200 text-cream-500">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/customers/${buyer.id}/edit`}
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
        </FeatureGate>
      </div>
    </>
  );
}
