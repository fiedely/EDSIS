export interface Product {
  id: string;
  brand: string;
  category: string;
  collection: string;
  code: string;
  image_url: string;
  total_stock: number;
  retail_price_idr: number;
  retail_price_eur?: number;
  dimensions?: string;
  finishing?: string;
  detail?: string; // <--- NEW FIELD
  search_keywords?: string[];
  created_at?: string;
}

export interface InventoryItem {
  id: string;
  product_id: string;
  product_name: string;
  qr_code: string;
  status: 'AVAILABLE' | 'SOLD' | 'RESERVED' | 'DAMAGED';
  current_location: string;
  history_log: {
    action: string;
    location: string;
    date: string;
    note?: string;
  }[];
}