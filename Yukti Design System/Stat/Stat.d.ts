import * as React from 'react';

export interface StatProps {
  /** The headline metric — string for pre-formatted values (e.g. '₹ 4.2L') */
  value: string | number;
  /** Label below the metric */
  label: string;
  /** Trend string (e.g. '+18%', '-4.2%') */
  trend?: string;
  /** Direction of trend. Drives colour + arrow icon. Default: 'neutral' */
  trendDir?: 'up' | 'down' | 'neutral';
  /** Comparison context (e.g. 'vs last month') */
  trendContext?: string;
  /** Currency or unit prefix shown inline with value (e.g. '₹') */
  prefix?: string;
  /** Optional icon (ReactNode) — shown in top-right corner */
  icon?: React.ReactNode;
  /** Dark variant */
  dark?: boolean;
}

export declare function Stat(props: StatProps): JSX.Element;
