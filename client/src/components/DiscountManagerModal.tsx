import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Percent, Calendar, Loader2 } from 'lucide-react';
import axios, { AxiosError } from 'axios'; 
import type { DiscountRule } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void; 
}

const DiscountManagerModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [discounts, setDiscounts] = useState<DiscountRule[]>([]);
  const [loading, setLoading] = useState(false);
  // [MODIFIED] Changed from boolean to string | null to track specific ID being processed
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<DiscountRule>>({});

  useEffect(() => {
    if (isOpen) {
        fetchDiscounts();
        setEditingId(null);
        setFormData({});
    }
  }, [isOpen]);

  const fetchDiscounts = async () => {
    setLoading(true);
    try {
        const res = await axios.get('http://127.0.0.1:5001/edievo-project/asia-southeast2/get_discounts');
        setDiscounts(res.data.data);
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  const handleEdit = (discount?: DiscountRule) => {
    if (discount) {
        setEditingId(discount.id);
        setFormData(discount);
    } else {
        setEditingId('NEW');
        setFormData({ name: '', value: 0, is_active: true });
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.value) return;
    
    setActionLoading('SAVE');
    try {
        await axios.post('http://127.0.0.1:5001/edievo-project/asia-southeast2/manage_discount', {
            mode: 'EDIT', 
            discount: formData
        });
        await fetchDiscounts();
        onSuccess(); 
        setEditingId(null);
    } catch (err) {
        console.error(err);
        let msg = "Failed to save discount";
        if (err instanceof AxiosError && err.response?.data) {
             msg = err.response.data; 
        }
        alert(msg);
    } finally {
        setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this discount rule?")) return;
    setActionLoading(id);
    try {
        await axios.post('http://127.0.0.1:5001/edievo-project/asia-southeast2/manage_discount', {
            mode: 'DELETE',
            discount: { id }
        });
        await fetchDiscounts();
        onSuccess(); 
    } catch (err) {
        console.error(err);
        alert("Failed to delete");
    } finally {
        setActionLoading(null);
    }
  };

  const getRuleStatus = (rule: DiscountRule) => {
      const now = new Date().toISOString().split('T')[0];
      if (rule.start_date && rule.start_date > now) return { label: 'NOT STARTED', color: 'bg-gray-100 text-gray-500' };
      if (rule.end_date && rule.end_date < now) return { label: 'EXPIRED', color: 'bg-primary/10 text-primary' };
      return { label: 'ACTIVE', color: 'bg-primary text-white' };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="bg-white w-full max-w-lg shadow-2xl z-10 flex flex-col max-h-[85vh] rounded-none">
        <div className="p-4 bg-primary text-white flex justify-between items-center shrink-0">
            <h2 className="text-lg font-bold tracking-wide flex items-center gap-2">
                <Percent size={20}/> MANAGE DISCOUNTS
            </h2>
            <button onClick={onClose}><X size={20}/></button>
        </div>

        <div className="p-4 overflow-y-auto flex-grow bg-gray-50 space-y-3">
             {!editingId && (
                <button 
                    onClick={() => handleEdit()}
                    disabled={!!actionLoading}
                    className="w-full py-3 border-2 border-dashed border-gray-300 text-gray-400 font-bold hover:bg-white hover:text-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    <Plus size={16} /> ADD NEW DISCOUNT RULE
                </button>
             )}

             {editingId && (
                 <div className="bg-white p-4 border border-primary shadow-md animate-in fade-in slide-in-from-top-2">
                     <div className="text-xs font-bold text-primary mb-3 uppercase tracking-wider">
                         {editingId === 'NEW' ? 'New Rule' : 'Edit Rule'}
                     </div>
                     <div className="grid grid-cols-3 gap-3 mb-3">
                         <div className="col-span-2 space-y-1">
                             <label className="text-[10px] text-gray-400 font-bold uppercase">Name</label>
                             <input 
                                className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none"
                                placeholder="e.g. Year End Sale"
                                value={formData.name || ''}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                             />
                         </div>
                         <div className="space-y-1">
                             <label className="text-[10px] text-gray-400 font-bold uppercase">Value (%)</label>
                             <input 
                                type="number"
                                className="w-full border border-gray-300 p-2 text-sm focus:border-primary outline-none text-right font-bold"
                                placeholder="0"
                                value={formData.value || ''}
                                onChange={e => setFormData({...formData, value: Number(e.target.value)})}
                             />
                         </div>
                     </div>
                     <div className="grid grid-cols-2 gap-3 mb-4">
                         <div className="space-y-1">
                             <label className="text-[10px] text-gray-400 font-bold uppercase">Start Date (Optional)</label>
                             <input 
                                type="date"
                                className="w-full border border-gray-300 p-2 text-xs focus:border-primary outline-none"
                                value={formData.start_date || ''}
                                onChange={e => setFormData({...formData, start_date: e.target.value})}
                             />
                         </div>
                         <div className="space-y-1">
                             <label className="text-[10px] text-gray-400 font-bold uppercase">End Date (Optional)</label>
                             <input 
                                type="date"
                                className="w-full border border-gray-300 p-2 text-xs focus:border-primary outline-none"
                                value={formData.end_date || ''}
                                onChange={e => setFormData({...formData, end_date: e.target.value})}
                             />
                         </div>
                     </div>
                     <div className="flex gap-2">
                         <button 
                            onClick={handleSave} 
                            disabled={!!actionLoading}
                            className="flex-1 bg-primary text-white text-xs font-bold py-2 hover:bg-primary-dark disabled:opacity-50 flex justify-center items-center gap-2"
                         >
                            {actionLoading === 'SAVE' && <Loader2 size={12} className="animate-spin" />}
                            SAVE
                         </button>
                         <button onClick={() => setEditingId(null)} className="flex-1 bg-gray-100 text-gray-600 text-xs font-bold py-2 hover:bg-gray-200">CANCEL</button>
                     </div>
                 </div>
             )}

             {discounts.map(d => {
                 const status = getRuleStatus(d);
                 const isDeleting = actionLoading === d.id;
                 return (
                    <div key={d.id} className={`bg-white border p-3 flex justify-between items-center ${!d.is_active ? 'opacity-50' : ''}`}>
                        <div>
                            <div className="flex items-center gap-2">
                                <div className="font-bold text-gray-800">{d.name}</div>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${status.color}`}>{status.label}</span>
                            </div>
                            <div className="text-[10px] text-gray-500 flex items-center gap-2 mt-1">
                                <span className="font-mono bg-gray-100 px-1 rounded font-bold">{d.value}%</span>
                                {d.start_date && d.end_date ? (
                                    <span className="flex items-center gap-1"><Calendar size={10}/> {d.start_date} - {d.end_date}</span>
                                ) : (
                                    <span className="text-gray-300 italic">No period limits</span>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleEdit(d)} disabled={!!actionLoading} className="p-1.5 hover:bg-gray-100 text-gray-600 rounded disabled:opacity-50"><Edit2 size={16} /></button>
                            <button 
                                onClick={() => handleDelete(d.id)} 
                                disabled={!!actionLoading} 
                                className="p-1.5 hover:bg-primary/10 text-primary rounded disabled:opacity-50 w-8 flex justify-center"
                            >
                                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>
                        </div>
                    </div>
                 );
             })}

             {discounts.length === 0 && !loading && !editingId && (
                 <div className="text-center py-8 text-gray-400 text-sm">No discount rules found.</div>
             )}
        </div>
      </div>
    </div>
  );
};

export default DiscountManagerModal;