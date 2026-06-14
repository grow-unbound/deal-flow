'use client';

import { useEffect, useId, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

const popoverMotion =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-100 data-[state=open]:duration-100';

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
  const [open, setOpen] = useState(false);

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

  function emit(datePart: Date, time: string, closeOverlay = false) {
    const [hours, minutes] = time.split(':').map(Number);
    const next = new Date(datePart);
    next.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    setInputValue(formatInputDate(next));
    onChange?.(toDatetimeLocalValue(next));
    if (closeOverlay) setOpen(false);
  }

  const triggerClassName = cn(
    'flex h-10 w-full items-center justify-between gap-2 rounded-[8px] border border-cream-400 bg-white px-3 text-left text-base shadow-[inset_0_1px_0_rgba(20,40,35,0.02)]',
    'transition-colors focus-visible:outline-none focus-visible:border-ember-400 focus-visible:ring-2 focus-visible:ring-ember-400/20',
    'disabled:cursor-not-allowed disabled:bg-cream-100 disabled:opacity-50',
    inputValue ? 'font-medium text-cream-900' : 'text-cream-600',
    error && 'border-danger-500 focus-visible:border-danger-500 focus-visible:ring-danger-500/20',
  );

  return (
    <div className={cn('space-y-3', disabled && 'pointer-events-none opacity-60', className)}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-cream-800">
          {label}
        </label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button id={inputId} type="button" disabled={disabled} className={triggerClassName}>
              <span className="truncate">{inputValue || 'DD/MM/YYYY'}</span>
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
            <Calendar
              value={selectedDate}
              minDate={minDate}
              maxDate={maxDate}
              onChange={(date) => emit(date, timeValue, true)}
            />
            <div className="min-h-9 rounded-[8px] border border-cream-300 bg-cream-50 px-4 py-2.5 font-display text-base text-cream-900">
              {selectedDate ? formatSelectedSummary(selectedDate) : '—'}
            </div>
          </PopoverContent>
        </Popover>
        {error ? <p className="text-sm text-danger-500">{error}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={timeInputId} className="text-sm font-medium text-cream-800">
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
          className="h-10 w-full rounded-[8px] border border-cream-400 bg-white px-3 text-base text-cream-900 focus:border-ember-400 focus:outline-none focus:ring-2 focus:ring-ember-400/20 disabled:cursor-not-allowed disabled:bg-cream-100 disabled:opacity-50"
        />
      </div>
    </div>
  );
}
