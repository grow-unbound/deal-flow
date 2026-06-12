import * as React from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  /** Field label */
  label?: string;
  /** Placeholder shown as first disabled option. Default: 'Select…' */
  placeholder?: string;
  /** Option list */
  options: SelectOption[];
  /** Controlled value */
  value?: string;
  /** Uncontrolled default value */
  defaultValue?: string;
  /** Helper text */
  hint?: string;
  /** Error message — replaces hint */
  error?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Required — appends * to label */
  required?: boolean;
  /** HTML id */
  id?: string;
  /** HTML name */
  name?: string;
  /** Change handler — receives string value */
  onChange?: (value: string) => void;
}

export declare function Select(props: SelectProps): JSX.Element;
