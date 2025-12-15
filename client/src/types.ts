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
  finishing?: string; // Added this
}

export interface HistoryLog {
  action: string;
  date: string;
  location: string;
  note: string;
}

export interface InventoryItem {
  id: string;
  product_id: string;
  qr_code: string;
  status: 'AVAILABLE' | 'SOLD' | 'BOOKED';
  current_location: string;
  history_log: HistoryLog[];
}

export type GroupedProducts = {
  [key: string]: Product[];
};