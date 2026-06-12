import * as React from 'react';

/** Order lifecycle + catalog + entity statuses */
export type StatusValue =
  | 'draft' | 'published' | 'archived'
  | 'received' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled'
  | 'active' | 'inactive' | 'pending';

export interface StatusChipProps {
  /** The status key. Each key maps to a colour + shape glyph + default label. */
  status: StatusValue;
  /** Override the display label (keeps the glyph and colour from status). */
  label?: string;
}

export declare function StatusChip(props: StatusChipProps): JSX.Element;
