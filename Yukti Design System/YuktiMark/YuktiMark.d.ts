import * as React from 'react';

export interface YuktiMarkProps {
  /**
   * Height (and width) in px. The mark occupies a square viewBox. Default: 32
   */
  size?: number;
  /**
   * Colour variant:
   * - 'copper'    → #B5642F on light (default — single-colour)
   * - 'copperLt'  → #D9894C on dark surfaces
   * - 'ink'       → #221E1A charcoal knockout
   * - 'white'     → #F3EEE6 reversed (on dark)
   * - 'twoTone'   → copper keystone + ink haunches (expressive / hero only,
   *                  never where one-colour reproduction is needed)
   */
  variant?: 'copper' | 'copperLt' | 'ink' | 'white' | 'twoTone';
  /** Accessible label. Default: 'Yukti' */
  ariaLabel?: string;
}

export declare function YuktiMark(props: YuktiMarkProps): JSX.Element;
