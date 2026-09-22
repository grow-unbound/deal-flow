'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertCircle, ArrowRight, ExternalLink, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/empty-state';
import { usePulseContribution, usePulseOpportunities } from '@/hooks/usePulse';
import { cn, formatNumberValue } from '@/lib/utils';
import type { PulseContributionCard, PulseOpportunityGroup } from '@/types/pulse';

function formatPulseFreshness(iso: string | null | undefined) {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return null;
  const deltaMs = Math.max(0, Date.now() - time);
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `Updated ${days}d ago`;
  return `Updated ${new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
}

function formatCardValue(card: PulseContributionCard) {
  return card.value_kind === 'currency'
    ? formatNumberValue(card.value, 'CURRENCY_THRESHOLD')
    : formatNumberValue(card.value, 'COUNT');
}

function PulseSectionShell({
  title,
  subtitle,
  freshness,
  isFetching,
  children,
}: {
  title: string;
  subtitle: string;
  freshness?: string | null;
  isFetching?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[8px] border border-cream-300 bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-cream-200 px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-cream-950">{title}</h2>
          <p className="mt-1 max-w-[72ch] text-sm leading-5 text-cream-700">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-cream-600">
          {isFetching ? <RefreshCcw size={13} className="animate-spin" aria-hidden="true" /> : null}
          {freshness ? <span>{freshness}</span> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function PulseContributionSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="min-h-[132px] animate-pulse rounded-[8px] border border-cream-200 bg-cream-100 p-4">
          <div className="h-3 w-24 rounded bg-cream-200" />
          <div className="mt-5 h-7 w-28 rounded bg-cream-200" />
          <div className="mt-4 h-3 w-36 rounded bg-cream-200" />
        </div>
      ))}
    </div>
  );
}

function ContributionCard({ card }: { card: PulseContributionCard }) {
  return (
    <article className="min-h-[132px] rounded-[8px] border border-cream-200 bg-cream-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-cream-600">{card.time_basis}</p>
        {card.share_pct != null && card.share_pct > 0 ? (
          <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">{card.share_pct}% share</span>
        ) : null}
      </div>
      <h3 className="mt-3 text-sm font-medium text-cream-800">{card.label}</h3>
      <p className="mt-2 font-display text-2xl font-semibold text-cream-950">{formatCardValue(card)}</p>
      <p className="mt-2 min-h-[2.5rem] text-sm leading-5 text-cream-650">{card.evidence}</p>
    </article>
  );
}

function ContributionEmpty({ opportunity }: { opportunity?: PulseOpportunityGroup | null }) {
  if (opportunity) {
    return (
      <div className="p-5">
        <div className="rounded-[8px] border border-teal-200 bg-teal-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-teal-700">Best next opportunity</p>
          <h3 className="mt-2 font-display text-xl font-semibold text-cream-950">
            {opportunity.count} {opportunity.title.toLowerCase()}
          </h3>
          <p className="mt-2 max-w-[64ch] text-sm leading-5 text-cream-700">{opportunity.evidence}</p>
          <Button asChild variant="secondary" size="sm" className="mt-4">
            <Link href={opportunity.href}>
              {opportunity.action_label}
              <ArrowRight size={14} />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="rounded-[8px] border border-cream-200 bg-cream-50 p-5">
        <h3 className="font-display text-lg font-semibold text-cream-950">Pulse will focus once Yukti captures demand</h3>
        <p className="mt-2 max-w-[64ch] text-sm leading-5 text-cream-700">
          Contribution cards stay hidden until there is meaningful Yukti-attributed demand or invoice evidence.
        </p>
      </div>
    </div>
  );
}

function ContributionSection() {
  const query = usePulseContribution();
  const freshness = formatPulseFreshness(query.data?.freshness_label);

  return (
    <PulseSectionShell
      title="Business captured through Yukti"
      subtitle="Channel-neutral contribution from submitted demand, invoicing, and repeat buyer behavior."
      freshness={freshness}
      isFetching={query.isFetching && !query.isLoading}
    >
      {query.isLoading ? <PulseContributionSkeleton /> : null}
      {query.isError ? (
        <div className="p-5">
          <ErrorState heading="Contribution could not load" description="Opportunities and the rest of Pulse remain available." />
        </div>
      ) : null}
      {!query.isLoading && !query.isError && (query.data?.cards.length ?? 0) > 0 ? (
        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          {query.data?.cards.map((card) => <ContributionCard key={card.id} card={card} />)}
        </div>
      ) : null}
      {!query.isLoading && !query.isError && (query.data?.cards.length ?? 0) === 0 ? (
        <ContributionEmpty opportunity={query.data?.empty_opportunity} />
      ) : null}
    </PulseSectionShell>
  );
}

export function PulseOpportunitiesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 p-5 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="min-h-[256px] animate-pulse rounded-[8px] border border-cream-200 bg-cream-100 p-4">
          <div className="h-3 w-20 rounded bg-cream-200" />
          <div className="mt-4 h-6 w-44 rounded bg-cream-200" />
          <div className="mt-3 h-3 w-full rounded bg-cream-200" />
          <div className="mt-2 h-3 w-3/4 rounded bg-cream-200" />
          <div className="mt-6 space-y-3">
            <div className="h-9 rounded bg-cream-200" />
            <div className="h-9 rounded bg-cream-200" />
            <div className="h-9 rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

function OpportunityCard({ group }: { group: PulseOpportunityGroup }) {
  return (
    <article className="flex min-h-[256px] flex-col rounded-[8px] border border-cream-200 bg-cream-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-cream-700">{group.time_basis}</span>
        <span className="font-display text-xl font-semibold text-cream-950">{formatNumberValue(group.count, 'COUNT')}</span>
      </div>
      <h3 className="mt-3 font-display text-lg font-semibold text-cream-950">{group.title}</h3>
      <p className="mt-1 min-h-[2.5rem] text-sm leading-5 text-cream-700">{group.description}</p>
      <p className="mt-3 text-xs font-medium text-cream-600">{group.evidence}</p>
      <div className="mt-4 space-y-2">
        {group.previews.map((preview) => (
          <Link
            key={preview.buyer_id || preview.name}
            href={preview.href}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[8px] border border-cream-200 bg-white px-3 py-2 no-underline transition hover:border-teal-300"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-700">{preview.initials}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-cream-900">{preview.name}</span>
              {preview.evidence_value ? (
                <span className="block truncate text-xs text-cream-600">{formatNumberValue(preview.evidence_value, 'CURRENCY_THRESHOLD')} {preview.evidence_label}</span>
              ) : null}
            </span>
            <ExternalLink size={14} className="text-cream-500" aria-hidden="true" />
          </Link>
        ))}
      </div>
      <div className="mt-auto pt-4">
        <Button asChild variant="secondary" size="sm">
          <Link href={group.href}>
            {group.action_label}
            <ArrowRight size={14} />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function OpportunitiesSection() {
  const query = usePulseOpportunities();
  const freshness = formatPulseFreshness(query.data?.freshness_label);

  return (
    <PulseSectionShell
      title="Opportunities"
      subtitle="Computed customer groups worth acting on next. These are analytical views, not Inbox work queues."
      freshness={freshness}
      isFetching={query.isFetching && !query.isLoading}
    >
      {query.isLoading ? <PulseOpportunitiesSkeleton /> : null}
      {query.isError ? (
        <div className="p-5">
          <div className="flex min-h-[160px] items-center gap-3 rounded-[8px] border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <AlertCircle size={18} aria-hidden="true" />
            <div>
              <h3 className="font-display text-lg font-semibold">Opportunities could not load</h3>
              <p className="mt-1 text-sm">Contribution remains available while this section recovers.</p>
            </div>
          </div>
        </div>
      ) : null}
      {!query.isLoading && !query.isError && (query.data?.groups.length ?? 0) > 0 ? (
        <div className="grid grid-cols-1 gap-3 p-5 xl:grid-cols-3">
          {query.data?.groups.map((group) => <OpportunityCard key={group.id} group={group} />)}
        </div>
      ) : null}
      {!query.isLoading && !query.isError && (query.data?.groups.length ?? 0) === 0 ? (
        <div className="p-5">
          <div className="rounded-[8px] border border-cream-200 bg-cream-50 p-5">
            <h3 className="font-display text-lg font-semibold text-cream-950">No qualifying opportunities right now</h3>
            <p className="mt-2 max-w-[64ch] text-sm leading-5 text-cream-700">
              Pulse will show up to three customer groups when synced history or Yukti activity produces a useful next action.
            </p>
          </div>
        </div>
      ) : null}
    </PulseSectionShell>
  );
}

export function PulseDashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1920px] px-8 py-6">
      <div className="mb-5">
        <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
        <div className="mt-3 h-10 w-40 animate-pulse rounded bg-cream-200" />
        <div className="mt-3 h-5 w-[36rem] max-w-full animate-pulse rounded bg-cream-200" />
      </div>
      <section className="rounded-[8px] border border-cream-300 bg-white">
        <div className="border-b border-cream-200 px-5 py-4">
          <div className="h-6 w-64 animate-pulse rounded bg-cream-200" />
          <div className="mt-2 h-4 w-[34rem] max-w-full animate-pulse rounded bg-cream-200" />
        </div>
        <PulseContributionSkeleton />
      </section>
      <section className="mt-5 rounded-[8px] border border-cream-300 bg-white">
        <div className="border-b border-cream-200 px-5 py-4">
          <div className="h-6 w-40 animate-pulse rounded bg-cream-200" />
          <div className="mt-2 h-4 w-[38rem] max-w-full animate-pulse rounded bg-cream-200" />
        </div>
        <PulseOpportunitiesSkeleton />
      </section>
    </div>
  );
}

export function PulseDashboardClient() {
  return (
    <div className="mx-auto w-full max-w-[1920px] px-8 py-6">
      <header className="mb-5">
        <p className="eyebrow text-cream-600">Pulse</p>
        <h1 className="font-display text-[var(--b-text-page-sm)] font-semibold leading-[0.96] text-cream-900 md:text-xl md:font-extrabold md:leading-[1]">
          Pulse
        </h1>
        <p className="mt-2 max-w-[68ch] text-md leading-6 text-cream-700">
          Emerging demand, business captured through Yukti, and where to act next.
        </p>
      </header>
      <div className={cn('space-y-5')}>
        <ContributionSection />
        <OpportunitiesSection />
      </div>
    </div>
  );
}
