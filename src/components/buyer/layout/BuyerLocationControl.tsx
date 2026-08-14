'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, MapPin, Store } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { formatBuyerSelectedLocationLabel } from '@/lib/buyer-delivery-location';
import { buildBuyerLocationHref } from '@/lib/buyer-routes';
import { useBuyerDeliveryOptional } from '@/contexts/BuyerDeliveryContext';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { BuyerLocationDialog } from '@/components/buyer/layout/BuyerLocationDialog';
import { cn } from '@/lib/utils';

interface BuyerLocationControlProps {
  className?: string;
  variant?: 'pill' | 'inline' | 'desktop';
}

export function BuyerLocationControl({ className, variant = 'pill' }: BuyerLocationControlProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const delivery = useBuyerDeliveryOptional();
  const selected = delivery?.selected ?? null;
  const query = searchParams?.toString();
  const returnTo = React.useMemo(() => {
    const base = pathname || '/buy/home';
    return query ? `${base}?${query}` : base;
  }, [pathname, query]);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const triggerClassName = cn(
    variant === 'pill'
      ? 'inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border border-[var(--border-1)] bg-[var(--bg-surface)] px-2.5 py-2 text-[var(--fg-2)] transition-colors hover:bg-[var(--bg-recessed)]'
      : variant === 'desktop'
        ? 'inline-flex min-w-0 max-w-[15rem] items-center gap-2 rounded-[16px] px-2.5 py-2 transition-colors hover:bg-cream-100'
        : 'inline-flex max-w-[12rem] items-center gap-1.5 rounded-[10px] px-1 py-1 text-[var(--fg-2)] transition-colors hover:bg-cream-100',
    className,
  );

  const icon = variant === 'desktop' ? (
    <Store className="h-4 w-4 shrink-0 text-[var(--teal-500)]" aria-hidden />
  ) : (
    <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--teal-500)]" aria-hidden />
  );

  const label = variant === 'desktop' ? (
    <>
      <span className="min-w-0">
        <span className="block text-[length:var(--b-text-sub)] font-medium uppercase tracking-[0.08em] text-cream-500">
          Store
        </span>
        <span className="block truncate text-[length:var(--b-text-body)] font-semibold leading-5 text-[var(--fg-1)]">
          {formatBuyerSelectedLocationLabel(selected)}
        </span>
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-cream-500" aria-hidden />
    </>
  ) : (
    <span className="truncate text-sm font-medium text-[var(--fg-1)]">
      {formatBuyerSelectedLocationLabel(selected)}
    </span>
  );

  if (variant === 'desktop') {
    return (
      <>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className={triggerClassName}
          aria-label={`Selected location: ${formatBuyerSelectedLocationLabel(selected)}`}
        >
          {icon}
          {label}
        </button>
        <BuyerLocationDialog open={dialogOpen} onOpenChange={setDialogOpen} returnTo={returnTo} />
      </>
    );
  }

  return (
    <Link
      href={buildBuyerLocationHref(returnTo)}
      onClick={() => markBuyerNavigationForward()}
      className={triggerClassName}
      aria-label={`Selected location: ${formatBuyerSelectedLocationLabel(selected)}`}
    >
      {icon}
      {label}
    </Link>
  );
}
