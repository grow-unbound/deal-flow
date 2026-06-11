'use client';

import {
  ComposerBasicsField,
  ComposerBasicsStrip,
} from '@/components/seller/composer/ComposerLayout';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { minDateAfterIso } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

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
  'h-auto border-0 bg-transparent px-0 py-0 text-[14px] font-medium text-cream-950 shadow-none placeholder:text-cream-600 focus-visible:ring-0';

const stripDateTriggerClass =
  'h-auto min-h-0 border-0 bg-transparent px-0 py-0 text-left text-[14px] font-medium text-cream-900 shadow-none focus-visible:border-transparent focus-visible:ring-0';

export function DocumentBasicsStrip({
  kind,
  docNumber,
  dateIssued,
  secondDate,
  buyerPoRef,
  placeOfSupply,
  readOnly = false,
  onDateIssuedChange,
  onSecondDateChange,
  onBuyerPoRefChange,
  onPlaceOfSupplyChange,
}: {
  kind: DocumentComposerKind;
  docNumber: string;
  dateIssued: string;
  secondDate: string;
  buyerPoRef: string;
  placeOfSupply: string;
  readOnly?: boolean;
  onDateIssuedChange: (value: string) => void;
  onSecondDateChange: (value: string) => void;
  onBuyerPoRefChange: (value: string) => void;
  onPlaceOfSupplyChange: (value: string) => void;
}) {
  return (
    <ComposerBasicsStrip columnsClassName="lg:grid-cols-5">
      <ComposerBasicsField label={DOC_NUMBER_LABELS[kind]}>
        <span className="font-mono text-[12px] text-cream-950">{docNumber}</span>
      </ComposerBasicsField>

      <ComposerBasicsField label={DATE_LABELS[kind]}>
        {readOnly ? (
          <span className="text-[13px] text-cream-950">{dateIssued}</span>
        ) : (
          <CompactDateField value={dateIssued} onChange={onDateIssuedChange} />
        )}
      </ComposerBasicsField>

      <ComposerBasicsField label={SECOND_LABELS[kind]}>
        {readOnly ? (
          <span className="text-[13px] text-cream-950">{secondDate}</span>
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
          <span className="text-[13px] text-cream-950">{buyerPoRef || '—'}</span>
        ) : (
          <Input
            value={buyerPoRef}
            onChange={(event) => onBuyerPoRefChange(event.target.value)}
            className={borderlessInputClass}
            placeholder="Optional"
          />
        )}
      </ComposerBasicsField>

      <ComposerBasicsField label="Place of supply">
        {readOnly ? (
          <span className="text-[13px] text-cream-950">{placeOfSupply || '—'}</span>
        ) : (
          <Input
            value={placeOfSupply}
            onChange={(event) => onPlaceOfSupplyChange(event.target.value)}
            className={cn(borderlessInputClass, 'font-normal text-[13px] text-cream-900')}
            placeholder="Enter place of supply"
          />
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
      <div className="inline-flex items-center gap-2 text-[12px] text-cream-700">
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
