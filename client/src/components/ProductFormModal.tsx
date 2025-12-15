import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, Trash2, Upload, CheckCircle, Loader2 } from 'lucide-react';
import type { Product } from '../types';
import { logActivity } from '../audit';
import axios from 'axios';
import { ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  isOpen: boolean;
  mode: 'ADD' | 'EDIT';
  initialData?: Product | null;
  existingProducts?: Product[]; // <--- New Prop for suggestions
  onClose: () => void;
  onSuccess: () => void;
}

const ProductFormModal: React.FC<Props> = ({ isOpen, mode, initialData, existingProducts = [], onClose, onSuccess }) => {
  const [formData, setFormData] = useState<Partial<Product>>({});
  const [loading, setLoading] = useState(false);
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Suggestion Logic ---
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
        if (mode === 'EDIT' && initialData) {
            setFormData({ ...initialData });
            setImagePreview(null); 
            setImageFile(null);
        } else {
            setFormData({ 
                brand: '', category: '', collection: '', 
                code: '', total_stock: 0, retail_price_idr: 0 
            });
            setImagePreview(null);
            setImageFile(null);
        }
    }
  }, [isOpen, mode, initialData]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
        const finalImageFilename = await uploadImageToStorage();

        // Ensure consistency before sending
        const payload = {
            ...formData,
            // Double enforce casing here as well
            brand: formData.brand?.toUpperCase(),
            category: formData.category?.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()), // Title Case
            image_url: finalImageFilename,
            id: formData.id || uuidv4() 
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

        onSuccess(); // App.tsx will handle the refresh logic
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

            <div className="p-6 overflow-y-auto space-y-4">
                
                {/* Brand & Category with DATALIST */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Brand</label>
                        <input 
                            list="brand-suggestions"
                            className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none"
                            placeholder="Select or Type..."
                            value={formData.brand || ''}
                            onChange={e => setFormData({...formData, brand: e.target.value.toUpperCase()})} // Force visual uppercase
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

                {/* Collection */}
                <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Collection Name</label>
                    <input 
                        className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none font-bold"
                        placeholder="e.g. Glenda Candle Holder"
                        value={formData.collection || ''}
                        onChange={e => setFormData({...formData, collection: e.target.value})}
                    />
                </div>

                {/* Code & Price */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Product Code</label>
                        <input 
                            className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none"
                            value={formData.code || ''}
                            onChange={e => setFormData({...formData, code: e.target.value})}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Price (IDR)</label>
                        <input 
                            type="number"
                            className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none"
                            value={formData.retail_price_idr || 0}
                            onChange={e => setFormData({...formData, retail_price_idr: Number(e.target.value)})}
                        />
                    </div>
                </div>

                {/* Dimensions & Finish */}
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
                
                 {/* Image Upload */}
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
                        <div className="text-[10px] text-gray-400 mb-2">This will generate individual QR codes for each item.</div>
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