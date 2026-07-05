export interface BuyerCatalogItem {
  id: string;
  tenant_product_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  campaign_valid_until: string | null;
  internal_sku: string;
  display_name: string;
  brand_id: string | null;
  brand_name: string | null;
  category_id: string | null;
  category_name: string | null;
  mrp: number;
  price: number;
  resolved_price?: number | null;
  campaign_price?: number | null;
  has_campaign_price?: boolean;
  gst_rate?: number | null;
  default_uom: string | null;
  pack_size: number | null;
  image_urls: string[];
  brand_logo_url?: string | null;
  category_image_url?: string | null;
  stock_status: 'available' | 'limited' | 'out_of_stock';
  on_hand: number;
  /** From campaign_items when product appears in a catalog. */
  is_featured?: boolean;
}

export interface BuyerCatalogSummary {
  id: string;
  name: string;
  product_count: number;
  share_token: string;
  valid_until: string | null;
  hero_image_url?: string | null;
}

export interface BuyerPromotionSummary extends BuyerCatalogSummary {}

export interface BuyerCategory {
  id: string;
  name: string;
  slug: string;
  product_count: number;
  image_url?: string | null;
}

export interface BuyerBrand {
  id: string;
  name: string;
  product_count?: number;
  logo_url?: string | null;
}

export interface BuyerBrandsResponse {
  brands: BuyerBrand[];
}

export interface BuyerCatalogResponse {
  items: BuyerCatalogItem[];
  total: number;
  has_more: boolean;
  catalogs?: BuyerCatalogSummary[];
  selected_campaign_id?: string | null;
  selected_campaign_name?: string | null;
  selected_campaign_valid_until?: string | null;
  selected_campaign_message?: string | null;
}

export interface BuyerCategoriesResponse {
  categories: BuyerCategory[];
}

export interface BuyerResolvedProductsResponse {
  items: BuyerCatalogItem[];
  missing_ids: string[];
}

export type BuyerAppMode = 'buyer' | 'preview';
