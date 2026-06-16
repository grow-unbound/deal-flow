'use client';

import { useState } from 'react';
import { CreditCard } from 'lucide-react';

import { ErrorState } from '@/components/ui/empty-state';
import { useBillingSettings } from '@/hooks/useBillingSettings';
import { useTenantSettings } from '@/hooks/useTenantSettings';
import type { PlanTier } from '@/constants/tier-limits';

import { PlanComparisonTable } from './PlanComparisonTable';
import { PlanHeroCard } from './PlanHeroCard';
import { SettingsSectionCard } from './SettingsSectionCard';
import { UpgradePlanCard } from './UpgradePlanCard';
import { UpgradePlanDialog } from './UpgradePlanDialog';
import { UsageWarningBanner } from './UsageWarningBanner';
import { WhatsAppCreditsCard } from './WhatsAppCreditsCard';

export function BillingSettingsClient() {
  const { data, isLoading, isError, error, refetch, requestUpgrade, requestTopUp, isRequestingUpgrade, isRequestingTopUp } =
    useBillingSettings();
  const { data: settings } = useTenantSettings();

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState<PlanTier | null>(null);

  const defaultName = settings?.general?.business?.company_name ?? '';
  const defaultPhone = settings?.general?.business?.phone ?? '';

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy>
        <div className="h-48 animate-pulse rounded-xl bg-cream-100" />
        <div className="h-36 animate-pulse rounded-xl border border-cream-100 bg-cream-50" />
        <div className="h-56 animate-pulse rounded-xl border border-cream-100 bg-cream-50" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        heading="Could not load billing"
        description={error instanceof Error ? error.message : 'Something went wrong.'}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <PlanHeroCard plan={data.plan} usage={data.usage} limits={data.limits} />

        <WhatsAppCreditsCard
          balance={data.whatsapp.balance}
          purchased={data.whatsapp.purchased}
          onTopUp={() => void requestTopUp()}
          isTopUpPending={isRequestingTopUp}
        />
      </div>

      <UsageWarningBanner warnings={data.warnings} />

      <UpgradePlanCard
        currentPlan={data.plan}
        onChooseUpgrade={(target) => {
          setUpgradeTarget(target);
          setUpgradeOpen(true);
        }}
      />

      <SettingsSectionCard
        title="Plan comparison"
        subtitle="All plans include the same features. Only limits differ."
        icon={CreditCard}
      >
        <PlanComparisonTable currentPlan={data.plan} />
      </SettingsSectionCard>

      <UpgradePlanDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        targetTier={upgradeTarget}
        defaultName={defaultName}
        defaultPhone={defaultPhone}
        requestUpgrade={requestUpgrade}
        isPending={isRequestingUpgrade}
      />
    </div>
  );
}
