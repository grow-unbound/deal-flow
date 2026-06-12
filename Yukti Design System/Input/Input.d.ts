import * as React from 'react';

export interface InputProps {
  /** Field label — renders above the input */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Helper text below the field */
  hint?: string;
  /** Error message — replaces hint and activates error state */
  error?: string;
  /** Input type. Default: 'text' */
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'search' | 'url';
  /** Controlled value */
  value?: string;
  /** Uncontrolled default value */
  defaultValue?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Required field — appends * to label */
  required?: boolean;
  /** Leading prefix text (e.g. '₹', '+91') */
  prefix?: string;
  /** Trailing suffix text (e.g. 'kg', '%') */
  suffix?: string;
  /** HTML id */
  id?: string;
  /** HTML name */
  name?: string;
  /** Change handler */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Blur handler */
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export declare function Input(props: InputProps): JSX.Element;
