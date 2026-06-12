import * as React from 'react';

export interface TabItem {
  id: string;
  label: string;
  /** Optional count badge */
  count?: number;
  /** Disable this tab */
  disabled?: boolean;
}

export interface TabsProps {
  /** Tab items */
  items: TabItem[];
  /** Currently active tab id */
  activeId?: string;
  /** Change handler — receives tab id */
  onChange?: (id: string) => void;
  /** Size. Default: 'md' */
  size?: 'sm' | 'md';
}

export declare function Tabs(props: TabsProps): JSX.Element;
