import * as React from 'react';

export interface AvatarProps {
  /** Full name — used to derive initials and deterministic background */
  name?: string;
  /** Image URL — if provided, renders an image instead of initials */
  src?: string;
  /** Alt text for image variant */
  alt?: string;
  /** Size preset. Default: 'md' */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Shape. Default: 'circle' */
  shape?: 'circle' | 'square';
}

export declare function Avatar(props: AvatarProps): JSX.Element;
