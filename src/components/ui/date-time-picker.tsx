'use client';

import { useEffect, useId, useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import {
  formatInputDate,
  formatSelectedSummary,
  parseDatetimeLocal,
  parseInputDate,
  startOfDay,
  toDatetimeLocalValue,
} from '@/lib/date-utils';

export interface DateTimePickerProps {
  value?: string | Date | null;
  onChange?: (value: string) => void;
  minDate?: Date;
  maxDate?: Date;
  label?: string;
  timeLabel?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function DateTimePicker({
  value,
  onChange,
  minDate,
  maxDate,
  label = 'Select date',
  timeLabel = 'Time',
  error,
  disabled = false,
  id,
  className,
}: DateTimePickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const timeInputId = id ? `${id}-time` : `${generatedId}-time`;

  const parsed = value instanceof Date ? value : parseDatetimeLocal(String(value ?? ''));
  const selectedDate = parsed ? startOfDay(parsed) : null;

  const [inputValue, setInputValue] = useState(() => (selectedDate ? formatInputDate(selectedDate) : ''));
  const [timeValue, setTimeValue] = useState(() => {
    if (!parsed) return '09:00';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  });

  useEffect(() => {
    const next = value instanceof Date ? value : parseDatetimeLocal(String(value ?? ''));
    if (!next) {
      setInputValue('');
      return;
    }
    setInputValue(formatInputDate(next));
    const pad = (n: number) => String(n).padStart(2, '0');
    setTimeValue(`${pad(next.getHours())}:${pad(next.getMinutes())}`);
  }, [value]);

  function emit(datePart: Date, time: string) {
    const [hours, minutes] = time.split(':').map(Number);
    const next = new Date(datePart);
    next.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    setInputValue(formatInputDate(next));
    onChange?.(toDatetimeLocalValue(next));
  }

  function handleDateInputChange(nextValue: string) {
    setInputValue(nextValue);
    const parsedDate = parseInputDate(nextValue);
    if (!parsedDate) return;
    emit(parsedDate, timeValue);
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
          placeholder="DD/MM/YYYY"
          onChange={(event) => handleDateInputChange(event.target.value)}
          className={cn(
            'h-10 w-full rounded-[8px] border border-cream-400 bg-white px-3 text-[13.5px] text-cream-900 shadow-[inset_0_1px_0_rgba(20,40,35,0.02)] placeholder:text-cream-600',
            'transition-colors focus:border-ember-400 focus:outline-none focus:ring-2 focus:ring-ember-400/20',
            error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20',
          )}
        />
        {error ? <p className="text-[11.5px] text-danger-500">{error}</p> : null}
      </div>

      <Calendar
        value={selectedDate}
        minDate={minDate}
        maxDate={maxDate}
        onChange={(date) => emit(date, timeValue)}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={timeInputId} className="text-[12px] font-medium text-cream-800">
          {timeLabel}
        </label>
        <input
          id={timeInputId}
          type="time"
          disabled={disabled || !selectedDate}
          value={timeValue}
          onChange={(event) => {
            const next = event.target.value;
            setTimeValue(next);
            if (selectedDate) emit(selectedDate, next);
          }}
          className="h-10 w-full rounded-[8px] border border-cream-400 bg-white px-3 text-[13.5px] text-cream-900 focus:border-ember-400 focus:outline-none focus:ring-2 focus:ring-ember-400/20 disabled:cursor-not-allowed disabled:bg-cream-100 disabled:opacity-50"
        />
      </div>

      <div className="min-h-9 rounded-[8px] border border-cream-300 bg-cream-50 px-4 py-2.5 font-display text-[13px] text-cream-900">
        {selectedDate ? formatSelectedSummary(selectedDate) : '—'}
      </div>
    </div>
  );
}
