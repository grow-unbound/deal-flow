'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { FeatureGate } from '@/components/FeatureGate';
import { InviteUserDialog } from '@/components/seller/InviteUserDialog';
import {
  EntityAvatar,
  FilterBar,
  GrowthPill,
  InsightStrip4,
  LandingTable,
  PageHeader,
  PageWrap,
  StatusTag,
  V3CalloutPanel,
} from '@/components/seller/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { BuyerCreateSchema, type BuyerCreateInput } from '@/lib/zod';
import { cn, formatCompactInr } from '@/lib/utils';
import { useCreateCustomerOptimistic, useCustomersLanding, type CustomersLandingBuyer } from '@/hooks/useCustomersLanding';

type SortOption = 'Spend (high → low)' | 'Spend (low → high)' | 'Growth (high → low)' | 'Recent activity';
type Chip = 'All tiers' | 'Tier A' | 'Tier B' | 'Dormant' | 'Has dues';

const SORT_OPTIONS: SortOption[] = ['Spend (high → low)', 'Spend (low → high)', 'Growth (high → low)', 'Recent activity'];
const CHIPS: Chip[] = ['All tiers', 'Tier A', 'Tier B', 'Dormant', 'Has dues'];

function formatDate(value: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CustomersLoadingSkeleton() {
  return (
    <PageWrap>
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-52" />
          <Skeleton className="h-4 w-[38rem]" />
          <div className="flex justify-end gap-2">
            <Skeleton className="h-9 w-28 rounded-[8px]" />
            <Skeleton className="h-9 w-32 rounded-[8px]" />
            <Skeleton className="h-9 w-32 rounded-[8px]" />
          </div>
        </div>

      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-[14px]" />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-52 rounded-[14px]" />
        ))}
      </div>

      <div className="space-y-2">
        <Skeleton className="h-14 rounded-[14px]" />
        <div className="overflow-hidden rounded-[14px] border border-cream-300 bg-white">
          <div className="border-b border-cream-200 p-3">
            <div className="grid grid-cols-[320px_repeat(7,minmax(0,1fr))_40px] gap-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={`head-${i}`} className="h-3 w-full" />
              ))}
            </div>
          </div>
          <div className="p-3">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, rowIndex) => (
                <div key={`row-${rowIndex}`} className="grid grid-cols-[320px_repeat(7,minmax(0,1fr))_40px] gap-3">
                  {Array.from({ length: 9 }).map((_, colIndex) => (
                    <Skeleton key={`cell-${rowIndex}-${colIndex}`} className="h-10 rounded-md" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>
    </PageWrap>
  );
}

function AddCustomerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createMutation = useCreateCustomerOptimistic();
  const form = useForm<BuyerCreateInput>({
    resolver: zodResolver(BuyerCreateSchema),
    defaultValues: {
      business_name: '',
      contact_name: '',
      phone: '',
      email: '',
      gstin: '',
      external_ref: '',
      tier: 'B',
      credit_limit: 0,
      payment_terms_days: 0,
      geography: { city: '', state: '', pincode: '', zone: '' },
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await createMutation.mutateAsync(values);
      toast.success('Customer added');
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create customer');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] border-cream-300 bg-cream-50 p-0">
        <DialogHeader>
          <DialogTitle className="font-display text-cream-900 text-h3">Add a customer</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit}>
            <DialogBody className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="business_name" render={({ field }) => (
                <FormItem><FormLabel>Business name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} maxLength={10} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="contact_name" render={({ field }) => (
                <FormItem><FormLabel>Contact name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="geography.city" render={({ field }) => (
                <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="credit_limit" render={({ field }) => (
                <FormItem><FormLabel>Credit limit</FormLabel><FormControl><Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value || 0))} /></FormControl><FormMessage /></FormItem>
              )} />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className="bg-teal-500 text-cream-50 hover:bg-teal-600" disabled={createMutation.isPending}>Add customer</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function CustomersLandingContent() {
  const router = useRouter();
  const { data, isLoading } = useCustomersLanding();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [activeChip, setActiveChip] = useState<Chip>('All tiers');
  const [sortBy, setSortBy] = useState<SortOption>('Spend (high → low)');
  const [search, setSearch] = useState('');

  const buyers = data?.buyers ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return buyers
      .filter((buyer) => {
        if (activeChip === 'Tier A') return buyer.tier === 'A';
        if (activeChip === 'Tier B') return buyer.tier === 'B';
        if (activeChip === 'Dormant') return buyer.status.label === 'Dormant';
        if (activeChip === 'Has dues') return buyer.dues > 0;
        return true;
      })
      .filter((buyer) => {
        if (!q) return true;
        return (
          buyer.business_name.toLowerCase().includes(q) ||
          buyer.city.toLowerCase().includes(q) ||
          buyer.cohort.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'Spend (high → low)') return b.spend_mtd - a.spend_mtd;
        if (sortBy === 'Spend (low → high)') return a.spend_mtd - b.spend_mtd;
        if (sortBy === 'Growth (high → low)') return b.growth_pct - a.growth_pct;
        const aDate = a.last_order_at ? Date.parse(a.last_order_at) : 0;
        const bDate = b.last_order_at ? Date.parse(b.last_order_at) : 0;
        return bDate - aDate;
      });
  }, [buyers, activeChip, search, sortBy]);

  if (isLoading || !data) {
    return <CustomersLoadingSkeleton />;
  }

  return (
    <PageWrap>
      <PageHeader
        eyebrow="Buyers"
        title="Customers"
        subtitle={`${data.kpis.total} retailers across ${data.kpis.cohort_count} cohorts. ${data.kpis.active} active this month. The Tier-A names buy most of revenue, and dues cluster there too.`}
        horizon="This month"
        secondary={{ label: 'Invite buyer', icon: <Send size={13} />, onClick: () => setInviteOpen(true) }}
        primary="Add a customer"
        onPrimaryClick={() => setAddOpen(true)}
      />

      <InsightStrip4
        tiles={[
          {
            label: 'Active buyers',
            value: `${data.kpis.active}/${data.kpis.total}`,
            sub: `${data.kpis.active_pct}% of base ordered`,
          },
          {
            label: 'Spend · MTD',
            value: formatCompactInr(data.kpis.spend_mtd),
            sub: `${data.kpis.spend_growth_pct >= 0 ? '↑ +' : '↓ '}${Math.abs(data.kpis.spend_growth_pct)}% vs last month`,
            tone: 'accent',
          },
          {
            label: 'Dormant > 30d',
            value: String(data.kpis.dormant_over_30d),
            sub: "haven't ordered in a month",
            tone: 'warn',
          },
          {
            label: 'Outstanding dues',
            value: formatCompactInr(data.kpis.outstanding_dues),
            sub: `across ${data.kpis.buyers_with_dues} buyers`,
          },
        ]}
      />

      <V3CalloutPanel
        items={[
          {
            kind: 'risk',
            eyebrow: 'Needs a call',
            hint: `${data.callouts.needs_call.length}`,
            rows: data.callouts.needs_call.map((buyer) => ({
              initials: buyer.avatar.initials,
              hue: buyer.avatar.hue,
              name: buyer.business_name,
              reason:
                buyer.dues > 0
                  ? `Last order ${buyer.last_order_label} · ${formatCompactInr(buyer.dues)} dues`
                  : `Last order ${buyer.last_order_label} · spend ${buyer.growth_pct}% MoM`,
              trailing: <GrowthPill value={buyer.growth_pct} />,
            })),
          },
          {
            kind: 'info',
            eyebrow: 'Top spenders',
            hint: 'by GMV',
            rows: data.callouts.top_spenders.map((buyer) => ({
              initials: buyer.avatar.initials,
              hue: buyer.avatar.hue,
              name: buyer.business_name,
              reason: `${buyer.orders_mtd} orders · ${buyer.city}`,
              trailing: formatCompactInr(buyer.spend_mtd),
            })),
          },
          {
            kind: 'opportunity',
            eyebrow: 'Top risers',
            hint: 'fastest growth',
            rows: data.callouts.top_risers.map((buyer) => ({
              initials: buyer.avatar.initials,
              hue: buyer.avatar.hue,
              name: buyer.business_name,
              reason: `${buyer.city} · ${formatCompactInr(buyer.spend_mtd)} this month`,
              trailing: <GrowthPill value={buyer.growth_pct} />,
            })),
          },
        ]}
      />

      <FilterBar
        count={`Showing ${filtered.length} of ${buyers.length}`}
        searchPlaceholder="Search buyer, city, GSTIN…"
        chips={CHIPS}
        activeChip={activeChip}
        sortBy={sortBy}
        hideViewToggle
        searchValue={search}
        onSearchChange={setSearch}
        onChipChange={(chip) => setActiveChip(chip as Chip)}
        sortOptions={SORT_OPTIONS}
        onSortChange={(option) => setSortBy(option as SortOption)}
      />

      <LandingTable
        columns={[
          { label: 'Buyer', width: 320, className: 'px-5' },
          { label: 'Cohort', className: 'px-5' },
          { label: 'Spend · MTD', className: 'px-5' },
          { label: 'Growth', className: 'px-5' },
          { label: 'Orders', className: 'px-5' },
          { label: 'Last order', className: 'px-5' },
          { label: 'Credit', className: 'px-5' },
          { label: 'Status', className: 'px-5' },
          { width: 40, className: 'px-4' },
        ]}
      >
        {filtered.map((buyer: CustomersLandingBuyer) => {
          const creditRatio = buyer.credit_limit > 0 ? buyer.credit_used / buyer.credit_limit : 0;
          const tier = buyer.tier ? `Tier ${buyer.tier}` : null;
          return (
            <tr
              key={buyer.id}
              className="cursor-pointer border-b border-cream-300 bg-white transition-colors duration-fast hover:bg-cream-50"
              onClick={() => router.push(`/customers/${buyer.id}`)}
            >
              <td className="px-5 py-3.5">
                <div className="ent flex items-center gap-3">
                  <EntityAvatar initials={buyer.avatar.initials} hue={buyer.avatar.hue} size={38} />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-cream-900">
                      {buyer.business_name}
                      {tier ? (
                        <span className="ml-2 rounded bg-ember-50 px-1.5 text-[10px] font-mono font-semibold text-ember-700">{tier}</span>
                      ) : null}
                    </p>
                    <p className="ent-sub mt-0.5 truncate text-[11px] uppercase tracking-[0.05em] text-cream-500">{buyer.city}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3.5 text-[12.5px] text-cream-800">{buyer.cohort}</td>
              <td className="px-5 py-3.5"><span className="font-display text-[15px] font-medium tabular-nums text-cream-900">{formatCompactInr(buyer.spend_mtd)}</span></td>
              <td className="px-5 py-3.5"><GrowthPill value={buyer.growth_pct} /></td>
              <td className="px-5 py-3.5 font-mono text-[13px] tabular-nums text-cream-900">{buyer.orders_mtd}</td>
              <td className="px-5 py-3.5 font-mono text-[12px] text-cream-800">{formatDate(buyer.last_order_at)}</td>
              <td className="px-5 py-3.5">
                <div className="flex flex-col gap-1">
                  <div className="h-[5px] w-[140px] overflow-hidden rounded-full bg-cream-200">
                    <div
                      className={cn('h-[5px] rounded-full', creditRatio > 0.75 ? 'bg-warning-500' : 'bg-teal-500')}
                      style={{ width: `${Math.min(100, Math.round(creditRatio * 100))}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-cream-700">
                    {formatCompactInr(buyer.credit_used)} / {formatCompactInr(buyer.credit_limit)}
                  </span>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <StatusTag label={buyer.status.label} tone={buyer.status.tone} />
              </td>
              <td className="chev px-4 py-3.5 pr-4 text-right text-[16px] text-cream-500">›</td>
            </tr>
          );
        })}
      </LandingTable>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <AddCustomerDialog open={addOpen} onOpenChange={setAddOpen} />
    </PageWrap>
  );
}

export default function CustomersPage() {
  return (
    <FeatureGate flag="CUSTOMER_MASTER">
      <CustomersLandingContent />
    </FeatureGate>
  );
}
