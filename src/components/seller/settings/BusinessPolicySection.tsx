'use client';

import { Scale } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FeatureToggleRow } from '@/components/seller/settings/FeatureToggleRow';
import { SettingsSectionCard } from '@/components/seller/settings/SettingsSectionCard';
import { GST_RATE_OPTIONS, UOM_OPTIONS } from '@/constants/settings-modules';
import type { BusinessPolicy } from '@/types/tenant-settings';

interface BusinessPolicySectionProps {
  value: BusinessPolicy;
  onChange: (v: BusinessPolicy) => void;
  defaultUom: string;
  onDefaultUomChange: (uom: string) => void;
  routingThresholdKm: number;
  onRoutingThresholdKmChange: (km: number) => void;
  className?: string;
}

export function BusinessPolicySection({
  value,
  onChange,
  defaultUom,
  onDefaultUomChange,
  routingThresholdKm,
  onRoutingThresholdKmChange,
  className,
}: BusinessPolicySectionProps) {
  return (
    <SettingsSectionCard
      className={className}
      title="Business Policy"
      subtitle="Controls credit, GST defaults, product units, and warehouse routing."
      icon={Scale}
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
      {!value.gst_inclusive ? (
        <div className="border-t border-cream-200 px-5 py-4">
          <div className="max-w-xs space-y-2">
            <Label>Default GST rate</Label>
            <Select
              value={String(value.gst_rate)}
              onValueChange={(v) =>
                onChange({ ...value, gst_rate: Number(v) as BusinessPolicy['gst_rate'] })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="GST rate" />
              </SelectTrigger>
              <SelectContent>
                {GST_RATE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-cream-600">
              Used as the starting slab for new products when GST is shown separately.
            </p>
          </div>
        </div>
      ) : null}
      {value.gst_inclusive ? (
        <div className="border-t border-cream-200 bg-cream-50 px-5 py-3">
          <p className="text-base text-cream-600">
            Product GST rates are preserved and will reapply if you switch this off.
          </p>
        </div>
      ) : null}

      <div className="border-t border-cream-200 px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Default unit of measure</Label>
            <Select value={defaultUom} onValueChange={onDefaultUomChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select UOM" />
              </SelectTrigger>
              <SelectContent>
                {UOM_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-cream-600">Pre-filled when adding new products.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="routing_threshold">Nearest warehouse threshold (km)</Label>
            <Input
              id="routing_threshold"
              type="number"
              min={1}
              max={5000}
              step={10}
              value={routingThresholdKm}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1 && v <= 5000) onRoutingThresholdKmChange(v);
              }}
            />
            <p className="text-sm text-cream-600">Maximum distance to assign a buyer order to a warehouse.</p>
          </div>
        </div>
      </div>
    </SettingsSectionCard>
  );
}
