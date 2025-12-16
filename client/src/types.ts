export interface Discount {
  id?: string;
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

export interface ItemBooking {
  booked_by: string;   // Client Name
  system_user?: string; // Staff/User Name
  booked_at: string;
  expired_at: string;
  notes?: string;
}

// [NEW] Interface for Global Rates
export interface ExchangeRates {
    eur_rate: number;
    usd_rate: number;
    last_updated: string;
}

export interface Product {
  id: string;
  brand: string;
  category: string;
  collection: string;
  
  code: string;             // System Generated SKU (e.g. SLAM-POLA-TUBA)
  manufacturer_code?: string; // Original ID from Factory (e.g. A123-F)

  image_url: string;
  
  // Stock Counters
  total_stock: number;
  booked_stock: number;
  sold_stock: number;
  
  // [MODIFIED] Pricing Fields
  currency: 'EUR' | 'USD' | 'IDR'; // Tracks the Base Currency Source
  retail_price_idr: number;        // Always stored for easy sorting/filtering
  retail_price_eur?: number;
  retail_price_usd?: number;
  
  nett_price_idr?: number; 
  discounts?: Discount[];   
  discount_ids?: string[]; 
  
  dimensions?: string;
  finishing?: string;
  detail?: string;
  
  is_not_for_sale?: boolean;
  is_upcoming?: boolean;
  upcoming_eta?: string; 

  last_sequence?: number; // Internal counter for stock serialization
  created_at?: string;
}

export interface InventoryItem {
  id: string;
  product_id: string;
  product_name: string;
  qr_code: string;
  
  status: 'AVAILABLE' | 'SOLD' | 'BOOKED' | 'DAMAGED' | 'NOT_FOR_SALE';
  
  booking?: ItemBooking;
  sold_at?: string;
  po_number?: string;
  
  current_location: string;
  history_log: {
    action: string;
    batch_id?: string;
    location: string;
    date: string;
    note?: string;
  }[];
}