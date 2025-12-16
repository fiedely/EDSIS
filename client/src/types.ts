export interface Discount {
  id?: string; // <--- NEW: Link to Master Rule
  name: string;
  value: number; 
}

export interface DiscountRule {
  id: string;
  name: string;
  value: number;
  start_date?: string; 
  end_date?: string;   
  is_active: boolean;
}

export interface BookingInfo {
  is_booked: boolean;
  booked_by_user_id?: string;
  booked_by_name?: string;
  booked_at?: string;
  expired_at?: string;
  notes?: string;
}

export interface Product {
  id: string;
  brand: string;
  category: string;
  collection: string;
  code: string;
  image_url: string;
  total_stock: number;
  
  // --- Prices ---
  retail_price_idr: number;
  retail_price_eur?: number;
  nett_price_idr?: number; 
  discounts?: Discount[];   
  discount_ids?: string[]; // <--- NEW: Helper for fast queries
  
  // --- Details ---
  dimensions?: string;
  finishing?: string;
  detail?: string;
  
  // --- Flags & Status ---
  is_not_for_sale?: boolean;
  is_upcoming?: boolean;
  upcoming_eta?: string; 
  
  booking_info?: BookingInfo;

  search_keywords?: string[];
  created_at?: string;
}

export interface InventoryItem {
  id: string;
  product_id: string;
  product_name: string;
  qr_code: string;
  status: 'AVAILABLE' | 'SOLD' | 'RESERVED' | 'DAMAGED' | 'NOT_FOR_SALE';
  current_location: string;
  history_log: {
    action: string;
    location: string;
    date: string;
    note?: string;
  }[];
}