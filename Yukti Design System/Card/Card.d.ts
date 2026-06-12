import * as React from 'react';

export interface CardProps {
  /** Children */
  children?: React.ReactNode;
  /** Internal padding size. Default: 'md' */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Show border. Default: true */
  bordered?: boolean;
  /** Lift with shadow. Default: false */
  elevated?: boolean;
  /** Dark variant — charcoal surface */
  dark?: boolean;
  /** Click handler — makes card interactive */
  onClick?: () => void;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** ARIA role override */
  role?: string;
}

export declare function Card(props: CardProps): JSX.Element;
