import { useState, useCallback } from 'react';
import axios from 'axios';
import type { Product, ExchangeRates } from '../types';

export function useInventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [loading, setLoading] = useState(true);

  // We define the API base here to keep it consistent. 
  // In a real production setup, this might come from import.meta.env.VITE_API_URL
  const API_BASE = 'http://127.0.0.1:5001/edievo-project/asia-southeast2';

  const fetchProducts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (!silent) {
        // Preserving the existing logic: Trigger background cleanup on first load
        await axios.post(`${API_BASE}/check_expired_bookings`);
      }
      
      const rateRes = await axios.get(`${API_BASE}/get_exchange_rates`);
      setRates(rateRes.data.data);

      const res = await axios.get(`${API_BASE}/get_all_products`);
      setProducts(res.data.data);
      return res.data.data;
    } catch (err) {
      console.error("API Error:", err);
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  return { products, rates, loading, fetchProducts };
}