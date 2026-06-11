'use client';

import { MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SettingsSectionCard } from './SettingsSectionCard';

export function WhatsAppCreditsCard({
  balance,
  purchased,
  onTopUp,
  isTopUpPending,
}: {
  balance: number;
  purchased: number;
  onTopUp: () => void;
  isTopUpPending: boolean;
}) {
  const denom = Math.max(purchased, 1);
  const pct = Math.min(100, Math.round((balance / denom) * 100));
  return (
    <SettingsSectionCard
      title="WhatsApp credits"
      subtitle="Used for buyer OTPs and notifications. Each message typically consumes one credit."
      icon={MessageCircle}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <span className="font-display text-3xl font-medium tracking-tight text-cream-900">{balance.toLocaleString()}</span>
            <span className="ml-2 text-body-sm text-cream-600">credits remaining of {purchased.toLocaleString()} purchased</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-cream-200">
            <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Button type="button" variant="secondary" disabled={isTopUpPending} onClick={() => onTopUp()}>
          {isTopUpPending ? 'Working…' : 'Top up credits'}
        </Button>
      </div>
      <p className="rounded-lg border border-cream-200 bg-cream-50 px-3 py-2 text-body-sm text-cream-700">
        Credits do not expire. Self-serve purchase is coming soon — use Top up to see contact options.
      </p>
    </SettingsSectionCard>
  );
}
