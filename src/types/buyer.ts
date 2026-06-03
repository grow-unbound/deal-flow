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
  stock_status: 'available' | 'limited' | 'out_of_stock';
  on_hand: number;
}

export interface BuyerCategory {
  id: string;
  name: string;
  slug: string;
  product_count: number;
}

export interface BuyerBrand {
  id: string;
  name: string;
}

export interface BuyerCatalogResponse {
  items: BuyerCatalogItem[];
  total: number;
  has_more: boolean;
}

export interface BuyerCategoriesResponse {
  categories: BuyerCategory[];
}
