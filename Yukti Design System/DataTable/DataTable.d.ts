import * as React from 'react';

export interface ColumnDef<T = Record<string, unknown>> {
  /** Data key to read from each row object */
  key: string;
  /** Column header label */
  label: string;
  /** Right-align and apply tabular figures (for numbers, currency) */
  numeric?: boolean;
  /** Custom cell renderer */
  render?: (value: unknown, row: T, rowIndex: number) => React.ReactNode;
  /** Column min-width in px */
  minWidth?: number;
}

export interface DataTableProps<T = Record<string, unknown>> {
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Row data array */
  rows: T[];
  /** Text shown when rows is empty */
  emptyLabel?: string;
  /** Row click handler */
  onRowClick?: (row: T, index: number) => void;
  /** Keep header visible on scroll */
  stickyHeader?: boolean;
}

export declare function DataTable<T = Record<string, unknown>>(props: DataTableProps<T>): JSX.Element;
