export interface BuyerCatalogItem {
  id: string;
  tenant_product_id: string;
  catalog_id: string | null;
  catalog_name: string | null;
  catalog_valid_until: string | null;
  internal_sku: string;
  display_name: string;
  brand_id: string | null;
  brand_name: string | null;
  category_id: string | null;
  category_name: string | null;
  mrp: number;
  price: number;
  default_uom: string | null;
  pack_size: number | null;
  image_urls: string[];
  brand_logo_url?: string | null;
  category_image_url?: string | null;
  stock_status: 'available' | 'limited' | 'out_of_stock';
  on_hand: number;
  /** From published_catalog_items when product appears in a catalog. */
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
  selected_catalog_id?: string | null;
  selected_catalog_name?: string | null;
  selected_catalog_valid_until?: string | null;
}

export interface BuyerCategoriesResponse {
  categories: BuyerCategory[];
}

export type BuyerAppMode = 'buyer' | 'preview';
