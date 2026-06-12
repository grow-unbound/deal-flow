import * as React from 'react';

export interface SearchBarProps {
  /** Placeholder text. Default: 'Search…' */
  placeholder?: string;
  /** Controlled value */
  value?: string;
  /** Default value (uncontrolled) */
  defaultValue?: string;
  /** Show keyboard shortcut badge (e.g. '⌘K'). Default: undefined */
  shortcut?: string;
  /** Size. Default: 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Disabled state */
  disabled?: boolean;
  /** Full-width block. Default: false */
  fullWidth?: boolean;
  /** Change handler */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Clear handler — shows ✕ button when provided and input has a value */
  onClear?: () => void;
  /** Submit handler */
  onSubmit?: (value: string) => void;
}

export declare function SearchBar(props: SearchBarProps): JSX.Element;
