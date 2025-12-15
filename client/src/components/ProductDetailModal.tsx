import React, { useEffect, useState } from 'react';
import { X, MapPin, QrCode, History, Package, ZoomIn, Settings } from 'lucide-react';
import axios from 'axios';
import type { Product, InventoryItem } from '../types';
import StorageImage from './StorageImage';

interface Props {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
}

const ProductDetailModal: React.FC<Props> = ({ product, isOpen, onClose, onEdit }) => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'INFO' | 'STOCK'>('INFO');
  
  const [isZoomed, setIsZoomed] = useState(false);

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
      setActiveTab('INFO');
      setIsZoomed(false); 
      fetchInventory();
    } else {
        setInventory([]);
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  return (
    <>
        {/* --- MAIN MODAL --- */}
        <div className="fixed inset-0 z-40 bg-white flex flex-col animate-in slide-in-from-bottom-5 duration-300">
            
            {/* Header Image Area */}
            <div className="h-64 bg-gray-100 relative shrink-0 shadow-sm group">
            {/* Close Button */}
            <button 
                onClick={onClose}
                className="absolute top-4 right-4 bg-white shadow-md hover:bg-gray-50 p-2 rounded-full text-primary transition-all z-20"
            >
                <X size={24} />
            </button>

            {/* Clickable Image Container */}
            <div 
                className="w-full h-full relative cursor-zoom-in"
                onClick={() => setIsZoomed(true)}
            >
                <StorageImage 
                    filename={product.image_url} 
                    alt={product.collection} 
                    className="w-full h-full object-contain p-4 transition-transform duration-300 group-hover:scale-105" 
                />
                
                {/* Zoom Hint Overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
                    <div className="bg-white/80 backdrop-blur-sm p-3 rounded-full shadow-lg">
                        <ZoomIn size={24} className="text-primary" />
                    </div>
                </div>
            </div>
            
            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-4 pt-10 text-white pointer-events-none">
                <div className="text-xs font-bold text-primary-light uppercase tracking-wider mb-1">{product.brand}</div>
                <h2 className="text-2xl font-bold leading-tight">{product.collection}</h2>
                <div className="text-xs text-white/70 mt-1">{product.code}</div>
            </div>
            </div>

            {/* Tabs */}
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
                    className={`flex-1 py-4 text-xs font-bold tracking-widest uppercase transition-colors
                        ${activeTab === 'STOCK' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-gray-400 hover:text-gray-600'}
                    `}
                >
                    Stock List ({product.total_stock})
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-grow overflow-y-auto bg-gray-50 p-4">
                
                {activeTab === 'INFO' && (
                    <div className="bg-white border border-gray-200 p-6 space-y-6 shadow-sm">
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
                            <div className="col-span-2 pt-4 border-t border-gray-100">
                                <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Retail Price (IDR)</div>
                                <div className="text-xl font-bold text-primary">
                                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(product.retail_price_idr)}
                                </div>
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
                        ) : (
                            inventory.map((item, index) => (
                                <div key={item.id} className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                        <div className="flex items-center gap-2">
                                            <div className="bg-gray-800 text-white text-[10px] font-bold px-1.5 py-0.5">#{index + 1}</div>
                                            <span className="text-xs font-mono text-gray-500">{item.qr_code.split('-').pop()}</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 border border-green-100">
                                            {item.status || 'AVAILABLE'}
                                        </span>
                                    </div>
                                    <div className="p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-gray-700">
                                            <MapPin size={16} className="text-primary"/>
                                            <span className="text-sm font-medium">{item.current_location || 'Unknown Location'}</span>
                                        </div>
                                        <button className="text-gray-400 hover:text-primary transition-colors p-2">
                                            <QrCode size={18} />
                                        </button>
                                    </div>
                                    
                                    {item.history_log && item.history_log.length > 0 && (
                                        <div className="px-3 pb-3 pt-0">
                                            <div className="text-[10px] text-gray-400 flex items-center gap-1 bg-gray-50 p-1.5 border border-gray-100">
                                                <History size={10} />
                                                Last: {item.history_log[item.history_log.length - 1].action} 
                                                at {new Date(item.history_log[item.history_log.length - 1].date).toLocaleDateString()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Action Footer */}
            <div className="p-4 bg-white border-t border-gray-200">
                {activeTab === 'INFO' ? (
                    <button 
                        onClick={() => { onClose(); onEdit(); }} 
                        className="w-full bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 py-4 text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        <Settings size={18} />
                        Edit Item Details
                    </button>
                ) : (
                    <button className="w-full bg-primary hover:bg-primary-dark text-white py-4 text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-lg">
                        <Package size={18} />
                        Manage Stock
                    </button>
                )}
            </div>
        </div>

        {/* --- ZOOM LIGHTBOX OVERLAY --- */}
        {isZoomed && (
            <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center animate-in fade-in duration-200">
                <button 
                    onClick={() => setIsZoomed(false)}
                    className="absolute top-4 right-4 bg-white shadow-md hover:bg-gray-50 p-2 rounded-full text-primary transition-all z-20"
                >
                    <X size={32} />
                </button>
                
                <div className="w-full h-full p-2 sm:p-10 flex items-center justify-center">
                    <StorageImage 
                        filename={product.image_url} 
                        alt={product.collection} 
                        className="w-full h-full object-contain" 
                    />
                </div>
            </div>
        )}
    </>
  );
};

export default ProductDetailModal;