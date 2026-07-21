'use client';

import { useEffect, useId, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
import {
  coerceDateValue,
  formatInputDate,
  formatSelectedSummary,
  isoDateString,
  parseInputDate,
  startOfDay,
} from '@/lib/date-utils';

export interface DatePickerProps {
  value?: string | Date | null;
  onChange?: (value: string) => void;
  minDate?: Date;
  maxDate?: Date;
  /** Visible label — omit when a parent field already provides one */
  label?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** overlay = popover calendar (default); inline = always-visible panel; panel = calendar only */
  mode?: 'overlay' | 'inline' | 'panel';
  showSummary?: boolean;
  /** Merges with default trigger styles (e.g. document basics strip — borderless). */
  triggerClassName?: string;
}

const popoverMotion =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-100 data-[state=open]:duration-100';

export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  label,
  placeholder = 'DD/MM/YYYY',
  error,
  hint,
  disabled = false,
  id,
  className,
  mode = 'overlay',
  showSummary = false,
  triggerClassName: triggerClassNameProp,
}: DatePickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const selectedDate = coerceDateValue(value);

  const [inputValue, setInputValue] = useState(() => (selectedDate ? formatInputDate(selectedDate) : ''));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const next = coerceDateValue(value);
    setInputValue(next ? formatInputDate(next) : '');
  }, [value]);

  function emitChange(date: Date, closeOverlay = false) {
    setInputValue(formatInputDate(date));
    onChange?.(isoDateString(date));
    if (closeOverlay) setOpen(false);
  }

  function handleInputChange(nextValue: string) {
    setInputValue(nextValue);
    const parsed = parseInputDate(nextValue);
    if (!parsed) return;

    const day = startOfDay(parsed).getTime();
    if (minDate && day < startOfDay(minDate).getTime()) return;
    if (maxDate && day > startOfDay(maxDate).getTime()) return;

    emitChange(parsed, mode === 'overlay');
  }

  const triggerClassName = cn(
    'flex h-10 w-full items-center justify-between gap-2 rounded-[8px] border border-cream-400 bg-white px-3 text-left text-base shadow-[inset_0_1px_0_rgba(20,40,35,0.02)]',
    'transition-colors focus-visible:outline-none focus-visible:border-ember-400 focus-visible:ring-2 focus-visible:ring-ember-400/20',
    'disabled:cursor-not-allowed disabled:bg-cream-100 disabled:opacity-50',
    inputValue ? 'font-medium text-cream-900' : 'text-cream-600',
    error && 'border-danger-500 focus-visible:border-danger-500 focus-visible:ring-danger-500/20',
    triggerClassNameProp,
  );

  const calendarPanel = (
    <>
      <Calendar
        value={selectedDate}
        minDate={minDate}
        maxDate={maxDate}
        onChange={(date) => emitChange(date, mode === 'overlay')}
      />
      {showSummary ? (
        <div className="min-h-9 rounded-[8px] border border-cream-300 bg-cream-50 px-4 py-2.5 font-display text-base text-cream-900">
          {selectedDate ? formatSelectedSummary(selectedDate) : '—'}
        </div>
      ) : null}
    </>
  );

  if (mode === 'panel') {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        {label ? (
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">{label}</p>
        ) : null}
        {calendarPanel}
        {error ? <p className="text-sm text-danger-500">{error}</p> : null}
      </div>
    );
  }

  if (mode === 'overlay') {
    return (
      <div className={cn('flex flex-col gap-1.5', disabled && 'pointer-events-none opacity-60', className)}>
        {label ? (
          <label htmlFor={inputId} className="text-body-sm font-medium text-cream-800">
            {label}
          </label>
        ) : null}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button id={inputId} type="button" disabled={disabled} className={triggerClassName}>
              <span className="truncate">{inputValue || placeholder}</span>
              <CalendarDays className="h-4 w-4 shrink-0 text-cream-600" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            className={cn('w-[320px] space-y-3 border-cream-300 bg-white p-4 shadow-md', popoverMotion)}
          >
            {calendarPanel}
          </PopoverContent>
        </Popover>
        {error ? <p className="text-sm text-danger-500">{error}</p> : null}
        {hint && !error ? <p className="text-sm text-cream-700">{hint}</p> : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-[12px] border border-cream-300 bg-white p-4',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label htmlFor={inputId} className="text-sm font-medium text-cream-800">
            {label}
          </label>
        ) : null}
        <input
          id={inputId}
          type="text"
          value={inputValue}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => handleInputChange(event.target.value)}
          className={cn(
            triggerClassName,
            'cursor-text shadow-[inset_0_1px_0_rgba(20,40,35,0.02)] focus:border-ember-400 focus:outline-none focus:ring-2 focus:ring-ember-400/20',
          )}
        />
        {error ? <p className="text-sm text-danger-500">{error}</p> : null}
        {hint && !error ? <p className="text-sm text-cream-700">{hint}</p> : null}
      </div>
      {calendarPanel}
    </div>
  );
}
