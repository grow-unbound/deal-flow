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
  /** Icon-only CTAs, no visible label — used by the split-pane (narrow) header.
   * Defaults to false: the original icon+label buttons for the expanded/list-only view. */
  compact?: boolean;
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
  compact = false,
}: PageHeaderProps) {
  return (
    <header className="mb-3 flex items-end justify-between gap-4 md:mb-4 md:gap-6">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow text-cream-600">{eyebrow}</p> : null}
        <h1 className="font-display text-[var(--b-text-page-sm)] font-semibold leading-[0.96] tracking-[-0.022em] text-cream-900 md:text-2xl md:font-extrabold md:leading-[1] md:tracking-[-0.02em]">{title}</h1>
        <p className="mt-0.5 max-w-[64ch] text-[var(--b-text-sub)] font-medium leading-5 tracking-[-0.01em] text-cream-500 md:mt-0.5 md:text-md md:font-normal md:leading-[1.3] md:tracking-0 md:text-cream-700">{subtitle}</p>
      </div>
      <div className="hidden shrink-0 items-center gap-2 pb-0.5 md:flex">
        {secondary ? (
          <Button
            variant="secondary"
            size={compact ? 'icon' : 'md'}
            onClick={secondary.onClick}
            disabled={secondary.disabled}
            aria-label={secondary.label}
            title={secondary.title ?? secondary.label}
          >
            {secondary.icon}
            {compact ? null : secondary.label}
          </Button>
        ) : null}
        {primary ? (
          <Button variant="primary" size={compact ? 'icon' : 'md'} onClick={onPrimaryClick} aria-label={primary} title={primary}>
            <Plus size={compact ? 16 : 13} />
            {compact ? null : primary}
          </Button>
        ) : null}
      </div>
    </header>
  );
}
