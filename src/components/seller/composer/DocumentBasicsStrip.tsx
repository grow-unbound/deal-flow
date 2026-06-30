'use client';

import {
  ComposerBasicsField,
  ComposerBasicsStrip,
} from '@/components/seller/composer/ComposerLayout';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { minDateAfterIso } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import type { ComposerLocationOption } from '@/types/estimate-composer';

export type DocumentComposerKind = 'estimate' | 'so' | 'invoice';

const SECOND_LABELS: Record<DocumentComposerKind, string> = {
  estimate: 'Valid until',
  so: 'Expected delivery',
  invoice: 'Due date',
};

const DATE_LABELS: Record<DocumentComposerKind, string> = {
  estimate: 'Date issued',
  so: 'Order date',
  invoice: 'Invoice date',
};

const DOC_NUMBER_LABELS: Record<DocumentComposerKind, string> = {
  estimate: 'Estimate #',
  so: 'Sales order #',
  invoice: 'Invoice #',
};

const borderlessInputClass =
  'h-auto border-0 bg-transparent px-0 py-0 text-base font-medium text-cream-950 shadow-none placeholder:text-cream-600 focus-visible:ring-0';

const stripDateTriggerClass =
  'h-auto min-h-0 border-0 bg-transparent px-0 py-0 text-left text-base font-medium text-cream-900 shadow-none focus-visible:border-transparent focus-visible:ring-0';

export function DocumentBasicsStrip({
  kind,
  docNumber,
  locationId,
  locationName,
  availableLocations,
  dateIssued,
  secondDate,
  buyerPoRef,
  readOnly = false,
  locationReadOnly = false,
  locationLabel,
  onDateIssuedChange,
  onSecondDateChange,
  onBuyerPoRefChange,
  onLocationChange,
}: {
  kind: DocumentComposerKind;
  docNumber: string;
  locationId: string | null;
  locationName?: string | null;
  availableLocations: ComposerLocationOption[];
  dateIssued: string;
  secondDate: string;
  buyerPoRef: string;
  readOnly?: boolean;
  locationReadOnly?: boolean;
  locationLabel?: string;
  onDateIssuedChange: (value: string) => void;
  onSecondDateChange: (value: string) => void;
  onBuyerPoRefChange: (value: string) => void;
  onLocationChange: (value: string) => void;
}) {
  const resolvedLocationLabel =
    locationLabel
    ?? locationName
    ?? availableLocations.find((location) => location.id === locationId)?.name
    ?? '—';

  return (
    <ComposerBasicsStrip columnsClassName="lg:grid-cols-5">
      <ComposerBasicsField label={DOC_NUMBER_LABELS[kind]}>
        <span className="font-mono text-sm text-cream-950">{docNumber}</span>
      </ComposerBasicsField>

      <ComposerBasicsField label={DATE_LABELS[kind]}>
        {readOnly ? (
          <span className="text-base text-cream-950">{dateIssued}</span>
        ) : (
          <CompactDateField value={dateIssued} onChange={onDateIssuedChange} />
        )}
      </ComposerBasicsField>

      <ComposerBasicsField label={SECOND_LABELS[kind]}>
        {readOnly ? (
          <span className="text-base text-cream-950">{secondDate}</span>
        ) : (
          <CompactDateField
            value={secondDate}
            onChange={onSecondDateChange}
            minDate={minDateAfterIso(dateIssued) ?? undefined}
          />
        )}
      </ComposerBasicsField>

      <ComposerBasicsField label="Buyer PO ref">
        {readOnly ? (
          <span className="text-base text-cream-950">{buyerPoRef || '—'}</span>
        ) : (
          <Input
            value={buyerPoRef}
            onChange={(event) => onBuyerPoRefChange(event.target.value)}
            className={borderlessInputClass}
            placeholder="Optional"
          />
        )}
      </ComposerBasicsField>

      <ComposerBasicsField label="Location">
        {readOnly || locationReadOnly ? (
          <span className="text-base text-cream-950">{resolvedLocationLabel}</span>
        ) : (
          <Select value={locationId ?? undefined} onValueChange={onLocationChange}>
            <SelectTrigger className={cn(borderlessInputClass, 'h-auto px-0 text-base font-medium')}>
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent className="z-[80]">
              {availableLocations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </ComposerBasicsField>
    </ComposerBasicsStrip>
  );
}

function CompactDateField({
  value,
  onChange,
  minDate,
  maxDate,
}: {
  value: string;
  onChange: (value: string) => void;
  minDate?: Date;
  maxDate?: Date;
}) {
  return (
    <DatePicker
      value={value}
      onChange={onChange}
      minDate={minDate}
      maxDate={maxDate}
      mode="overlay"
      showSummary={false}
      triggerClassName={stripDateTriggerClass}
    />
  );
}

export function DocumentComposerFooterRow({
  autoSaveLabel,
  autoSaveTone,
  children,
}: {
  autoSaveLabel: string;
  autoSaveTone?: 'draft' | 'saved' | 'warning' | 'pending';
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex items-center gap-2 text-sm text-cream-700">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            autoSaveTone === 'warning'
              ? 'bg-amber-500'
              : autoSaveTone === 'pending'
                ? 'bg-teal-500 animate-pulse'
              : autoSaveTone === 'saved'
                ? 'bg-teal-500'
                : 'bg-cream-500',
          )}
        />
        {autoSaveLabel}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
