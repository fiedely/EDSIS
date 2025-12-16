import React, { useState, useRef, useEffect, useCallback } from 'react';
import Papa from 'papaparse';
import axios from 'axios';
import { X, Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import type { Product } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingProducts: Product[];
}

interface CSVRow {
  brand?: string;
  category?: string;
  collection?: string;
  code?: string;
  image?: string;
  status?: string;
  eta?: string;
  arriving_eta?: string;
  discount?: string;
  'retail price'?: string;
  retail_price_idr?: string;
  'retail price in euro'?: string; 
  retail_price_eur?: string;
  'retail price in usd'?: string;
  retail_price_usd?: string;
  'nett price'?: string;
  nett_price_idr?: string;
  quantity?: string;
  qty?: string;
  detail?: string;
  description?: string;
  size?: string;
  dimensions?: string;
  finishing?: string;
  location?: string;
  [key: string]: string | undefined;
}

const ImportModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, existingProducts }) => {
  const [step, setStep] = useState<'UPLOAD' | 'CONFIRM' | 'PROCESSING' | 'SUCCESS'>('UPLOAD');
  const [stats, setStats] = useState({ totalRows: 0, brands: 0, categories: 0, duplicates: 0 });
  const [parsedData, setParsedData] = useState<CSVRow[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('UPLOAD');
    setParsedData([]);
    setLogs([]);
    setStats({ totalRows: 0, brands: 0, categories: 0, duplicates: 0 });
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
        reset();
    }
  }, [isOpen, reset]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      parseCSV(selectedFile);
    }
  };

  const parseCSV = (file: File) => {
    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        processPreview(rows);
      },
      error: (error: Error) => {
        console.error(error);
        alert("Error parsing CSV");
      }
    });
  };

  const processPreview = (rows: CSVRow[]) => {
    const existingSet = new Set(existingProducts.map(p => `${p.brand?.trim().toUpperCase()}-${p.collection?.trim().toUpperCase()}`));
    
    const newRows: CSVRow[] = [];
    let duplicateCount = 0;

    rows.forEach(row => {
        const brand = row.brand || '';
        const collection = row.collection || '';
        if (!brand && !collection) return;

        const key = `${brand.trim().toUpperCase()}-${collection.trim().toUpperCase()}`;
        if (existingSet.has(key)) {
            duplicateCount++;
        } else {
            newRows.push(row);
        }
    });

    const uniqueBrands = new Set(newRows.map(r => r.brand).filter(Boolean));
    const uniqueCats = new Set(newRows.map(r => r.category).filter(Boolean));
    
    setStats({
      totalRows: newRows.length,
      duplicates: duplicateCount,
      brands: uniqueBrands.size,
      categories: uniqueCats.size
    });

    setParsedData(newRows);
    setStep('CONFIRM');
  };

  const cleanPrice = (priceStr: string | number | undefined): number => {
    if (!priceStr) return 0;
    const clean = String(priceStr).replace(/[^0-9]/g, '');
    return parseInt(clean, 10) || 0;
  };

  const parseDiscounts = (discountStr: string | undefined) => {
    if (!discountStr) return [];
    const parts = String(discountStr).replace(/%/g, '').split('+');
    return parts.map(val => ({
        name: `${val.trim()}%`,
        value: parseFloat(val.trim())
    })).filter(d => !isNaN(d.value) && d.value > 0);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return; 

    setStep('PROCESSING');
    setLogs(prev => [...prev, "Preparing data payload..."]);

    try {
      const productsPayload = parsedData.map(row => {
        const rawStatus = String(row.status || '').toUpperCase();
        
        const isNotForSale = rawStatus.includes('NOT FOR SALE') || rawStatus.includes('NFS');
        const isUpcoming = rawStatus.includes('UPCOMING');
        const etaDate = row.eta || row.arriving_eta || '';

        const discounts = parseDiscounts(row.discount);
        
        const retailPriceIDR = cleanPrice(row['retail price'] || row.retail_price_idr);
        const retailPriceEUR = cleanPrice(row['retail price in euro'] || row.retail_price_eur);
        const retailPriceUSD = cleanPrice(row['retail price in usd'] || row.retail_price_usd);
        
        let nettPrice = cleanPrice(row['nett price'] || row.nett_price_idr);
        
        if (nettPrice === 0 && discounts.length > 0 && retailPriceIDR > 0) {
             let currentPrice = retailPriceIDR;
             discounts.forEach(d => {
                 currentPrice = currentPrice * ((100 - d.value) / 100);
             });
             nettPrice = Math.round(currentPrice);
        }

        return {
          brand: row.brand,
          category: row.category,
          collection: row.collection,
          code: row.code, // Manufacturer ID
          image_url: row.image ? `products/${row.image}` : '',
          total_stock: parseInt(row.quantity || row.qty || '0', 10),
          
          retail_price_idr: retailPriceIDR,
          retail_price_eur: retailPriceEUR,
          retail_price_usd: retailPriceUSD,
          
          nett_price_idr: nettPrice,
          discounts: discounts,
          detail: row.detail || row.description || '',
          dimensions: row.size || row.dimensions || '',
          finishing: row.finishing || '',
          
          is_not_for_sale: isNotForSale,
          is_upcoming: isUpcoming,
          upcoming_eta: etaDate,
          
          location: row.location || 'Warehouse (Import)'
        };
      });

      setLogs(prev => [...prev, `Sending ${productsPayload.length} unique items to backend...`]);

      const res = await axios.post('http://127.0.0.1:5001/edievo-project/asia-southeast2/bulk_import_products', {
        products: productsPayload
      });

      if (res.data.success) {
        setStep('SUCCESS');
      }

    } catch (err) {
        console.error(err);
        let msg = "Unknown error";
        if (err instanceof Error) msg = err.message;
        setLogs(prev => [...prev, `ERROR: ${msg}`]);
        alert("Import failed. Check logs.");
        setStep('CONFIRM');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if(step !== 'PROCESSING') onClose(); }} />
      
      <div className="bg-white w-full max-w-lg shadow-2xl z-10 flex flex-col max-h-[90vh] rounded-none">
        
        <div className="p-4 bg-primary text-white flex justify-between items-center shrink-0">
            <h2 className="text-lg font-bold tracking-wide flex items-center gap-2">
                <FileSpreadsheet size={20}/> IMPORT INVENTORY
            </h2>
            {step !== 'PROCESSING' && <button onClick={onClose}><X size={20}/></button>}
        </div>

        <div className="p-8 flex-grow overflow-y-auto">
            {step === 'UPLOAD' && (
                <div className="flex flex-col items-center justify-center space-y-6">
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 p-10 flex flex-col items-center justify-center cursor-pointer transition-colors group"
                    >
                        <div className="bg-white p-4 rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                            <Upload size={32} className="text-primary"/>
                        </div>
                        <span className="text-sm font-bold text-gray-700">Click to Select CSV File</span>
                        <span className="text-xs text-gray-400 mt-1">Supports ED-Stock Master Template</span>
                    </div>
                    <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                </div>
            )}

            {step === 'CONFIRM' && (
                <div className="space-y-6">
                    {/* [MODIFIED] Neutral Gray Success Style */}
                    <div className="bg-gray-50 border border-gray-200 p-4 rounded flex items-start gap-3">
                        <CheckCircle size={20} className="text-gray-600 mt-0.5" />
                        <div>
                            <div className="text-sm font-bold text-gray-800">File Analysis Complete</div>
                            <div className="text-xs text-gray-600 mt-1">
                                Found <span className="font-bold">{stats.totalRows} new items</span>.
                            </div>
                        </div>
                    </div>

                    {stats.duplicates > 0 && (
                         <div className="bg-primary/5 border border-primary/20 p-3 flex items-start gap-2">
                            <AlertTriangle size={16} className="text-primary mt-0.5" />
                            <div className="text-xs text-primary">
                                <strong>{stats.duplicates} Duplicate Items Ignored.</strong><br/>
                                Items with matching "Brand + Collection Name" will be skipped.
                            </div>
                         </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-3 border border-gray-200 text-center">
                            <div className="text-xs text-gray-400 uppercase tracking-wider">New Brands</div>
                            <div className="text-xl font-bold text-gray-800">{stats.brands}</div>
                        </div>
                        <div className="bg-gray-50 p-3 border border-gray-200 text-center">
                            <div className="text-xs text-gray-400 uppercase tracking-wider">New Categories</div>
                            <div className="text-xl font-bold text-gray-800">{stats.categories}</div>
                        </div>
                    </div>

                    <button 
                        onClick={handleImport}
                        disabled={stats.totalRows === 0}
                        className={`w-full py-4 font-bold uppercase tracking-widest shadow-lg transition-colors
                            ${stats.totalRows === 0 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary hover:bg-primary-dark text-white'}
                        `}
                    >
                        {stats.totalRows === 0 ? 'No New Items Found' : `Confirm Import (${stats.totalRows})`}
                    </button>
                    
                    <button onClick={reset} className="w-full py-2 text-xs font-bold text-gray-400 hover:text-gray-600">
                        Cancel & Select Different File
                    </button>
                </div>
            )}

            {step === 'PROCESSING' && (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                    <Loader2 size={48} className="text-primary animate-spin" />
                    <div className="text-sm font-bold text-gray-700 animate-pulse">Importing Data...</div>
                    <div className="w-full bg-gray-900 text-green-400 font-mono text-[10px] p-4 h-32 overflow-y-auto">
                        {logs.map((log, i) => <div key={i}>{log}</div>)}
                    </div>
                </div>
            )}

            {step === 'SUCCESS' && (
                <div className="flex flex-col items-center justify-center py-10 space-y-6">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-gray-600">
                        <CheckCircle size={40} />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-gray-800">Import Successful!</h3>
                        <p className="text-sm text-gray-500 mt-2">Your inventory has been updated.</p>
                    </div>
                    <button 
                        onClick={() => { onSuccess(); onClose(); }}
                        className="w-full py-3 bg-gray-800 hover:bg-gray-900 text-white font-bold uppercase tracking-widest transition-colors"
                    >
                        Close & Refresh
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ImportModal;