/**
 * Calendar date picker component aligned to DealFlow design system.
 * 
 * A custom calendar widget with month/year navigation, keyboard support, and
 * integration into modal/slide-over contexts. Follows the Ember/Cream palette
 * and Fraunces typography.
 * 
 * @example
 * ```jsx
 * const [selectedDate, setSelectedDate] = React.useState(null);
 * 
 * <Calendar
 *   value={selectedDate}
 *   onChange={setSelectedDate}
 *   minDate={new Date(2026, 0, 1)}
 *   maxDate={new Date(2026, 11, 31)}
 * />
 * ```
 */
export interface CalendarProps {
  /** Currently selected date (Date object or null) */
  value?: Date | null;
  
  /** Callback fired when a date is selected */
  onChange?: (date: Date | null) => void;
  
  /** Earliest selectable date (dates before are disabled) */
  minDate?: Date;
  
  /** Latest selectable date (dates after are disabled) */
  maxDate?: Date;
}

export function Calendar(props: CalendarProps): JSX.Element;
