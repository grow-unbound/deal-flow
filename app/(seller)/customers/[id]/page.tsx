'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MoreVertical,
  EyeOff,
  Eye,
  Pencil,
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Hash,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { useRole } from '@/hooks/useRole';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Geography {
  city?: string;
  state?: string;
  pincode?: string;
  zone?: string;
}

interface Buyer {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  tier: 'A' | 'B' | 'C' | null;
  is_active: boolean;
  credit_limit: number | null;
  payment_terms_days: number | null;
  external_ref: string | null;
  geography: Geography | null;
}

interface Order {
  id: string;
  order_number: string | null;
  placed_at: string | null;
  total_amount: number | null;
  status: string;
}

interface Cohort {
  id: string;
  name: string;
  description: string | null;
  is_static: boolean;
  matched_by: 'static' | 'dynamic';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIER_BADGE_CLASS: Record<string, string> = {
  A: 'bg-teal-100 text-teal-800',
  B: 'bg-cream-200 text-cream-700',
  C: 'bg-cream-100 text-cream-500',
};

const ORDER_STATUS_CLASS: Record<string, string> = {
  received: 'bg-cream-200 text-cream-700',
  confirmed: 'bg-teal-100 text-teal-700',
  dispatched: 'bg-amber-100 text-amber-700',
  delivered: 'bg-teal-500 text-cream-50',
  cancelled: 'bg-danger-50 text-danger-600',
  draft: 'bg-cream-100 text-cream-500',
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  return headers;
}

async function fetchBuyer(id: string): Promise<Buyer> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/customers/${id}`, { headers });
  if (!res.ok) throw new Error('Failed to load customer');
  const body = await res.json();
  return body.buyer as Buyer;
}

async function fetchOrders(buyerId: string): Promise<Order[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/orders?buyer_id=${buyerId}&limit=10`, { headers });
    if (!res.ok) return [];
    const body = await res.json();
    return (body.orders ?? []) as Order[];
  } catch {
    return [];
  }
}

