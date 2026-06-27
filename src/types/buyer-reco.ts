import type { BuyerCatalogItem } from '@/types/buyer';

export interface CartBundleSlot {
  tenant_category_id: string;
  slot_label: string | null;
  is_required: boolean;
  display_order: number;
  top_product: BuyerCatalogItem | null;
}

export interface CartBundle {
  id: string;
  name: string;
  slots: CartBundleSlot[];
}

export interface CartBundlesResponse {
  bundles: CartBundle[];
}
