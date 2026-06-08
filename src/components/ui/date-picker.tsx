'use client';

import { useEffect, useId, useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
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
  label?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  mode?: 'inline' | 'overlay';
  /** Show formatted selection summary below the calendar */
  showSummary?: boolean;
}

export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  label = 'Select date',
  placeholder = 'DD/MM/YYYY',
  error,
  hint,
  disabled = false,
  id,
  className,
  mode = 'inline',
  showSummary = true,
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

  function emitChange(date: Date) {
    setInputValue(formatInputDate(date));
    onChange?.(isoDateString(date));
  }

  function handleInputChange(nextValue: string) {
    setInputValue(nextValue);
    const parsed = parseInputDate(nextValue);
    if (!parsed) return;

    const day = startOfDay(parsed).getTime();
    if (minDate && day < startOfDay(minDate).getTime()) return;
    if (maxDate && day > startOfDay(maxDate).getTime()) return;

    emitChange(parsed);
  }

  const inputClassName = cn(
    'h-10 w-full rounded-[8px] border border-cream-400 bg-white px-3 text-[13.5px] text-cream-900 shadow-[inset_0_1px_0_rgba(20,40,35,0.02)] placeholder:text-cream-600',
    'transition-colors focus:border-ember-400 focus:outline-none focus:ring-2 focus:ring-ember-400/20',
    error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20',
  );

  const calendarPanel = (
    <>
      <Calendar
        value={selectedDate}
        minDate={minDate}
        maxDate={maxDate}
        onChange={(date) => {
          emitChange(date);
          setOpen(false);
        }}
      />

      {showSummary ? (
        <div className="min-h-9 rounded-[8px] border border-cream-300 bg-cream-50 px-4 py-2.5 font-display text-[13px] text-cream-900">
          {selectedDate ? formatSelectedSummary(selectedDate) : '—'}
        </div>
      ) : null}
    </>
  );

  if (mode === 'overlay') {
    return (
      <div className={cn('flex flex-col gap-1.5', disabled && 'pointer-events-none opacity-60', className)}>
        <label htmlFor={inputId} className="text-[12px] font-medium text-cream-800">
          {label}
        </label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <input
              id={inputId}
              type="text"
              value={inputValue}
              disabled={disabled}
              placeholder={placeholder}
              onFocus={() => setOpen(true)}
              onChange={(event) => handleInputChange(event.target.value)}
              className={inputClassName}
            />
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={8} className="w-[320px] space-y-4 border-cream-300 bg-white p-4">
            {calendarPanel}
          </PopoverContent>
        </Popover>
        {error ? <p className="text-[11.5px] text-danger-500">{error}</p> : null}
        {hint && !error ? <p className="text-[11.5px] text-cream-700">{hint}</p> : null}
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
        <label htmlFor={inputId} className="text-[12px] font-medium text-cream-800">
          {label}
        </label>
        <input
          id={inputId}
          type="text"
          value={inputValue}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => handleInputChange(event.target.value)}
          className={inputClassName}
        />
        {error ? <p className="text-[11.5px] text-danger-500">{error}</p> : null}
        {hint && !error ? <p className="text-[11.5px] text-cream-700">{hint}</p> : null}
      </div>

      {calendarPanel}
    </div>
  );
}
