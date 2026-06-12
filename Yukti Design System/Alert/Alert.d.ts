import * as React from 'react';

export interface AlertProps {
  /** Semantic variant drives icon, colour, and border. Default: 'info' */
  variant?: 'info' | 'success' | 'warning' | 'error';
  /** Bold heading line */
  title?: string;
  /** Supporting body text */
  body?: string;
  /** Children (appended after body) */
  children?: React.ReactNode;
  /** Dismiss callback — renders ✕ button when provided */
  onDismiss?: () => void;
}

export declare function Alert(props: AlertProps): JSX.Element;
