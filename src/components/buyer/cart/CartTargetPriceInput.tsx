'use client';

import * as React from 'react';
import { formatNumberInput, parseNumberInput } from '@/lib/number-format';

interface CartTargetPriceInputProps {
  label: string;
  value: number | null | undefined;
  placeholder: string;
  /** Emits the plain numeric string (no commas) or '' when cleared. */
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string | null;
}

/**
 * ₹-prefixed, comma-formatted target price field for cart lines. The cart
 * stores a number, so we keep a local formatted draft to avoid losing
 * in-progress input like "1,200." on every keystroke.
 */
export function CartTargetPriceInput({ label, value, placeholder, onChange, onBlur, error }: CartTargetPriceInputProps) {
  const [draft, setDraft] = React.useState(() => formatNumberInput(value ?? null, 'CURRENCY_EXACT'));

  React.useEffect(() => {
    setDraft((current) => (
      parseNumberInput(current, 'CURRENCY_EXACT') === (value ?? null)
        ? current
        : formatNumberInput(value ?? null, 'CURRENCY_EXACT')
    ));
  }, [value]);

  return (
    <label className="space-y-1">
      <span style={{ fontSize: 'var(--b-text-eyebrow)', color: 'var(--fg-3)' }}>{label}</span>
      <div
        className={`flex h-9 overflow-hidden rounded-[8px] border bg-white focus-within:border-[var(--teal-500)] ${error ? 'border-[var(--danger-500)]' : 'border-[var(--border-1)]'}`}
      >
        <span className="flex h-full items-center border-r border-[var(--border-1)] bg-cream-100 px-2.5 text-sm font-semibold text-cream-700">₹</span>
        <input
          value={draft}
          onChange={(event) => {
            const next = formatNumberInput(event.target.value, 'CURRENCY_EXACT');
            setDraft(next);
            const parsed = parseNumberInput(next, 'CURRENCY_EXACT');
            onChange(parsed == null ? '' : String(parsed));
          }}
          onBlur={onBlur}
          inputMode="decimal"
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
          placeholder={placeholder}
        />
      </div>
      {error ? (
        <span className="block text-[11px] font-medium text-[var(--danger-500)]">{error}</span>
      ) : null}
    </label>
  );
}
