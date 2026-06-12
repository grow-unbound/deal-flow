import * as React from 'react';

export interface ButtonProps {
  /** Visual style. Default: 'primary' */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Size. Default: 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Button label text */
  label?: string;
  /** Children (overrides label) */
  children?: React.ReactNode;
  /** Disabled state — reduces opacity to 0.45, blocks interaction */
  disabled?: boolean;
  /** Loading state — shows ellipsis, blocks interaction */
  loading?: boolean;
  /** Full-width block button */
  fullWidth?: boolean;
  /** Leading icon (any ReactNode) */
  icon?: React.ReactNode;
  /** HTML button type. Default: 'button' */
  type?: 'button' | 'submit' | 'reset';
  /** Click handler */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export declare function Button(props: ButtonProps): JSX.Element;
