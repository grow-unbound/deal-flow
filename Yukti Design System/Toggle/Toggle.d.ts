import * as React from 'react';

export interface ToggleProps {
  /** Controlled checked state */
  checked?: boolean;
  /** Default (uncontrolled) checked state */
  defaultChecked?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Label text shown beside the toggle */
  label?: string;
  /** Helper text shown below the label */
  hint?: string;
  /** Size. Default: 'md' */
  size?: 'sm' | 'md';
  /** Change handler — receives new boolean value */
  onChange?: (checked: boolean) => void;
}

export declare function Toggle(props: ToggleProps): JSX.Element;
