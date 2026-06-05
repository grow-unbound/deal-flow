'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { MoreVertical, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { FeatureGate } from '@/components/FeatureGate';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { ROLES } from '@/constants';
import { PageWrap, EntityAvatar, LandingTable, StatusTag } from '@/components/seller/layout';
import { DetailHeader, MetaStrip4, DetailTabs } from '@/components/seller/detail';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-fetch';
import { cn } from '@/lib/utils';
import { useRouteSnapshot } from '@/hooks/useRouteSnapshot';
import {
  useAddAssignment,
  useDeleteAssignment,
  usePriceListAction,
  usePriceListDetail,
} from '@/hooks/usePriceLists';
import { useRole } from '@/hooks/useRole';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Buyer {
  id: string;
  business_name: string;
}

interface Cohort {
  id: string;
  name: string;
}

function formatINR(value: number | null | undefined) {
  if (value == null) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function stockTone(isActive: boolean | null | undefined) {
  if (isActive === false) return { label: 'Inactive', tone: 'neutral' as const };
  return { label: 'In stock', tone: 'success' as const };
}

function useBuyers() {
  return useQuery({
    queryKey: ['buyers-list'],
    queryFn: async (): Promise<{ buyers: Buyer[] }> => {
      const res = await apiFetch('/api/customers');
      if (!res.ok) throw new Error('Failed to fetch buyers');
      return res.json();
    },
  });
}

function useCohorts() {
  return useQuery({
    queryKey: ['cohorts-list'],
    queryFn: async (): Promise<{ cohorts: Cohort[] }> => {
      const res = await apiFetch('/api/cohorts');
      if (!res.ok) return { cohorts: [] };
      return res.json();
    },
  });
}

export default function PriceListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isSellerAdmin } = useRole();

  const { state: activeTab, setState: setActiveTab } = useRouteSnapshot<string>({
    storageKey: 'seller-price-list-detail-tab',
    scopeKey: id,
    initialState: 'pricing',
  });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [validTo, setValidTo] = useState('');
  const [assignmentType, setAssignmentType] = useState<'cohort' | 'buyer' | 'all_buyers'>('cohort');
  const [assignmentTarget, setAssignmentTarget] = useState('');

  const { data, isLoading, isError } = usePriceListDetail(id);
  const priceListAction = usePriceListAction(id);
  const addAssignment = useAddAssignment(id);
  const removeAssignment = useDeleteAssignment(id);
  const { data: buyersData } = useBuyers();
  const { data: cohortsData } = useCohorts();

  const priceList = data?.price_list;

  const tabs = useMemo(() => {
    const itemsCount = priceList?.items?.length ?? 0;
    const assignmentCount = priceList?.assignments?.length ?? 0;
    return [
      { id: 'pricing', label: 'Pricing', badge: itemsCount },
      { id: 'assignments', label: 'Assignments', badge: assignmentCount },
      { id: 'activity', label: 'Activity' },
    ];
  }, [priceList?.items?.length, priceList?.assignments?.length]);

  async function onAddAssignment() {
    if (assignmentType !== 'all_buyers' && !assignmentTarget) return;
    await addAssignment.mutateAsync(
      assignmentType === 'all_buyers'
        ? { target_type: 'all_buyers' }
        : { target_type: assignmentType, target_id: assignmentTarget },
    );
    setAssignmentTarget('');
  }

  const subtitle = priceList
    ? [
        `${priceList.items.length} products`,
        `Cohorts: ${priceList.assignments.filter((a) => a.target_type === 'cohort').map((a) => a.label).filter(Boolean).join(', ') || '—'}`,
        `Valid ${formatDate(priceList.valid_from)} → ${formatDate(priceList.valid_to)}`,
        `Created by ${priceList.created_by_label ?? 'Team member'}`,
      ]
    : ['—', '—', '—', '—'];

  return (
    <FeatureGate flag="PRICING_ENGINE">
      <RoleGuard roles={[ROLES.SELLER_ADMIN, ROLES.SELLER_ASSISTANT]}>
        <PageWrap className="pt-7 pb-10">
          {isLoading ? (
            <div className="space-y-6" role="status" aria-label="Loading price list detail">
              <Skeleton className="h-5 w-52" />
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <Skeleton className="h-12 w-96" />
                  <Skeleton className="h-4 w-[540px]" />
                </div>
                <Skeleton className="h-10 w-56" />
              </div>
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-[112px] w-full rounded-[14px]" />
                ))}
              </div>
              <Skeleton className="h-12 w-full" />
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-12 w-full" />
                ))}
              </div>
            </div>
          ) : isError || !priceList ? (
            <div className="rounded-[14px] border border-danger-200 bg-danger-50 p-4 text-[13px] text-danger-700">
              Price list not found.
            </div>
          ) : (
            <>
              <DetailHeader
                crumbPath={[
                  { label: 'Price Lists', href: '/price-lists' },
                  { label: priceList.name, current: true },
                ]}
                avatar={{ kind: 'catalog', initials: priceList.initials ?? 'PL', hue: 'teal' }}
                title={priceList.name}
                status={{ label: priceList.status_label ?? 'Active', tone: priceList.status_tone ?? 'success' }}
                subtitle={subtitle}
                actions={
                  <div className="flex items-center gap-2">
                    {isSellerAdmin ? (
                      <Button type="button" className="cockpit-btn cockpit-btn-secondary" onClick={() => router.push(`/price-lists/${id}/edit`)}>
                        Edit
                      </Button>
                    ) : null}
                    {isSellerAdmin ? (
                      <Button type="button" className="cockpit-btn cockpit-btn-secondary" onClick={() => setArchiveOpen(true)}>
                        Archive
                      </Button>
                    ) : null}
                    {isSellerAdmin ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-cream-300 bg-cream-50 text-cream-700 hover:bg-cream-100">
                          <MoreVertical size={14} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {(priceList.status === 'active' || priceList.status === 'draft') ? (
                            <DropdownMenuItem onClick={() => setExtendOpen(true)}>Extend validity</DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onClick={() => priceListAction.mutate({ action: 'duplicate' }, { onSuccess: (res) => router.push(`/price-lists/${res.price_list.id}`) })}>
                            Duplicate list
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                }
              />

              <MetaStrip4
                tiles={[
                  {
                    label: 'Products covered',
                    value: priceList.stats?.products_covered ?? priceList.items.length,
                    sub: `across ${priceList.stats?.brands_covered ?? 0} brands`,
                  },
                  {
                    label: 'Cohorts assigned',
                    value: priceList.stats?.assignments_count ?? priceList.assignments.length,
                    sub: 'receiving this price list',
                  },
                  {
                    label: 'Avg discount',
                    value: `${(priceList.stats?.avg_discount_pct ?? 0).toFixed(1)}%`,
                    sub: 'vs base selling price',
                  },
                  {
                    label: 'Days left',
                    value: `${priceList.stats?.days_left ?? 0} d`,
                    sub: `valid until ${formatDate(priceList.valid_to)}`,
                  },
                ]}
              />

              <DetailTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

              <div className="mt-4">
                {activeTab === 'pricing' ? (
                  <LandingTable
                    columns={[
                      { label: 'Product' },
                      { label: 'Brand' },
                      { label: 'Base price', align: 'right' },
                      { label: 'List price', align: 'right' },
                      { label: 'Discount', align: 'right' },
                      { label: 'Stock status', align: 'right' },
                    ]}
                    className="rounded-[14px] border-t"
                  >
                    {priceList.items.map((item) => {
                      const productName = item.tenant_product?.name_override ?? item.tenant_product?.master_product?.name ?? 'Unnamed';
                      const brandName = item.tenant_product?.tenant_brand?.display_name_override ?? item.tenant_product?.tenant_brand?.master_brand?.name ?? '—';
                      const base = Number(item.tenant_product?.base_selling_price ?? 0);
                      const list = Number(item.price ?? 0);
                      const pct = base > 0 ? ((base - list) / base) * 100 : 0;
                      const tone = stockTone(item.tenant_product?.is_active);
                      return (
                        <tr key={item.id} className="border-b border-cream-200 text-[13px]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="inline-flex h-8 w-8 shrink-0 items-end justify-center rounded-[10px] border border-teal-200 bg-gradient-to-b from-teal-50 to-teal-100 pb-[4px]">
                                <div className="h-[16px] w-[6px] rounded-t-[2px] rounded-b-[1px] bg-gradient-to-b from-teal-500 to-teal-700" />
                              </div>
                              <div>
                                <p className="ent-name text-cream-950">{productName}</p>
                                <p className="text-[11px] text-cream-600">{item.tenant_product?.internal_sku ?? '—'} · {brandName}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <EntityAvatar initials={brandName.slice(0, 2).toUpperCase()} hue="cream" size={22} />
                              <span>{brandName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[12.5px] text-cream-600">{formatINR(base)}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-cream-950">{formatINR(list)}</td>
                          <td className={cn('px-4 py-3 text-right font-mono text-[12px]', pct >= 0 ? 'text-teal-700' : 'text-danger-700')}>
                            {pct >= 0 ? '-' : '+'}{Math.abs(pct).toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-right">
                            <StatusTag label={tone.label} tone={tone.tone} />
                          </td>
                        </tr>
                      );
                    })}
                  </LandingTable>
                ) : null}

                {activeTab === 'assignments' ? (
                  <div className="space-y-4">
                    {isSellerAdmin ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-cream-300 bg-cream-50 p-3">
                        <Select value={assignmentType} onValueChange={(value: 'cohort' | 'buyer' | 'all_buyers') => setAssignmentType(value)}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cohort">Cohort</SelectItem>
                            <SelectItem value="buyer">Buyer</SelectItem>
                            <SelectItem value="all_buyers">All buyers</SelectItem>
                          </SelectContent>
                        </Select>
                        {assignmentType !== 'all_buyers' ? (
                          <Select value={assignmentTarget} onValueChange={setAssignmentTarget}>
                            <SelectTrigger className="w-[260px]">
                              <SelectValue placeholder="Select target" />
                            </SelectTrigger>
                            <SelectContent>
                              {assignmentType === 'cohort'
                                ? (cohortsData?.cohorts ?? []).map((cohort) => <SelectItem key={cohort.id} value={cohort.id}>{cohort.name}</SelectItem>)
                                : (buyersData?.buyers ?? []).map((buyer) => <SelectItem key={buyer.id} value={buyer.id}>{buyer.business_name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : null}
                        <Button type="button" onClick={() => void onAddAssignment()} disabled={addAssignment.isPending}>Add assignment</Button>
                      </div>
                    ) : null}

                    <LandingTable
                      columns={[
                        { label: 'Cohort / Buyer' },
                        { label: 'Members', align: 'right' },
                        { label: 'Assigned since', align: 'right' },
                        { label: 'Priority', align: 'right' },
                        { label: '', align: 'right', width: 54 },
                      ]}
                      className="rounded-[14px] border-t"
                    >
                      {priceList.assignments.map((assignment) => (
                        <tr key={assignment.id} className="border-b border-cream-200 text-[13px]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <EntityAvatar initials={(assignment.label ?? 'AL').slice(0, 2).toUpperCase()} hue="teal" size={22} />
                              <span>{assignment.label ?? 'Unknown'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">{assignment.members ?? 0}</td>
                          <td className="px-4 py-3 text-right font-mono text-[12px]">{formatDate(assignment.created_at)}</td>
                          <td className="px-4 py-3 text-right font-mono">{assignment.priority ?? 0}</td>
                          <td className="px-4 py-3 text-right">
                            {isSellerAdmin ? (
                              <button
                                type="button"
                                onClick={() => removeAssignment.mutate(assignment.id)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-danger-600 hover:bg-danger-50"
                                aria-label="Remove assignment"
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </LandingTable>
                  </div>
                ) : null}

                {activeTab === 'activity' ? (
                  <div className="rounded-[14px] border border-cream-300 bg-white">
                    {(priceList.activity ?? []).map((entry) => (
                      <div key={entry.id} className="border-b border-cream-200 px-4 py-3 last:border-b-0">
                        <p className="text-[13px] font-medium text-cream-900">{String(entry.diff?.event ?? entry.action)}</p>
                        <p className="mt-1 text-[12px] font-mono text-cream-600">{formatDate(entry.ts)}</p>
                      </div>
                    ))}
                    {(priceList.activity ?? []).length === 0 ? (
                      <div className="px-4 py-6 text-[13px] text-cream-600">No activity yet.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive this price list?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove it from active views.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => priceListAction.mutate({ action: 'archive' }, { onSuccess: () => router.push('/price-lists') })}
                    >
                      Archive
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Extend validity</DialogTitle>
                  </DialogHeader>
                  <DialogBody>
                    <label className="text-[12px] text-cream-700" htmlFor="valid-to">Valid until</label>
                    <Input id="valid-to" type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} className="mt-1" />
                  </DialogBody>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setExtendOpen(false)}>Cancel</Button>
                    <Button
                      onClick={() => {
                        if (!validTo) return;
                        priceListAction.mutate(
                          { action: 'extend_validity', valid_to: new Date(validTo).toISOString() },
                          { onSuccess: () => setExtendOpen(false) },
                        );
                      }}
                    >
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </PageWrap>
      </RoleGuard>
    </FeatureGate>
  );
}
