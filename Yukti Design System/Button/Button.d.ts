import * as React from 'react';

export interface ButtonProps {
  /**
   * Visual style. Default: 'primary'
   * - `primary`   — charcoal #221E1A fill (the confident default action)
   * - `accent`    — copper #B5642F fill. RESERVED: max one per screen, for the single
   *                 most important / terminal action (e.g. "Publish catalog", "Place order").
   * - `secondary` — paper surface, charcoal text, hairline border
   * - `ghost`     — transparent, charcoal text
   * - `danger`    — destructive (error-tinted)
   */
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
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
