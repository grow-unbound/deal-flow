'use client';

import { Building2 } from 'lucide-react';
import { FeatureToggleRow } from '@/components/seller/settings/FeatureToggleRow';
import { SettingsSectionCard } from '@/components/seller/settings/SettingsSectionCard';
import type { BusinessPolicy } from '@/types/tenant-settings';

interface BusinessPolicySectionProps {
  value: BusinessPolicy;
  onChange: (v: BusinessPolicy) => void;
}

export function BusinessPolicySection({ value, onChange }: BusinessPolicySectionProps) {
  return (
    <SettingsSectionCard
      title="Business Policy"
      subtitle="Controls how credit and pricing work across your entire account."
      icon={Building2}
    >
      <FeatureToggleRow
        label="Enable credit for buyers"
        description="When off, credit limits, terms, and outstanding balances are hidden everywhere in the app."
        checked={value.credit_enabled}
        onCheckedChange={(credit_enabled) => onChange({ ...value, credit_enabled })}
      />
      <FeatureToggleRow
        label="GST included in prices"
        description="When on, your prices are treated as GST-inclusive. GST is not broken out separately in documents."
        checked={value.gst_inclusive}
        onCheckedChange={(gst_inclusive) => onChange({ ...value, gst_inclusive })}
      />
      {value.gst_inclusive && (
        <div className="border-t border-cream-200 bg-cream-50 px-5 py-3">
          <p className="text-xs text-cream-600">
            Product GST rates are preserved and will reapply if you switch this off.
          </p>
        </div>
      )}
    </SettingsSectionCard>
  );
}
