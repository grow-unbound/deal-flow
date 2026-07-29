import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

import type { SellerLandingPeriod, SellerLandingPeriodOption } from '@/lib/seller-period';

interface HeaderAction {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  horizon: string;
  showHorizonControl?: boolean;
  period?: SellerLandingPeriod;
  periodOptions?: SellerLandingPeriodOption[];
  onPeriodChange?: (period: SellerLandingPeriod) => void;
  secondary?: HeaderAction;
  primary?: string;
  onPrimaryClick?: () => void;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  horizon: _horizon,
  showHorizonControl: _showHorizonControl = true,
  period: _period,
  periodOptions: _periodOptions,
  onPeriodChange: _onPeriodChange,
  secondary,
  primary,
  onPrimaryClick,
}: PageHeaderProps) {
  return (
    <header className="mb-4 flex items-end justify-between gap-4 md:mb-7 md:gap-6">
      <div className="min-w-0">
        <p className="text-[var(--b-text-eyebrow)] font-semibold uppercase tracking-[0.18em] text-cream-700 md:text-xs md:tracking-[0.16em]">{eyebrow}</p>
        <h1 className="font-display text-[var(--b-text-page-sm)] font-semibold leading-[0.96] tracking-[-0.022em] text-cream-900 md:text-3xl md:font-extrabold md:leading-[1.05] md:tracking-[-0.02em]">{title}</h1>
        <p className="mt-1.5 max-w-[64ch] text-[var(--b-text-sub)] font-medium leading-5 tracking-[-0.01em] text-cream-500 md:mt-[10px] md:text-md md:font-normal md:leading-[1.55] md:tracking-0 md:text-cream-700">{subtitle}</p>
      </div>
      <div className="hidden shrink-0 items-center gap-2 pb-0.5 md:flex">
        {secondary ? (
          <Button
            variant="secondary"
            onClick={secondary.onClick}
            disabled={secondary.disabled}
            title={secondary.title}
          >
            {secondary.icon}
            {secondary.label}
          </Button>
        ) : null}
        {primary ? (
          <Button variant="primary" onClick={onPrimaryClick}>
            <Plus size={13} />
            {primary}
          </Button>
        ) : null}
      </div>
    </header>
  );
}
