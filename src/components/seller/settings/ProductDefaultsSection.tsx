'use client';

import Link from 'next/link';
import { Info, Tag } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsSectionCard } from '@/components/seller/settings/SettingsSectionCard';
import { GST_RATE_OPTIONS, UOM_OPTIONS } from '@/constants/settings-modules';
import type { ProductDefaults } from '@/types/tenant-settings';

export interface ProductDefaultsSectionProps {
  value: ProductDefaults;
  onChange: (next: ProductDefaults) => void;
  gstInclusive?: boolean;
}

export function ProductDefaultsSection({ value, onChange, gstInclusive = false }: ProductDefaultsSectionProps) {
  return (
    <SettingsSectionCard
      title="Product Defaults"
      subtitle="Starting values that pre-fill when you create a new product category. Change them per category anytime."
      icon={Tag}
      footer={
        <div className="flex items-start gap-2 text-sm text-cream-700">
          <Info size={14} className="mt-0.5 shrink-0 text-cream-500" aria-hidden />
          <span>
            These only apply to new categories — existing ones are not affected. Manage categories under{' '}
            <Link href="/products" className="font-medium text-teal-600 hover:underline">
              Catalog
            </Link>
            .
          </span>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!gstInclusive && (
          <div className="space-y-2">
            <Label>Default GST rate</Label>
            <Select
              value={String(value.gst_rate)}
              onValueChange={(v) => onChange({ ...value, gst_rate: Number(v) as ProductDefaults['gst_rate'] })}
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
            <p className="text-xs text-cream-600">Most of your products are likely in one slab — set it here to save time.</p>
          </div>
        )}
        <div className="space-y-2">
          <Label>Default unit of measurement</Label>
          <Select value={value.uom} onValueChange={(uom) => onChange({ ...value, uom })}>
            <SelectTrigger>
              <SelectValue placeholder="UOM" />
            </SelectTrigger>
            <SelectContent>
              {UOM_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-cream-600">How you typically sell — can be changed per category.</p>
        </div>
      </div>
    </SettingsSectionCard>
  );
}
