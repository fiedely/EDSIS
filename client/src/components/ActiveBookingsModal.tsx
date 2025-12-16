import React, { useState, useEffect } from 'react';
import { X, Calendar, User, Loader2, CheckCircle } from 'lucide-react';
import axios from 'axios';
import type { InventoryItem, Product } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void; 
}

interface ExtendedInventoryItem extends InventoryItem {
    product_category?: string;
    product_code?: string;
}

const ActiveBookingsModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [bookings, setBookings] = useState<ExtendedInventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) fetchBookings();
  }, [isOpen]);

  const fetchBookings = async () => {
      setLoading(true);
      try {
          const res = await axios.get('http://127.0.0.1:5001/edievo-project/asia-southeast2/get_all_products');
          const allProducts = res.data.data;
          const bookedProducts = allProducts.filter((p: Product) => p.booked_stock > 0);
          
          let allBookedItems: ExtendedInventoryItem[] = [];

          for (const p of bookedProducts) {
              const invRes = await axios.get(`http://127.0.0.1:5001/edievo-project/asia-southeast2/get_product_inventory?product_id=${p.id}`);
              const items = invRes.data.data.filter((i: InventoryItem) => i.status === 'BOOKED');
              
              const enrichedItems = items.map((i: InventoryItem) => ({
                  ...i,
                  product_category: p.category,
                  product_code: p.code
              }));
              
              allBookedItems = [...allBookedItems, ...enrichedItems];
          }
          
          setBookings(allBookedItems);
      } catch (err) {
          console.error(err);
      } finally {
          setLoading(false);
      }
  };

  const handleRelease = async (itemId: string) => {
      if(!window.confirm("Release this booking?")) return;
      setActionLoading(itemId);
      try {
          await axios.post('http://127.0.0.1:5001/edievo-project/asia-southeast2/release_item', { item_id: itemId });
          await fetchBookings();
          onSuccess();
      } catch(err) {
          console.error(err);
          alert("Error releasing item");
      } finally {
          setActionLoading(null);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="bg-white w-full max-w-2xl shadow-2xl z-10 flex flex-col max-h-[85vh] rounded-none">
        <div className="p-4 bg-primary text-white flex justify-between items-center shrink-0">
            <h2 className="text-lg font-bold tracking-wide flex items-center gap-2">
                <CheckCircle size={20}/> ACTIVE BOOKINGS
            </h2>
            <button onClick={onClose}><X size={20}/></button>
        </div>

        <div className="p-4 overflow-y-auto flex-grow bg-gray-50 space-y-3">
             {loading ? (
                 <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
             ) : bookings.length === 0 ? (
                 <div className="text-center py-10 text-gray-400">No active bookings found.</div>
             ) : (
                 bookings.map(item => {
                     const isExpired = item.booking?.expired_at && new Date(item.booking.expired_at) < new Date();
                     return (
                        <div key={item.id} className="bg-white border p-4 shadow-sm border-l-4 border-l-primary">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="font-bold text-gray-800 text-lg">{item.product_name}</div>
                                    <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">
                                        {item.product_category} • {item.product_code}
                                    </div>
                                </div>
                                <div className="text-right">
                                     {isExpired && (
                                         <div className="text-xs font-bold px-2 py-1 rounded bg-primary/10 text-primary">
                                            EXPIRED
                                         </div>
                                     )}
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded">
                                <div className="flex items-center gap-2">
                                    <User size={14} className="text-gray-400"/>
                                    <span className="font-bold">{item.booking?.booked_by}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Calendar size={14} className="text-gray-400"/>
                                    <span>Exp: {item.booking?.expired_at?.split('T')[0]}</span>
                                </div>
                                <div className="col-span-2 text-xs italic text-gray-500">
                                    Note: {item.booking?.notes || '-'}
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <button 
                                    onClick={() => handleRelease(item.id)}
                                    disabled={!!actionLoading}
                                    className="px-4 py-2 text-xs font-bold border border-gray-400 hover:bg-gray-100 text-gray-600 transition-colors"
                                >
                                    {actionLoading === item.id ? "PROCESSING..." : "RELEASE"}
                                </button>
                            </div>
                        </div>
                     );
                 })
             )}
        </div>
      </div>
    </div>
  );
};

export default ActiveBookingsModal;