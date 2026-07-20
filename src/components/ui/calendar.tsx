'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isSameDay, startOfDay } from '@/lib/date-utils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

interface CalendarDay {
  day: number;
  date: Date;
  isCurrentMonth: boolean;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function buildCalendarDays(viewDate: Date): CalendarDay[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = new Date(year, month, 1).getDay();
  const mondayOffset = (firstDay + 6) % 7;
  const days: CalendarDay[] = [];

  const daysInPrevMonth = getDaysInMonth(year, month - 1);
  for (let i = mondayOffset - 1; i >= 0; i -= 1) {
    const day = daysInPrevMonth - i;
    days.push({
      day,
      date: new Date(year, month - 1, day),
      isCurrentMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push({
      day,
      date: new Date(year, month, day),
      isCurrentMonth: true,
    });
  }

  const remaining = 42 - days.length;
  for (let day = 1; day <= remaining; day += 1) {
    days.push({
      day,
      date: new Date(year, month + 1, day),
      isCurrentMonth: false,
    });
  }

  return days;
}

function isDateInRange(date: Date, minDate?: Date, maxDate?: Date): boolean {
  const day = startOfDay(date).getTime();
  if (minDate && day < startOfDay(minDate).getTime()) return false;
  if (maxDate && day > startOfDay(maxDate).getTime()) return false;
  return true;
}

export interface CalendarProps {
  value?: Date | null;
  onChange?: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  className?: string;
}

export function Calendar({ value, onChange, minDate, maxDate, rangeStart, rangeEnd, className }: CalendarProps) {
  const [viewDate, setViewDate] = useState(() => {
    if (value) return new Date(value.getFullYear(), value.getMonth(), 1);
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const valueMonthKey = value ? `${value.getFullYear()}-${value.getMonth()}` : null;
  const prevMonthKey = useRef(valueMonthKey);

  useEffect(() => {
    if (!value || !valueMonthKey || valueMonthKey === prevMonthKey.current) return;
    prevMonthKey.current = valueMonthKey;
    setViewDate(new Date(value.getFullYear(), value.getMonth(), 1));
  }, [value, valueMonthKey]);

  const calendarDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const today = useMemo(() => startOfDay(new Date()), []);
  const monthYear = viewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  function handleDaySelect(day: CalendarDay) {
    if (!day.isCurrentMonth) return;
    if (!isDateInRange(day.date, minDate, maxDate)) return;
    onChange?.(day.date);
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-cream-300 bg-white text-cream-700 transition-colors hover:bg-cream-50"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 text-center text-base font-semibold tracking-[-0.02em] text-cream-900">
          {monthYear}
        </div>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-cream-300 bg-white text-cream-700 transition-colors hover:bg-cream-50"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-700"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {calendarDays.map((dayObj) => {
          const isSelected = value ? isSameDay(value, dayObj.date) : false;
          const dayTs = startOfDay(dayObj.date).getTime();
          const rangeStartTs = rangeStart ? startOfDay(rangeStart).getTime() : null;
          const rangeEndTs = rangeEnd ? startOfDay(rangeEnd).getTime() : null;
          const isRangeEndpoint =
            (rangeStart ? isSameDay(rangeStart, dayObj.date) : false) ||
            (rangeEnd ? isSameDay(rangeEnd, dayObj.date) : false);
          const isInRange =
            rangeStartTs != null &&
            rangeEndTs != null &&
            dayTs > Math.min(rangeStartTs, rangeEndTs) &&
            dayTs < Math.max(rangeStartTs, rangeEndTs);
          const isToday = isSameDay(today, dayObj.date);
          const isDisabled = !dayObj.isCurrentMonth || !isDateInRange(dayObj.date, minDate, maxDate);

          return (
            <button
              key={dayObj.date.toISOString()}
              type="button"
              disabled={isDisabled}
              onClick={() => handleDaySelect(dayObj)}
              className={cn(
                'relative flex aspect-square w-full items-center justify-center rounded-[10px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5642F]/20',
                dayObj.isCurrentMonth ? 'text-cream-900' : 'bg-transparent text-cream-300',
                isDisabled && dayObj.isCurrentMonth && 'cursor-not-allowed bg-cream-50 text-cream-400',
                !isDisabled && dayObj.isCurrentMonth && 'bg-white hover:bg-[#F7F2EC]',
                isInRange && !isSelected && 'bg-[#F6E8DA] text-[#5B4635] hover:bg-[#F1DFC8]',
                isRangeEndpoint && 'border border-[#B5642F] bg-[#B5642F] font-semibold text-white hover:bg-[#B5642F]',
                isSelected && 'border border-[#B5642F] bg-[#B5642F] font-semibold text-white hover:bg-[#B5642F]',
                isToday && !isSelected && 'border border-[#D9894C] text-[#5B4635]',
              )}
            >
              {isToday && !isSelected ? (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#B5642F]" aria-hidden />
              ) : null}
              {dayObj.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
