import React, { useEffect, useState, useRef } from 'react';
import { X, MapPin, QrCode, History, Package, ZoomIn, Settings, AlertTriangle, Clock, Percent, Book, User, Edit2, Loader2 } from 'lucide-react';
import axios from 'axios';
import type { Product, InventoryItem } from '../types';
import StorageImage from './StorageImage';
import clsx from 'clsx';

interface Props {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRefresh: () => void;
}

const ProductDetailModal: React.FC<Props> = ({ product, isOpen, onClose, onEdit, onRefresh }) => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'INFO' | 'STOCK'>('INFO');
  
  const [isZoomed, setIsZoomed] = useState(false);
  
  const prevProductIdRef = useRef<string | null>(null);

  const [bookingItem, setBookingItem] = useState<string | null>(null);
  const [bookForm, setBookForm] = useState({ client_name: '', expired_at: '', notes: '' });
  
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const fetchInventory = async () => {
        if (!product) return;
        setLoading(true);
        try {
            const res = await axios.get(`http://127.0.0.1:5001/edievo-project/asia-southeast2/get_product_inventory?product_id=${product.id}`);
            setInventory(res.data.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (isOpen && product) {
      if (prevProductIdRef.current !== product.id) {
          setActiveTab('INFO');
          prevProductIdRef.current = product.id;
      }
      setIsZoomed(false); 
      fetchInventory();
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setBookForm({ client_name: '', expired_at: tomorrow.toISOString().split('T')[0], notes: '' });
    } else {
        setInventory([]);
    }
  }, [isOpen, product]);

  const reloadData = async () => {
      if(!product) return;
      try {
          const res = await axios.get(`http://127.0.0.1:5001/edievo-project/asia-southeast2/get_product_inventory?product_id=${product.id}`);
          setInventory(res.data.data);
          onRefresh(); 
      } catch(err) { console.error(err); }
  };

  if (!isOpen || !product) return null;

  const handleBookSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!bookingItem) return;
      setIsProcessing(true);
      try {
          await axios.post('http://127.0.0.1:5001/edievo-project/asia-southeast2/book_item', {
              item_id: bookingItem,
              booked_by: bookForm.client_name, 
              system_user: 'Guest User', 
              notes: bookForm.notes,
              expired_at: bookForm.expired_at
          });
          setBookingItem(null);
          
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          setBookForm({ client_name: '', expired_at: tomorrow.toISOString().split('T')[0], notes: '' });
          
          await reloadData();
      } catch (err) {
          console.error(err);
          alert("Booking failed");
      } finally {
          setIsProcessing(false);
      }
  };

  const handleRelease = async (itemId: string) => {
      if (!window.confirm("Release this booking?")) return;
      setIsProcessing(true);
      try {
          await axios.post('http://127.0.0.1:5001/edievo-project/asia-southeast2/release_item', { item_id: itemId });
          await reloadData();
      } catch (err) { 
          console.error(err); 
          alert("Error releasing item");
      } finally { 
          setIsProcessing(false); 
      }
  };

  const isNFS = product.is_not_for_sale;
  const isUpcoming = product.is_upcoming;
  const hasDiscount = product.discounts && product.discounts.length > 0;
  
  const visibleInventory = inventory.filter(i => i.status !== 'SOLD');
  const bookedCount = visibleInventory.filter(i => i.status === 'BOOKED').length;

  return (
    <>
        <div className="fixed inset-0 z-40 bg-white flex flex-col animate-in slide-in-from-bottom-5 duration-300">
            
            <div className="h-64 bg-gray-100 relative shrink-0 shadow-sm group">
                <button onClick={onClose} className="absolute top-4 right-4 bg-white shadow-md hover:bg-gray-50 p-2 rounded-full text-primary transition-all z-20">
                    <X size={24} />
                </button>

                <div className="w-full h-full relative cursor-zoom-in" onClick={() => setIsZoomed(true)}>
                    <StorageImage filename={product.image_url} alt={product.collection} className="w-full h-full object-contain p-4 transition-transform duration-300 group-hover:scale-105" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
                        <div className="bg-white/80 backdrop-blur-sm p-3 rounded-full shadow-lg">
                            <ZoomIn size={24} className="text-primary" />
                        </div>
                    </div>
                </div>
                
                <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-4 pt-10 text-white pointer-events-none">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="text-xs font-bold text-primary-light uppercase tracking-wider">{product.brand}</div>
                        {isNFS && <span className="bg-gray-800 text-white text-[9px] px-2 py-0.5 rounded font-bold uppercase">Not For Sale</span>}
                        {isUpcoming && <span className="bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded font-bold uppercase">Upcoming</span>}
                    </div>
                    <h2 className="text-2xl font-bold leading-tight">{product.collection}</h2>
                    <div className="text-xs text-white/70 mt-1">{product.code}</div>
                </div>
            </div>

            <div className="flex border-b border-gray-200 bg-white shadow-sm z-10">
                <button 
                    onClick={() => setActiveTab('INFO')}
                    className={`flex-1 py-4 text-xs font-bold tracking-widest uppercase transition-colors
                        ${activeTab === 'INFO' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-gray-400 hover:text-gray-600'}
                    `}
                >
                    Product Info
                </button>
                <button 
                    onClick={() => setActiveTab('STOCK')}
                    className={`flex-1 py-4 text-xs font-bold tracking-widest uppercase transition-colors flex items-center justify-center gap-2
                        ${activeTab === 'STOCK' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-gray-400 hover:text-gray-600'}
                    `}
                >
                    Stock List ({visibleInventory.length})
                    {bookedCount > 0 && (
                        <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1">
                            <Book size={10}/> {bookedCount}
                        </span>
                    )}
                </button>
            </div>

            <div className="flex-grow overflow-y-auto bg-gray-50 p-4">
                
                {activeTab === 'INFO' && (
                    <div className="bg-white border border-gray-200 p-6 space-y-6 shadow-sm">
                        {isNFS && (
                            <div className="bg-gray-100 border-l-4 border-gray-500 p-3 flex items-start gap-3">
                                <AlertTriangle size={18} className="text-gray-500 mt-0.5"/>
                                <div>
                                    <div className="text-sm font-bold text-gray-800">Item Not For Sale</div>
                                    <div className="text-xs text-gray-500">This item is for display or reference only.</div>
                                </div>
                            </div>
                        )}
                        {isUpcoming && (
                            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 flex items-start gap-3">
                                <Clock size={18} className="text-blue-500 mt-0.5"/>
                                <div>
                                    <div className="text-sm font-bold text-blue-800">Coming Soon</div>
                                    <div className="text-xs text-blue-600">Expected Arrival: {product.upcoming_eta || 'TBA'}</div>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-6">
                            <div className="col-span-2">
                                <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Category</div>
                                <div className="text-base font-medium text-gray-800">{product.category}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Dimensions</div>
                                <div className="text-base font-medium text-gray-800">{product.dimensions}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Finishing</div>
                                <div className="text-base font-medium text-gray-800">{product.finishing || '-'}</div>
                            </div>

                            {product.detail && (
                                <div className="col-span-2 pt-2">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Detail</div>
                                    <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{product.detail}</div>
                                </div>
                            )}

                            <div className="col-span-2 pt-4 border-t border-gray-100">
                                <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Retail Price (IDR)</div>
                                {hasDiscount ? (
                                    <div className="flex flex-col">
                                        <div className="text-sm text-gray-400 line-through decoration-red-400 decoration-1">
                                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(product.retail_price_idr)}
                                        </div>
                                        <div className="text-2xl font-bold text-red-600 flex items-center gap-2">
                                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(product.nett_price_idr || product.retail_price_idr)}
                                            <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide">Promo</span>
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            {product.discounts?.map((d, i) => (
                                                <div key={i} className="flex items-center gap-1 text-[10px] font-bold text-white bg-red-500 px-2 py-1 rounded">
                                                    <Percent size={10} /> {d.name} OFF
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-xl font-bold text-primary">
                                        {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(product.retail_price_idr)}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'STOCK' && (
                    <div className="space-y-3">
                        {loading ? (
                            <div className="text-center py-10 text-gray-400 text-xs animate-pulse flex flex-col items-center">
                                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2"></div>
                                Loading inventory...
                            </div>
                        ) : visibleInventory.length === 0 ? (
                            <div className="text-center py-10 text-gray-400 italic">No available stock.</div>
                        ) : (
                            visibleInventory.map((item, index) => {
                                const isBooked = item.status === 'BOOKED';
                                const isBookingThis = bookingItem === item.id;

                                return (
                                <div key={item.id} className={clsx("bg-white border shadow-sm transition-all", isBooked ? "border-blue-300 ring-1 ring-blue-100" : "border-gray-200 hover:shadow-md")}>
                                    
                                    <div className={clsx("p-3 border-b flex justify-between items-center", isBooked ? "bg-blue-50/50 border-blue-100" : "bg-gray-50/50 border-gray-100")}>
                                        <div className="flex items-center gap-2">
                                            <div className="bg-gray-800 text-white text-[10px] font-bold px-1.5 py-0.5">#{index + 1}</div>
                                            <span className="text-xs font-mono text-gray-500">{item.qr_code.split('-').pop()}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button className="text-gray-400 hover:text-primary transition-colors" title="Show QR">
                                                <QrCode size={16} />
                                            </button>
                                            {isBooked ? (
                                                <span className="text-[10px] font-bold px-2 py-0.5 border text-blue-600 bg-blue-100 border-blue-200 flex items-center gap-1">
                                                    <Book size={10}/> BOOK
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold px-2 py-0.5 border text-green-600 bg-green-50 border-green-100">
                                                    AVAILABLE
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2 text-gray-700">
                                                <MapPin size={16} className="text-primary"/>
                                                <span className="text-sm font-medium">{item.current_location || 'Unknown Location'}</span>
                                            </div>

                                            {!isBookingThis && (
                                                <div className="flex gap-2">
                                                    {isBooked ? (
                                                        <button 
                                                            onClick={() => handleRelease(item.id)} 
                                                            disabled={isProcessing} 
                                                            className="px-3 py-1 text-[10px] font-bold border border-gray-400 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                                        >
                                                            {isProcessing ? '...' : 'RELEASE'}
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={() => setBookingItem(item.id)} 
                                                            disabled={item.status === 'NOT_FOR_SALE'} 
                                                            className="px-3 py-1 text-[10px] font-bold border border-blue-600 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                                                        >
                                                            BOOK
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {isBooked && item.booking && !isBookingThis && (
                                            <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded text-xs text-blue-800 animate-in fade-in space-y-1.5">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center gap-1.5">
                                                        <User size={12} className="text-blue-500"/>
                                                        <span>Booked by <span className="font-bold">{item.booking.system_user || 'Unknown'}</span> for <span className="font-bold">{item.booking.booked_by}</span></span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-blue-600">
                                                    <Clock size={12} />
                                                    <span>Expires: <strong>{item.booking.expired_at.split('T')[0]}</strong></span>
                                                </div>
                                                {item.booking.notes && (
                                                    <div className="italic text-blue-500/80 border-l-2 border-blue-200 pl-2 mt-1">
                                                        "{item.booking.notes}"
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {isBookingThis && (
                                            <div className="bg-blue-50 p-3 rounded border border-blue-200 animate-in slide-in-from-right-2 mt-2">
                                                <div className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-2"><Edit2 size={12}/> New Booking</div>
                                                <form onSubmit={handleBookSubmit} className="space-y-2">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <input 
                                                            className="w-full p-1.5 text-xs border rounded focus:border-blue-500 outline-none" 
                                                            placeholder="Client Name"
                                                            required 
                                                            autoFocus
                                                            value={bookForm.client_name}
                                                            onChange={e => setBookForm({...bookForm, client_name: e.target.value})}
                                                        />
                                                        <input 
                                                            className="w-full p-1.5 text-xs border rounded focus:border-blue-500 outline-none" 
                                                            type="date" 
                                                            required 
                                                            value={bookForm.expired_at} 
                                                            onChange={e => setBookForm({...bookForm, expired_at: e.target.value})} 
                                                        />
                                                    </div>
                                                    <input className="w-full p-1.5 text-xs border rounded focus:border-blue-500 outline-none" placeholder="Notes (Optional)" value={bookForm.notes} onChange={e => setBookForm({...bookForm, notes: e.target.value})} />
                                                    <div className="flex justify-end gap-2 mt-2">
                                                        <button type="button" onClick={() => setBookingItem(null)} className="text-xs font-bold text-gray-500 hover:text-gray-700">CANCEL</button>
                                                        <button type="submit" disabled={isProcessing} className="text-xs font-bold bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 flex items-center gap-1">
                                                            {isProcessing && <Loader2 size={12} className="animate-spin"/>} CONFIRM
                                                        </button>
                                                    </div>
                                                </form>
                                            </div>
                                        )}
                                        
                                        {item.history_log && item.history_log.length > 0 && !isBookingThis && (
                                            <div className="mt-2 pt-2 border-t border-gray-100 max-h-32 overflow-y-auto">
                                                {[...item.history_log].reverse().slice(0, 10).map((log, i) => (
                                                    <div key={i} className="flex items-start gap-1 text-[10px] text-gray-400 mb-1 last:mb-0">
                                                        <History size={10} className="mt-0.5 shrink-0"/>
                                                        <span>
                                                            <span className="font-bold text-gray-500">{log.action}</span> 
                                                            <span className="mx-1">•</span> 
                                                            {new Date(log.date).toLocaleDateString()}
                                                            {log.note && <span className="italic ml-1 opacity-75">- {log.note}</span>}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            <div className="p-4 bg-white border-t border-gray-200">
                <button 
                    onClick={() => { 
                        if(activeTab === 'INFO') onEdit(); 
                    }} 
                    className="w-full bg-primary hover:bg-primary-dark text-white py-4 text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-lg"
                >
                    {activeTab === 'INFO' ? <Settings size={18} /> : <Package size={18} />}
                    {activeTab === 'INFO' ? 'Edit Item Details' : 'Manage Stock'}
                </button>
            </div>
        </div>

        {isZoomed && (
            <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center animate-in fade-in duration-200">
                <button onClick={() => setIsZoomed(false)} className="absolute top-4 right-4 bg-white shadow-md hover:bg-gray-50 p-2 rounded-full text-primary transition-all z-20">
                    <X size={32} />
                </button>
                <div className="w-full h-full p-2 sm:p-10 flex items-center justify-center">
                    <StorageImage filename={product.image_url} alt={product.collection} className="w-full h-full object-contain" />
                </div>
            </div>
        )}
    </>
  );
};

export default ProductDetailModal;