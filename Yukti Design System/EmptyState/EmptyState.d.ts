import * as React from 'react';

export type EmptyKind = 'orders' | 'catalog' | 'buyers' | 'search' | 'generic';

export interface EmptyStateProps {
  /**
   * Illustration preset — drives the SVG shown.
   * Default: 'generic' (arch structure)
   */
  kind?: EmptyKind;
  /** Heading text */
  title?: string;
  /** Supporting body copy */
  body?: string;
  /** CTA element — pass a <Button> or any ReactNode */
  action?: React.ReactNode;
  /** Override illustration entirely */
  illustration?: React.ReactNode;
}

export declare function EmptyState(props: EmptyStateProps): JSX.Element;
