'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useFlagState } from '@/hooks/useFeatureFlag';
import { useTenantSettings } from '@/hooks/useTenantSettings';

export interface SellerMobileSegmentedTab {
  id: string;
  label: string;
  href?: string;
  count?: number | string;
}

interface SellerMobileSegmentedTabsProps {
  tabs: SellerMobileSegmentedTab[];
  active: string;
  onChange?: (id: string) => void;
  className?: string;
}

export function SellerMobileSegmentedTabs({
  tabs,
  active,
  onChange,
  className,
}: SellerMobileSegmentedTabsProps) {
  return (
    <div className={cn('mx-4 mt-3 flex rounded-[10px] bg-cream-200 p-[3px] md:hidden', className)} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const content = (
          <>
            <span className={cn('text-[var(--b-text-sub)] font-medium', isActive ? 'text-teal-500' : 'text-cream-700')}>
              {tab.label}
            </span>
            {tab.count != null ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-px font-mono text-[var(--b-text-eyebrow)]',
                  isActive ? 'bg-teal-50 text-teal-500' : 'bg-cream-300 text-cream-700',
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </>
        );

        const className = 'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 transition';
        const style = {
          background: isActive ? '#fff' : 'transparent',
          boxShadow: isActive ? '0 1px 2px rgba(31,58,52,0.06)' : 'none',
        };

        if (tab.href) {
          return (
            <Link key={tab.id} href={tab.href} className={className} style={style} role="tab" aria-selected={isActive}>
              {content}
            </Link>
          );
        }

        return (
          <button
            key={tab.id}
            type="button"
            className={className}
            style={style}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange?.(tab.id)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export function SellerMobileTransactionTabs({ active }: { active: 'estimates' | 'orders' | 'invoices' }) {
  const estimatesFlag = useFlagState('ESTIMATES');
  const salesOrdersFlag = useFlagState('SALES_ORDERS');
  const invoicesFlag = useFlagState('INVOICES');
  const { data: settings } = useTenantSettings();
  const features = settings?.modules.orders.features;
  if (!features || estimatesFlag === undefined || salesOrdersFlag === undefined || invoicesFlag === undefined) {
    return null;
  }
  const tabs = [
    {
      id: 'estimates',
      label: 'Estimates',
      href: '/estimates',
      enabled: estimatesFlag !== false && features?.enquiries !== false,
    },
    {
      id: 'orders',
      label: 'Orders',
      href: '/sales-orders',
      enabled: salesOrdersFlag !== false && features?.sales_orders !== false,
    },
    {
      id: 'invoices',
      label: 'Invoices',
      href: '/invoices',
      enabled: invoicesFlag !== false && features?.invoices !== false,
    },
  ].filter((tab) => tab.enabled);

  if (tabs.length <= 1) return null;

  return (
    <SellerMobileSegmentedTabs
      active={active}
      tabs={tabs}
    />
  );
}
