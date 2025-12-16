import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, Trash2, Upload, CheckCircle, Loader2, Plus, Minus, AlertTriangle, Calendar, Info, DollarSign, Euro } from 'lucide-react';
import type { Product, Discount, DiscountRule, ExchangeRates } from '../types';
import { logActivity } from '../audit';
import axios from 'axios';
import { ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  isOpen: boolean;
  mode: 'ADD' | 'EDIT';
  initialData?: Product | null;
  existingProducts?: Product[];
  currentRates: ExchangeRates | null;
  onClose: () => void;
  onSuccess: () => void;
}

const ProductFormModal: React.FC<Props> = ({ isOpen, mode, initialData, existingProducts = [], currentRates, onClose, onSuccess }) => {
  const [formData, setFormData] = useState<Partial<Product>>({});
  const [loading, setLoading] = useState(false);
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [localDiscounts, setLocalDiscounts] = useState<Discount[]>([]);
  
  const [availableRules, setAvailableRules] = useState<DiscountRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');

  const suggestions = useMemo(() => {
    const brands = new Set<string>();
    const categories = new Set<string>();
    existingProducts.forEach(p => {
        if(p.brand) brands.add(p.brand);
        if(p.category) categories.add(p.category);
    });
    return {
        brands: Array.from(brands).sort(),
        categories: Array.from(categories).sort()
    };
  }, [existingProducts]);

  useEffect(() => {
    if (isOpen) {
        axios.get('http://127.0.0.1:5001/edievo-project/asia-southeast2/get_discounts')
            .then(res => setAvailableRules(res.data.data))
            .catch(err => console.error(err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
        if (mode === 'EDIT' && initialData) {
            setFormData({ ...initialData });
            setLocalDiscounts(initialData.discounts || []);
            setImagePreview(null); 
            setImageFile(null);
        } else {
            setFormData({ 
                brand: '', category: '', collection: '', 
                code: '', manufacturer_code: '', total_stock: 0, 
                retail_price_idr: 0, retail_price_eur: 0, retail_price_usd: 0, 
                currency: 'EUR', 
                detail: '',
                is_not_for_sale: false, is_upcoming: false, upcoming_eta: ''
            });
            setLocalDiscounts([]);
            setImagePreview(null);
            setImageFile(null);
        }
    }
  }, [isOpen, mode, initialData]);

  useEffect(() => {
      if (!currentRates) return;
      
      if (formData.currency === 'EUR') {
          const val = formData.retail_price_eur || 0;
          const calculatedIdr = val * currentRates.eur_rate;
          setFormData(prev => ({ ...prev, retail_price_idr: calculatedIdr }));
      } else if (formData.currency === 'USD') {
          const val = formData.retail_price_usd || 0;
          const calculatedIdr = val * currentRates.usd_rate;
          setFormData(prev => ({ ...prev, retail_price_idr: calculatedIdr }));
      }
  }, [formData.currency, formData.retail_price_eur, formData.retail_price_usd, currentRates]);

  const calculatedNettPrice = useMemo(() => {
    const retail = formData.retail_price_idr || 0;
    if (localDiscounts.length === 0) return retail;

    let current = retail;
    localDiscounts.forEach(d => {
        current = current * ((100 - d.value) / 100);
    });
    return Math.round(current);
  }, [formData.retail_price_idr, localDiscounts]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    }
  };

  const uploadImageToStorage = async (): Promise<string> => {
    if (!imageFile) return formData.image_url || '';
    const fileName = `products/${uuidv4()}-${imageFile.name}`;
    const storageRef = ref(storage, fileName);
    await uploadBytes(storageRef, imageFile);
    return fileName;
  };

  const addDiscountFromRule = () => {
    if (!selectedRuleId) return;
    const rule = availableRules.find(r => r.id === selectedRuleId);
    if (rule) {
        setLocalDiscounts([...localDiscounts, { id: rule.id, name: rule.name, value: rule.value }]);
        setSelectedRuleId(''); 
    }
  };

  const removeDiscount = (index: number) => {
    const newDiscounts = localDiscounts.filter((_, i) => i !== index);
    setLocalDiscounts(newDiscounts);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
        const finalImageFilename = await uploadImageToStorage();

        const payload = {
            ...formData,
            brand: formData.brand?.toUpperCase(),
            category: formData.category?.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()),
            image_url: finalImageFilename,
            id: formData.id || uuidv4(),
            
            discounts: localDiscounts.filter(d => d.value > 0),
            nett_price_idr: calculatedNettPrice,
            is_not_for_sale: formData.is_not_for_sale || false,
            is_upcoming: formData.is_upcoming || false,
            upcoming_eta: formData.upcoming_eta || ''
        };

        await axios.post('http://127.0.0.1:5001/edievo-project/asia-southeast2/manage_product', {
            mode: mode,
            product: payload
        });
        
        await logActivity(
            mode === 'ADD' ? 'ITEM_ADDED' : 'ITEM_EDITED', 
            `${payload.brand} - ${payload.collection}`,
            'admin', 
            payload
        );

        onSuccess();
        onClose();
    } catch (err) {
        console.error("Failed to save product:", err);
        alert("Error saving product. Check console.");
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure? This will delete the product AND all inventory history.")) return;
    
    setLoading(true);
    try {
        if (!formData.id) return;

        await axios.delete('http://127.0.0.1:5001/edievo-project/asia-southeast2/delete_product', {
            data: { product_id: formData.id }
        });

        await logActivity('ITEM_DELETED', `${formData.brand} - ${formData.collection}`, 'admin');
        
        onSuccess();
        onClose();
    } catch (err) {
        console.error(err);
        alert("Error deleting product.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        
        <div className="bg-white w-full max-w-lg shadow-2xl z-10 flex flex-col max-h-[90vh]">
            <div className="p-4 bg-primary text-white flex justify-between items-center shrink-0">
                <h2 className="text-lg font-bold tracking-wide">
                    {mode === 'ADD' ? 'ADD NEW ITEM' : 'EDIT ITEM'}
                </h2>
                <button onClick={onClose}><X size={20}/></button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
                
                {/* 1. STATUS & FLAGS */}
                <div className="bg-gray-50 p-4 border border-gray-200 space-y-4 rounded-sm">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Status & Visibility</div>
                    
                    <div className="flex gap-4">
                        <label className={`flex-1 flex items-center justify-center gap-2 p-3 border cursor-pointer transition-all ${formData.is_not_for_sale ? 'bg-primary text-white border-primary' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'}`}>
                            <input 
                                type="checkbox" 
                                className="hidden"
                                checked={formData.is_not_for_sale || false}
                                onChange={e => setFormData({...formData, is_not_for_sale: e.target.checked})}
                            />
                            <AlertTriangle size={16} />
                            <span className="text-xs font-bold uppercase">Not For Sale</span>
                        </label>

                        <label className={`flex-1 flex items-center justify-center gap-2 p-3 border cursor-pointer transition-all ${formData.is_upcoming ? 'bg-primary text-white border-primary' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'}`}>
                            <input 
                                type="checkbox" 
                                className="hidden"
                                checked={formData.is_upcoming || false}
                                onChange={e => setFormData({...formData, is_upcoming: e.target.checked})}
                            />
                            <Calendar size={16} />
                            <span className="text-xs font-bold uppercase">Upcoming</span>
                        </label>
                    </div>

                    {formData.is_upcoming && (
                        <div className="animate-in slide-in-from-top-2 duration-200">
                            {/* [MODIFIED] Replaced Blue with Primary */}
                            <label className="text-xs font-bold text-primary uppercase mb-1 block">Expected Arrival Date</label>
                            <input 
                                type="date"
                                className="w-full border border-primary/20 bg-primary/5 p-2 text-sm focus:border-primary outline-none"
                                value={formData.upcoming_eta || ''}
                                onChange={e => setFormData({...formData, upcoming_eta: e.target.value})}
                            />
                        </div>
                    )}
                </div>

                {/* 2. BASIC INFO */}
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase">Brand</label>
                            <input 
                                list="brand-suggestions"
                                className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none"
                                placeholder="Select or Type..."
                                value={formData.brand || ''}
                                onChange={e => setFormData({...formData, brand: e.target.value.toUpperCase()})}
                            />
                            <datalist id="brand-suggestions">
                                {suggestions.brands.map(b => <option key={b} value={b} />)}
                            </datalist>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase">Category</label>
                            <input 
                                list="category-suggestions"
                                className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none"
                                placeholder="Select or Type..."
                                value={formData.category || ''}
                                onChange={e => setFormData({...formData, category: e.target.value})}
                            />
                            <datalist id="category-suggestions">
                                {suggestions.categories.map(c => <option key={c} value={c} />)}
                            </datalist>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Collection Name</label>
                        <input 
                            className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none font-bold"
                            placeholder="" 
                            value={formData.collection || ''}
                            onChange={e => setFormData({...formData, collection: e.target.value})}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                             Manufacturer Product ID
                        </label>
                        <input 
                            className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none font-mono text-gray-600"
                            placeholder=""
                            value={formData.manufacturer_code || ''}
                            onChange={e => setFormData({...formData, manufacturer_code: e.target.value})}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Product Detail / Description</label>
                        <textarea 
                            className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none min-h-[80px]"
                            value={formData.detail || ''}
                            onChange={e => setFormData({...formData, detail: e.target.value})}
                        />
                    </div>
                </div>

                {/* 3. PRICING ENGINE */}
                <div className="bg-primary/5 p-4 border border-primary/20 space-y-4 rounded-sm">
                    <div className="flex justify-between items-center">
                        <div className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">Pricing & Discounts</div>
                        
                        <div className="flex bg-white rounded border border-gray-300 overflow-hidden">
                            {(['EUR', 'USD', 'IDR'] as const).map(curr => (
                                <button 
                                    key={curr}
                                    type="button"
                                    onClick={() => setFormData({...formData, currency: curr})}
                                    className={`px-3 py-1 text-[10px] font-bold transition-colors ${formData.currency === curr ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                                >
                                    {curr}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                             {formData.currency === 'EUR' ? (
                                <>
                                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center h-5 gap-1">
                                        <Euro size={12}/> Retail (EUR)
                                    </label>
                                    <input 
                                        type="number" 
                                        className="w-full border border-primary/30 bg-white p-2 text-sm font-bold text-primary outline-none focus:border-primary" 
                                        value={formData.retail_price_eur || 0} 
                                        onChange={e => setFormData({...formData, retail_price_eur: Number(e.target.value)})} 
                                    />
                                </>
                             ) : formData.currency === 'USD' ? (
                                <>
                                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center h-5 gap-1">
                                        <DollarSign size={12}/> Retail (USD)
                                    </label>
                                    <input 
                                        type="number" 
                                        className="w-full border border-primary/30 bg-white p-2 text-sm font-bold text-primary outline-none focus:border-primary" 
                                        value={formData.retail_price_usd || 0} 
                                        onChange={e => setFormData({...formData, retail_price_usd: Number(e.target.value)})} 
                                    />
                                </>
                             ) : (
                                <>
                                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center h-5 gap-1">Retail (EUR/USD)</label>
                                    <input 
                                        className="w-full border border-gray-200 bg-gray-100 p-2 text-sm text-gray-400 outline-none cursor-not-allowed" 
                                        value="-" 
                                        readOnly 
                                    />
                                </>
                             )}
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase flex items-center h-5">Retail Price (IDR)</label>
                            <input 
                                type="number"
                                className={`w-full border p-2 text-sm font-bold outline-none ${formData.currency === 'IDR' ? 'bg-white border-primary/30 text-primary focus:border-primary' : 'bg-gray-100 border-gray-200 text-gray-600 cursor-not-allowed'}`}
                                value={Math.round(formData.retail_price_idr || 0)}
                                readOnly={formData.currency !== 'IDR'}
                                onChange={e => setFormData({...formData, retail_price_idr: Number(e.target.value)})}
                            />
                        </div>
                    </div>

                    <div className="space-y-1 pt-2 border-t border-primary/10">
                         <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1 h-5">
                             System SKU 
                             <div title="SKU is handled by the system. (BRAND-CATEGORY-NAME-SEQUENCE)" className="cursor-help text-gray-400 hover:text-primary transition-colors">
                                 <Info size={12}/> 
                             </div>
                         </label>
                         <input 
                            className="w-full border border-gray-200 bg-gray-100 p-2 text-sm text-gray-500 focus:outline-none cursor-not-allowed font-mono" 
                            value={formData.code || 'Auto-generated'} 
                            readOnly 
                        />
                    </div>

                    {/* Discount List */}
                    <div className="space-y-2">
                         <div className="flex justify-between items-end gap-2">
                            <div className="flex-grow space-y-1">
                                <label className="text-xs font-bold text-gray-400 uppercase">Add Discount Rule</label>
                                <select 
                                    className="w-full border border-gray-300 p-2 text-xs focus:border-primary outline-none bg-white"
                                    value={selectedRuleId}
                                    onChange={e => setSelectedRuleId(e.target.value)}
                                >
                                    <option value="">-- Select a Discount --</option>
                                    {availableRules
                                        .filter(r => {
                                            const now = new Date().toISOString().split('T')[0];
                                            const activeStart = !r.start_date || r.start_date <= now;
                                            const activeEnd = !r.end_date || r.end_date >= now;
                                            return activeStart && activeEnd;
                                        })
                                        .map(r => (
                                            <option key={r.id} value={r.id}>
                                                {r.name} ({r.value}%)
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>
                            <button 
                                onClick={addDiscountFromRule} 
                                type="button" 
                                disabled={!selectedRuleId}
                                className="bg-white border border-gray-300 hover:bg-gray-100 px-3 py-2 flex items-center justify-center gap-1 font-bold text-gray-600 transition-colors disabled:opacity-50 h-[34px]"
                            >
                                <Plus size={14} /> ADD
                            </button>
                         </div>
                         
                         {localDiscounts.length > 0 && (
                            <div className="bg-white border border-primary/20 p-2 space-y-2 mt-2">
                                {localDiscounts.map((d, index) => (
                                    <div key={index} className="flex justify-between items-center text-xs text-gray-700">
                                        <span>{d.name} <span className="font-bold">({d.value}%)</span></span>
                                        <button type="button" onClick={() => removeDiscount(index)} className="text-gray-400 hover:text-primary">
                                            <Minus size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                         )}
                    </div>

                    {/* Nett Price Calculation Display */}
                    <div className="pt-2 border-t border-primary/20 flex justify-between items-center">
                        <span className="text-xs font-bold text-primary uppercase">Nett Price (After Discount)</span>
                        <span className="text-lg font-bold text-primary">
                             {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(calculatedNettPrice)}
                        </span>
                    </div>
                </div>

                {/* 4. SPECS & IMAGE */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Dimensions</label>
                        <input 
                            className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none"
                            value={formData.dimensions || ''}
                            onChange={e => setFormData({...formData, dimensions: e.target.value})}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Finishing</label>
                        <input 
                            className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none"
                            value={formData.finishing || ''}
                            onChange={e => setFormData({...formData, finishing: e.target.value})}
                        />
                    </div>
                </div>
                
                 <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Product Image</label>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*"
                        onChange={handleFileSelect}
                    />
                    
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 p-6 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 cursor-pointer transition-colors relative overflow-hidden"
                    >
                        {imagePreview ? (
                            <img src={imagePreview} alt="Preview" className="h-32 object-contain" />
                        ) : formData.image_url ? (
                             <div className="flex flex-col items-center">
                                <CheckCircle className="text-green-500 mb-2" />
                                <span className="text-xs text-gray-600">Current Image: {formData.image_url}</span>
                                <span className="text-[10px] text-primary mt-2">Click to Change</span>
                             </div>
                        ) : (
                            <>
                                <Upload size={24} className="mb-2"/>
                                <span className="text-xs">Click to upload image</span>
                            </>
                        )}
                    </div>
                </div>

                {mode === 'ADD' && (
                    <div className="bg-gray-50 p-4 border border-gray-200">
                        <label className="text-xs font-bold text-gray-500 uppercase">Initial Stock Quantity</label>
                        <input 
                            type="number"
                            className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none font-bold"
                            value={formData.total_stock || 0}
                            onChange={e => setFormData({...formData, total_stock: Number(e.target.value)})}
                        />
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-gray-200 flex gap-3 bg-gray-50">
                {mode === 'EDIT' && (
                    <button 
                        onClick={handleDelete}
                        className="px-4 py-3 bg-white border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 transition-colors flex items-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" size={16}/> : <Trash2 size={16} />} 
                        DELETE
                    </button>
                )}
                <button 
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex-grow bg-primary hover:bg-primary-dark text-white font-bold text-sm py-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                    {loading ? (
                        <><Loader2 className="animate-spin" size={16}/> SAVING...</>
                    ) : (
                        <><Save size={16} /> {mode === 'ADD' ? 'CREATE ITEM' : 'SAVE CHANGES'}</>
                    )}
                </button>
            </div>
        </div>
    </div>
  );
};

export default ProductFormModal;