import * as React from 'react';

export interface BadgeProps {
  /**
   * Semantic variant. Each variant carries a shape glyph AND a label —
   * never colour alone (WCAG + brand requirement).
   * Default: 'neutral'
   */
  variant?: 'copper' | 'success' | 'warning' | 'error' | 'neutral';
  /** Text label */
  label?: string;
  /** Children (overrides label) */
  children?: React.ReactNode;
}

export declare function Badge(props: BadgeProps): JSX.Element;
