'use client';

import { AlertTriangle, MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SettingsSectionCard } from './SettingsSectionCard';

export function WhatsAppCreditsCard({
  balance,
  purchased,
  lowBalance,
  onTopUp,
  isTopUpPending,
}: {
  balance: number;
  purchased: number;
  lowBalance: boolean;
  onTopUp: () => void;
  isTopUpPending: boolean;
}) {
  const denom = Math.max(purchased, 1);
  const pct = Math.min(100, Math.round((balance / denom) * 100));
  const empty = balance <= 0;
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
            <div
              className={`h-full rounded-full transition-all ${empty ? 'bg-danger-500' : lowBalance ? 'bg-warning-500' : 'bg-teal-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <Button type="button" variant={empty ? 'primary' : 'secondary'} disabled={isTopUpPending} onClick={() => onTopUp()}>
          {isTopUpPending ? 'Working…' : empty ? 'Top up to send' : 'Top up credits'}
        </Button>
      </div>

      {lowBalance ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning-500/40 bg-warning-50 px-3 py-2 text-body-sm text-warning-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" aria-hidden />
          <span>
            {empty
              ? 'You are out of WhatsApp credits. Top up to keep sending messages.'
              : "You're running low on WhatsApp credits — top up soon to avoid interruptions."}
          </span>
        </div>
      ) : null}

      <div className="rounded-lg border border-cream-200 bg-cream-50 px-3 py-2 text-body-sm text-cream-700">
        <p className="font-medium text-cream-800">What costs what</p>
        <p className="mt-1">Most messages: 1 credit. Marketing broadcasts: 4 credits.</p>
      </div>

      <p className="text-body-sm text-cream-600">
        Credits do not expire. Self-serve purchase is coming soon — use Top up to see contact options.
      </p>
    </SettingsSectionCard>
  );
}
