'use client';

import { useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/utils';
import { isoDateString, parseIsoDate } from '@/lib/date-utils';

export interface DateRangePickerProps {
  validFrom: string;
  validTo: string;
  onValidFromChange: (value: string) => void;
  onValidToChange: (value: string) => void;
  emptyLabel?: string;
  error?: string;
  className?: string;
}

const popoverMotion =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-100 data-[state=open]:duration-100';

export function DateRangePicker({
  validFrom,
  validTo,
  onValidFromChange,
  onValidToChange,
  emptyLabel = 'Set date range',
  error,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectingEnd, setSelectingEnd] = useState(false);

  const summary = validFrom
    ? `${formatDate(validFrom)} → ${validTo ? formatDate(validTo) : 'Open ended'}`
    : emptyLabel;

  const fromDate = parseIsoDate(validFrom);
  const toDate = parseIsoDate(validTo);

  function handleDateSelect(date: Date) {
    const next = isoDateString(date);
    if (!validFrom || !selectingEnd || (fromDate && date < fromDate)) {
      onValidFromChange(next);
      onValidToChange('');
      setSelectingEnd(true);
      return;
    }

    onValidToChange(next);
    setSelectingEnd(false);
    setOpen(false);
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left text-base font-medium text-cream-950"
          >
            <span className="truncate">{summary}</span>
            {validFrom ? (
              <CalendarDays className="h-4 w-4 shrink-0 text-cream-600" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-cream-600" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className={cn('w-[320px] space-y-4 border-cream-300 bg-white p-4 shadow-md', popoverMotion)}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-700">Validity range</p>
                <p className="mt-1 text-sm text-cream-700">
                  {selectingEnd && validFrom ? 'Select an end date' : 'Select a start date'}
                </p>
              </div>
              {validFrom ? (
                <button
                  type="button"
                  className="text-sm font-medium text-teal-700 hover:text-teal-800"
                  onClick={() => {
                    onValidFromChange('');
                    onValidToChange('');
                    setSelectingEnd(false);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <Calendar
              value={toDate ?? fromDate}
              onChange={handleDateSelect}
              rangeStart={fromDate}
              rangeEnd={toDate}
            />
          </div>
        </PopoverContent>
      </Popover>
      {error ? <p className="text-sm text-danger-500">{error}</p> : null}
    </div>
  );
}