async function fetchCohorts(buyerId: string): Promise<Cohort[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/customers/${buyerId}/cohorts`, { headers });
    if (!res.ok) return [];
    const body = await res.json();
    return (body.cohorts ?? []) as Cohort[];
  } catch {
    return [];
  }
}

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-cream-500 uppercase tracking-wide">{label}</dt>
      <dd className={mono ? 'font-mono text-cream-700 text-sm' : 'text-body-sm text-cream-800'}>
        {value ?? '—'}
      </dd>
    </div>
  );
}

function TierBadge({ tier }: { tier: 'A' | 'B' | 'C' | null }) {
  if (!tier) return <span className="text-cream-400 text-caption">—</span>;
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-caption font-semibold ${TIER_BADGE_CLASS[tier] ?? ''}`}>
      Tier {tier}
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-block px-2.5 py-0.5 rounded-full text-caption font-medium bg-success-50 text-success-700">
      Active
    </span>
  ) : (
    <span className="inline-block px-2.5 py-0.5 rounded-full text-caption font-medium bg-cream-200 text-cream-600">
      Inactive
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BuyerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSellerAdmin } = useRole();

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: buyer,
    isLoading: buyerLoading,
    error: buyerError,
  } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => fetchBuyer(id),
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['customer-orders', id],
    queryFn: () => fetchOrders(id),
    enabled: !!buyer,
  });

  const { data: cohorts = [], isLoading: cohortsLoading } = useQuery({
    queryKey: ['customer-cohorts', id],
    queryFn: () => fetchCohorts(id),
    enabled: !!buyer,
  });

  async function handleDeactivateReactivate(action: 'deactivate' | 'reactivate') {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? 'Request failed');
      }
      await queryClient.invalidateQueries({ queryKey: ['customer', id] });
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDeactivateOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Topbar action slot ────────────────────────────────────────────────────

  const topbarAction = (
    <div className="flex items-center gap-2">
      <Link href="/customers">
        <Button variant="ghost" className="flex items-center gap-1 text-cream-600">
          <ArrowLeft size={16} />
          Back
        </Button>
      </Link>

      {/* Edit button — hidden for seller_assistant */}
      {isSellerAdmin && buyer && (
        <Link href={`/customers/${id}/edit`}>
          <Button variant="outline" className="flex items-center gap-2">
            <Pencil size={15} />
            Edit
          </Button>
        </Link>
      )}

      {/* Kebab menu — seller_admin only */}
      {isSellerAdmin && buyer && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-cream-300 bg-white hover:bg-cream-50 transition-colors"
            aria-label="More actions"
          >
            <MoreVertical size={16} className="text-cream-700" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {buyer.is_active ? (
              <DropdownMenuItem
                destructive
                onClick={() => setDeactivateOpen(true)}
                className="flex items-center gap-2"
              >
                <EyeOff size={14} />
                Deactivate
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => handleDeactivateReactivate('reactivate')}
                className="flex items-center gap-2"
              >
                <Eye size={14} />
                Reactivate
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="px-8 py-6">
        <SellerTopbar
          title={buyer ? buyer.business_name : 'Customer Detail'}
          action={topbarAction}
        />
        <FeatureGate flag="CUSTOMER_MASTER">
          <div className="max-w-5xl">
            {buyerLoading && (
              <p className="text-cream-600 text-center py-12">Loading…</p>
            )}

            {buyerError && (
              <p className="text-danger-500 text-center py-12">
                Failed to load customer. Please try again.
              </p>
            )}

            {actionError && (
              <div className="mb-4 bg-danger-50 border border-danger-200 text-danger-700 rounded-md px-4 py-3 text-body-sm">
                {actionError}
              </div>
            )}

            {!buyerLoading && buyer && (
              <>
                {/* Status row */}
                <div className="flex items-center gap-3 mb-6">
                  <TierBadge tier={buyer.tier} />
                  <StatusBadge isActive={buyer.is_active} />
                </div>

                <Tabs defaultValue="overview">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="orders">Orders</TabsTrigger>
                    <TabsTrigger value="cohorts">Cohorts</TabsTrigger>
                  </TabsList>

                  {/* ── Overview Tab ── */}
                  <TabsContent value="overview">
                    <div className="space-y-4 mt-2">
                      {/* Business info */}
                      <section className="bg-cream-100 rounded-lg p-4 shadow-xs">
                        <h2 className="flex items-center gap-2 text-body font-semibold text-cream-900 mb-4">
                          <Building2 size={16} className="text-cream-600" />
                          Business Details
                        </h2>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                          <InfoRow label="Business Name" value={buyer.business_name} />
                          <InfoRow label="Contact Name" value={buyer.contact_name} />
                          <InfoRow label="GSTIN" value={buyer.gstin} mono />
                          <InfoRow label="ERP ID" value={buyer.external_ref} mono />
                        </dl>
                      </section>

                      {/* Contact */}
                      <section className="bg-cream-100 rounded-lg p-4 shadow-xs">
                        <h2 className="flex items-center gap-2 text-body font-semibold text-cream-900 mb-4">
                          <Phone size={16} className="text-cream-600" />
                          Contact
                        </h2>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                          <InfoRow label="Phone" value={buyer.phone} mono />
                          <InfoRow label="Email" value={buyer.email} />
                        </dl>
                      </section>

                      {/* Geography */}
                      <section className="bg-cream-100 rounded-lg p-4 shadow-xs">
                        <h2 className="flex items-center gap-2 text-body font-semibold text-cream-900 mb-4">
                          <MapPin size={16} className="text-cream-600" />
                          Location
                        </h2>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                          <InfoRow label="City" value={buyer.geography?.city} />
                          <InfoRow label="State" value={buyer.geography?.state} />
                          <InfoRow label="Pincode" value={buyer.geography?.pincode} mono />
                          <InfoRow label="Zone" value={buyer.geography?.zone} />
                        </dl>
                      </section>

                      {/* Financial */}
                      <section className="bg-cream-100 rounded-lg p-4 shadow-xs">
                        <h2 className="flex items-center gap-2 text-body font-semibold text-cream-900 mb-4">
                          <CreditCard size={16} className="text-cream-600" />
                          Financial
                        </h2>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                          <InfoRow
                            label="Credit Limit"
                            value={formatCurrency(buyer.credit_limit)}
                            mono
                          />
                          <InfoRow
                            label="Payment Terms"
                            value={
                              buyer.payment_terms_days !== null
                                ? `${buyer.payment_terms_days} days`
                                : undefined
                            }
                          />
                        </dl>
                      </section>
                    </div>
                  </TabsContent>

                  {/* ── Orders Tab ── */}
                  <TabsContent value="orders">
                    <div className="mt-2">
                      {ordersLoading && (
                        <p className="text-cream-600 py-8 text-center">Loading orders…</p>
                      )}
                      {!ordersLoading && orders.length === 0 && (
                        <div className="text-center py-16">
                          <Hash size={32} className="mx-auto text-cream-300 mb-3" />
                          <p className="text-cream-500 text-body-sm">No orders yet.</p>
                        </div>
                      )}
                      {!ordersLoading && orders.length > 0 && (
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-cream-200 text-cream-700 font-semibold text-caption">
                              <th className="text-left px-4 py-3 rounded-tl-lg">Order #</th>
                              <th className="text-left px-4 py-3">Date</th>
                              <th className="text-left px-4 py-3">Amount</th>
                              <th className="text-left px-4 py-3 rounded-tr-lg">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((order, idx) => (
                              <tr
                                key={order.id}
                                className={idx % 2 === 0 ? 'bg-cream-50' : 'bg-cream-100'}
                              >
                                <td className="px-4 py-3 font-mono text-body-sm text-teal-700">
                                  {order.order_number ?? order.id.slice(0, 8)}
                                </td>
                                <td className="px-4 py-3 text-body-sm text-cream-700">
                                  {formatDate(order.placed_at)}
                                </td>
                                <td className="px-4 py-3 font-mono text-body-sm text-cream-800">
                                  {formatCurrency(order.total_amount)}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded text-caption font-medium ${ORDER_STATUS_CLASS[order.status] ?? 'bg-cream-100 text-cream-600'}`}
                                  >
                                    {order.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </TabsContent>

                  {/* ── Cohorts Tab ── */}
                  <TabsContent value="cohorts">
                    <div className="mt-2">
                      {cohortsLoading && (
                        <p className="text-cream-600 py-8 text-center">Loading cohorts…</p>
                      )}
                      {!cohortsLoading && cohorts.length === 0 && (
                        <div className="text-center py-16">
                          <p className="text-cream-500 text-body-sm">
                            Not a member of any cohorts yet.
                          </p>
                        </div>
                      )}
                      {!cohortsLoading && cohorts.length > 0 && (
                        <div className="grid gap-3">
                          {cohorts.map((cohort) => (
                            <div
                              key={cohort.id}
                              className="bg-cream-100 rounded-lg p-4 shadow-xs flex items-start justify-between gap-4"
                            >
                              <div>
                                <p className="text-body-sm font-semibold text-cream-900">
                                  {cohort.name}
                                </p>
                                {cohort.description && (
                                  <p className="text-caption text-cream-600 mt-0.5">
                                    {cohort.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge
                                  className={
                                    cohort.is_static
                                      ? 'bg-cream-200 text-cream-700'
                                      : 'bg-teal-50 text-teal-700'
                                  }
                                >
                                  {cohort.is_static ? 'Static' : 'Dynamic'}
                                </Badge>
                                <Badge className="bg-cream-100 text-cream-500">
                                  {cohort.matched_by === 'static' ? 'Direct member' : 'Rule match'}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </FeatureGate>
      </div>

      {/* ── Deactivation AlertDialog ── */}
      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate customer?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure?{' '}
              <strong>{buyer?.business_name}</strong> will no longer be able to place orders.
              Existing orders will not be affected. You can reactivate at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && (
            <p className="px-6 text-caption text-danger-600">{actionError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting} onClick={() => setDeactivateOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger-600 text-cream-50 hover:bg-danger-700"
              disabled={isSubmitting}
              onClick={() => handleDeactivateReactivate('deactivate')}
            >
              {isSubmitting ? 'Deactivating…' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
