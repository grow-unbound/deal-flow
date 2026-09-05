'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Ban, Check, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiPatch } from '@/lib/api-fetch';
import {
  filterReviewAnomalies,
  reviewCountLabel,
  reviewIssueLabel,
  reviewRowKey,
  skuRecommendations,
} from '@/lib/onboarding/review-anomalies';
import { formatNumberInput } from '@/lib/utils';
import type { ImportAnomaly } from '@/lib/onboarding/types';

const GST_RATES = ['0', '5', '12', '18', '28'] as const;

export function OnboardingReviewPanel({
  anomalies,
  existingSkus,
  closeMode,
  onClose,
  onIgnore,
}: {
  anomalies: ImportAnomaly[];
  existingSkus: string[];
  closeMode: 'back' | 'dismiss';
  onClose: () => void;
  onIgnore: (key: string) => void;
}): React.ReactNode {
  const rows = useMemo(() => filterReviewAnomalies(anomalies), [anomalies]);
  const recs = useMemo(() => skuRecommendations(rows, existingSkus), [rows, existingSkus]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-cream-50">
      <div className="flex shrink-0 items-center gap-2 border-b border-cream-200 bg-white px-3 py-3">
        {closeMode === 'back' ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close review">
            <X className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-cream-900">{reviewCountLabel(rows.length)}</p>
          <p className="text-body-sm text-cream-600">Fix missing data for imported products (optional)</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
        <div className="hidden lg:block">
          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.4fr)] gap-3 border-b border-cream-200 px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-600">
            <span>Product name</span>
            <span>Issue</span>
            <span>Field</span>
          </div>
          <div className="divide-y divide-cream-200">
            {rows.map((row) => (
              <ReviewIssueRow
                key={reviewRowKey(row)}
                row={row}
                recommendation={recs.get(reviewRowKey(row)) ?? ''}
                layout="desktop"
                onIgnore={() => onIgnore(reviewRowKey(row))}
              />
            ))}
          </div>
        </div>
        <div className="space-y-3 lg:hidden">
          {rows.map((row) => (
            <ReviewIssueRow
              key={reviewRowKey(row)}
              row={row}
              recommendation={recs.get(reviewRowKey(row)) ?? ''}
              layout="mobile"
              onIgnore={() => onIgnore(reviewRowKey(row))}
            />
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-body-sm text-cream-600">Nothing left to fix.</p>
        ) : null}
      </div>
    </div>
  );
}

function ReviewIssueRow({
  row,
  recommendation,
  layout,
  onIgnore,
}: {
  row: ImportAnomaly;
  recommendation: string;
  layout: 'desktop' | 'mobile';
  onIgnore: () => void;
}): React.ReactNode {
  const [value, setValue] = useState(row.kind === 'missing_sku' ? recommendation : '');
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(true);
  const [saving, setSaving] = useState(false);
  const issue = reviewIssueLabel(row.kind);

  async function save() {
    if (!row.productId) {
      toast.error('This row is not editable yet');
      return;
    }
    const body: Record<string, unknown> = {};
    if (row.kind === 'missing_gst') {
      if (!value) {
        toast.error('Pick a GST rate');
        return;
      }
      body.gst_rate = Number(value);
    }
    if (row.kind === 'zero_price') {
      const amount = Number(value.replace(/,/g, ''));
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error('Enter a selling rate');
        return;
      }
      body.base_selling_price = amount;
    }
    if (row.kind === 'missing_sku') {
      const sku = value.trim();
      if (!sku) {
        toast.error('Enter a SKU');
        return;
      }
      body.internal_sku = sku;
    }
    setSaving(true);
    const res = await apiPatch(`/api/tenant/products/${row.productId}`, body);
    setSaving(false);
    if (!res.ok) {
      toast.error('Could not save');
      return;
    }
    setSaved(true);
    setEditing(false);
  }

  const field = (
    <IssueField
      kind={row.kind}
      value={value}
      disabled={!editing || saving}
      onChange={setValue}
    />
  );
  const actions = (
    <div className="flex shrink-0 items-center gap-1">
      {saved && !editing ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Edit"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={saving}
          aria-label="Save"
          onClick={() => void save()}
        >
          <Check className="h-4 w-4" />
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={saving}
        aria-label="Ignore"
        onClick={onIgnore}
      >
        <Ban className="h-4 w-4" />
      </Button>
    </div>
  );

  if (layout === 'mobile') {
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl border border-cream-200 bg-white px-3 py-3">
        <div className="min-w-0 flex-1 text-left">
          <p className="font-medium text-cream-900">{row.productName}</p>
          <p className="mt-0.5 text-body-sm text-cream-600">{issue}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="w-[7.5rem]">{field}</div>
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.4fr)] items-center gap-3 px-2 py-3">
      <p className="min-w-0 truncate font-medium text-cream-900">{row.productName}</p>
      <p className="text-body-sm text-cream-700">{issue}</p>
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">{field}</div>
        {actions}
      </div>
    </div>
  );
}

function IssueField({
  kind,
  value,
  disabled,
  onChange,
}: {
  kind: ImportAnomaly['kind'];
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}): React.ReactNode {
  if (kind === 'missing_gst') {
    return (
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="GST %" />
        </SelectTrigger>
        <SelectContent>
          {GST_RATES.map((rate) => (
            <SelectItem key={rate} value={rate}>{rate}%</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (kind === 'zero_price') {
    return (
      <div className="flex min-w-0 items-stretch">
        <span className="inline-flex items-center rounded-l-[8px] border border-r-0 border-cream-400 bg-cream-200 px-2.5 text-body-sm text-cream-700">₹</span>
        <Input
          className="h-9 rounded-l-none font-mono"
          placeholder="Price"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(formatNumberInput(e.target.value, 'CURRENCY_EXACT'))}
        />
      </div>
    );
  }
  return (
    <Input
      className="h-9 font-mono"
      placeholder="SKU"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
