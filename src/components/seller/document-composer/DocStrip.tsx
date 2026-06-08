'use client';

import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';

type DocKind = 'estimate' | 'so' | 'invoice';

const SECOND_LABELS: Record<DocKind, string> = {
  estimate: 'Valid until',
  so: 'Expected delivery',
  invoice: 'Due date',
};

const DATE_LABELS: Record<DocKind, string> = {
  estimate: 'Date issued',
  so: 'Order date',
  invoice: 'Invoice date',
};

export function DocStrip({
  kind,
  docNumber,
  dateIssued,
  validUntil,
  buyerPoRef,
  placeOfSupply,
  placeOptions,
  readOnly = false,
  onDocNumberChange,
  onDateIssuedChange,
  onValidUntilChange,
  onBuyerPoRefChange,
  onPlaceOfSupplyChange,
}: {
  kind: DocKind;
  docNumber: string;
  dateIssued: string;
  validUntil: string;
  buyerPoRef: string;
  placeOfSupply: string;
  placeOptions?: string[];
  readOnly?: boolean;
  onDocNumberChange?: (value: string) => void;
  onDateIssuedChange: (value: string) => void;
  onValidUntilChange: (value: string) => void;
  onBuyerPoRefChange: (value: string) => void;
  onPlaceOfSupplyChange: (value: string) => void;
}) {
  return (
    <div className="doc-strip grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-5">
      <Field label={`${kind === 'estimate' ? 'Estimate' : kind === 'so' ? 'Sales order' : 'Invoice'} #`}>
        <span className="field-value font-mono text-[12px]">{docNumber}</span>
      </Field>

      <Field label={DATE_LABELS[kind]}>
        {readOnly ? (
          <span className="field-value">{dateIssued}</span>
        ) : (
          <CompactDateField value={dateIssued} onChange={onDateIssuedChange} label={DATE_LABELS[kind]} />
        )}
      </Field>

      <Field label={SECOND_LABELS[kind]}>
        {readOnly ? (
          <span className="field-value">{validUntil}</span>
        ) : (
          <CompactDateField value={validUntil} onChange={onValidUntilChange} label={SECOND_LABELS[kind]} />
        )}
      </Field>

      <Field label="Buyer PO ref">
        {readOnly ? (
          <span className="field-value">{buyerPoRef || '—'}</span>
        ) : (
          <Input value={buyerPoRef} onChange={(event) => onBuyerPoRefChange(event.target.value)} className="h-9" placeholder="Optional" />
        )}
      </Field>

      <Field label="Place of supply">
        {readOnly ? (
          <span className="field-value">{placeOfSupply || '—'}</span>
        ) : (
          <Input
            value={placeOfSupply}
            onChange={(event) => onPlaceOfSupplyChange(event.target.value)}
            className="h-9"
            placeholder="Enter place of supply"
          />
        )}
      </Field>
    </div>
  );
}

function CompactDateField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <DatePicker
      value={value}
      onChange={onChange}
      label={label}
      mode="overlay"
      className="gap-2"
      showSummary={false}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field border-b border-cream-300 px-4 py-3 last:border-b-0 lg:border-b-0 lg:border-r last:lg:border-r-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cream-700">{label}</p>
      <div className="value mt-2">{children}</div>
    </div>
  );
}
