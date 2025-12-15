export interface Product {
  id: string;
  brand: string;
  category: string;
  collection: string;
  code: string;
  image_url: string;
  dimensions: string;
  retail_price_idr: number;
  total_stock: number;
}

export type GroupedProducts = {
  [key: string]: Product[];
};