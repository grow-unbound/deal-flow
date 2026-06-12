import * as React from 'react';

export interface ProductCardProps {
  /** Product name */
  name: string;
  /** Brand name */
  brand?: string;
  /** Internal SKU — shown in IBM Plex Mono */
  sku?: string;
  /** Cohort price for this buyer */
  price: number | string;
  /** MRP (manufacturer's retail price) — shown smaller for reference */
  mrp?: number | string;
  /** Unit of measure (e.g. 'per pcs', 'per kg') */
  uom?: string;
  /** Product image URL */
  imageUrl?: string;
  /** Availability status. Default: 'available' */
  availability?: 'available' | 'limited' | 'out-of-stock';
  /** Whether to show "New" badge */
  isNew?: boolean;
  /** Add to cart handler */
  onAddToCart?: () => void;
  /** Card click handler */
  onClick?: () => void;
}

export declare function ProductCard(props: ProductCardProps): JSX.Element;
