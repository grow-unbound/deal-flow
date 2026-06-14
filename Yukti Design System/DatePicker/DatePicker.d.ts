import * as React from 'react';

export interface DatePickerProps {
  /** Field label */
  label?: string;
  /** Placeholder when no date chosen. Default: 'DD MMM YYYY' */
  placeholder?: string;
  /** Controlled value — ISO string (YYYY-MM-DD) or Date */
  value?: string | Date;
  /** Uncontrolled initial value */
  defaultValue?: string | Date;
  /** Earliest selectable date (ISO or Date) */
  min?: string | Date;
  /** Latest selectable date (ISO or Date) */
  max?: string | Date;
  /** Helper text */
  hint?: string;
  /** Error message — replaces hint, red ring */
  error?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Required — appends * to label */
  required?: boolean;
  /** HTML name (writes ISO value to a hidden input) */
  name?: string;
  /** HTML id */
  id?: string;
  /** Change handler — receives ISO string (YYYY-MM-DD) */
  onChange?: (iso: string) => void;
}

export declare function DatePicker(props: DatePickerProps): JSX.Element;
