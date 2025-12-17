import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, DollarSign, Euro, RefreshCw } from 'lucide-react';
import axios from 'axios';
import type { ExchangeRates } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentRates: ExchangeRates | null;
  onSuccess: () => void;
}

const ExchangeRateModal: React.FC<Props> = ({ isOpen, onClose, currentRates, onSuccess }) => {
  const [rates, setRates] = useState({ eur_rate: 0, usd_rate: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && currentRates) {
        setRates({ eur_rate: currentRates.eur_rate, usd_rate: currentRates.usd_rate });
    }
  }, [isOpen, currentRates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
        await axios.post('http://127.0.0.1:5001/edievo-project/asia-southeast2/update_exchange_rates', rates);
        onSuccess();
        onClose();
    } catch (err) {
        console.error(err);
        alert("Failed to update rates");
    } finally {
        setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="bg-white w-full max-w-sm shadow-xl z-10 flex flex-col rounded-none">
        <div className="p-4 bg-primary text-white flex justify-between items-center shrink-0">
            <h2 className="text-lg font-bold tracking-wide flex items-center gap-2">
                <RefreshCw size={20}/> MANAGE RATES
            </h2>
            <button onClick={onClose}><X size={20}/></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="space-y-4">
                <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                        <Euro size={12}/> 1 EUR to IDR
                    </label>
                    <input 
                        type="number"
                        className="w-full border border-gray-300 p-2 text-sm font-bold text-gray-800 outline-none focus:border-primary"
                        value={rates.eur_rate}
                        onChange={e => setRates({...rates, eur_rate: Number(e.target.value)})}
                    />
                </div>
                
                <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                        <DollarSign size={12}/> 1 USD to IDR
                    </label>
                    <input 
                        type="number"
                        className="w-full border border-gray-300 p-2 text-sm font-bold text-gray-800 outline-none focus:border-primary"
                        value={rates.usd_rate}
                        onChange={e => setRates({...rates, usd_rate: Number(e.target.value)})}
                    />
                </div>
            </div>

            <button 
                type="submit"
                disabled={loading}
                className="w-full bg-primary hover:bg-primary-dark text-white font-bold text-sm py-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
                {loading ? <Loader2 className="animate-spin" size={16}/> : <Save size={16} />} 
                UPDATE RATES
            </button>
        </form>
      </div>
    </div>
  );
};

export default ExchangeRateModal;