import React, { useState, useRef, useEffect, useCallback } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { X, Upload, FileSpreadsheet, CheckCircle, Loader2 } from 'lucide-react';
import type { Product } from '../types';

// Use 'unknown' to satisfy linter
interface ImportRow {
  [key: string]: unknown;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingProducts: Product[];
}

const ImportModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, existingProducts }) => {
  const [step, setStep] = useState<'UPLOAD' | 'CONFIRM' | 'PROCESSING' | 'SUCCESS'>('UPLOAD');
  const [stats, setStats] = useState({ totalRows: 0, newItems: 0, brands: 0, categories: 0, duplicates: 0, updates: 0 });
  const [parsedData, setParsedData] = useState<ImportRow[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('UPLOAD');
    setParsedData([]);
    setLogs([]);
    setStats({ totalRows: 0, newItems: 0, brands: 0, categories: 0, duplicates: 0, updates: 0 });
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  }, []);

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'csv') {
        parseCSV(file);
      } else if (ext === 'xlsx' || ext === 'xls') {
        parseExcel(file);
      } else {
        alert("Please upload a .csv or .xlsx file");
      }
    }
  };

  const getValue = (row: ImportRow, ...keys: string[]): unknown => {
    const rowKeys = Object.keys(row);
    for (const key of keys) {
        if (row[key] !== undefined) return row[key];
        
        const foundKey = rowKeys.find(k => k.trim().toLowerCase() === key.trim().toLowerCase());
        if (foundKey && row[foundKey] !== undefined) return row[foundKey];
    }
    return undefined;
  };

  const parseCSV = (file: File) => {
    Papa.parse<ImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      complete: (results: any) => processPreview(results.data),
      error: (error: Error) => alert("Error parsing CSV: " + error.message)
    });
  };

  const parseExcel = (file: File) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0]; 
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<ImportRow>(sheet);
        processPreview(json);
      } catch (err) {
        console.error(err);
        alert("Error parsing Excel file");
      }
    };
  };

  const processPreview = (rows: ImportRow[]) => {
    const existingIds = new Set(existingProducts.map(p => p.id));
    const existingNames = new Set(existingProducts.map(p => `${p.brand?.trim().toUpperCase()}-${p.collection?.trim().toUpperCase()}`));
    
    const existingBrandsSet = new Set(existingProducts.map(p => p.brand?.trim().toUpperCase()).filter(Boolean));
    const existingCategoriesSet = new Set(existingProducts.map(p => p.category?.trim().toUpperCase()).filter(Boolean));

    const updateRows: ImportRow[] = [];
    const insertRows: ImportRow[] = [];
    let duplicateCount = 0;

    rows.forEach(row => {
        const brand = String(getValue(row, 'brand', 'Brand') || '').trim();
        const collection = String(getValue(row, 'collection name', 'Collection', 'collection') || '').trim();
        const systemId = String(getValue(row, 'system id', 'System ID') || '').trim();
        
        if (!brand && !collection) return;

        // 1. IS UPDATE?
        if (systemId && existingIds.has(systemId)) {
            updateRows.push(row);
            return;
        }

        // 2. IS DUPLICATE?
        const key = `${brand.toUpperCase()}-${collection.toUpperCase()}`;
        if (existingNames.has(key)) {
            duplicateCount++;
        } else {
            // 3. IS NEW ITEM
            insertRows.push(row);
        }
    });

    const allActionableRows = [...updateRows, ...insertRows];
    const newBrandsFound = new Set<string>();
    const newCategoriesFound = new Set<string>();

    allActionableRows.forEach(row => {
        const brand = String(getValue(row, 'brand', 'Brand') || '').trim();
        const category = String(getValue(row, 'category', 'Category') || '').trim();

        if (brand && !existingBrandsSet.has(brand.toUpperCase())) {
            newBrandsFound.add(brand.toUpperCase());
        }

        if (category && !existingCategoriesSet.has(category.toUpperCase())) {
            newCategoriesFound.add(category.toUpperCase());
        }
    });
    
    setStats({
      totalRows: updateRows.length + insertRows.length,
      newItems: insertRows.length,
      duplicates: duplicateCount,
      updates: updateRows.length,
      brands: newBrandsFound.size,
      categories: newCategoriesFound.size
    });

    setParsedData([...updateRows, ...insertRows]);
    setStep('CONFIRM');
  };

  const cleanPrice = (val: unknown): number => {
    if (!val) return 0;
    const clean = String(val).replace(/[^0-9.]/g, '');
    return parseInt(clean, 10) || 0;
  };

  const parseDiscounts = (val: unknown) => {
    if (!val) return [];
    const parts = String(val).replace(/%/g, '').split('+');
    return parts.map(v => ({
        name: `${v.trim()}%`,
        value: parseFloat(v.trim())
    })).filter(d => !isNaN(d.value) && d.value > 0);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return; 

    setStep('PROCESSING');
    setLogs(prev => [...prev, "Analyzing schema..."]);

    try {
      const productsPayload = parsedData.map(row => {
        const isSmartSchema = getValue(row, 'retail price (eur)') !== undefined || getValue(row, 'not for sale') !== undefined;

        let brand, category, collection, code, total_stock;
        let priceIDR, priceEUR, priceUSD, nettPrice;
        let isNFS, isUpcoming, eta;
        let discounts;
        let image_url, detail, dims, finish, location;
        let systemId;

        if (isSmartSchema) {
            brand = String(getValue(row, 'brand') || '');
            category = String(getValue(row, 'category') || '');
            collection = String(getValue(row, 'collection name') || '');
            code = String(getValue(row, 'manufacturer id') || '');
            total_stock = parseInt(String(getValue(row, 'total qty') || '0'));

            priceIDR = cleanPrice(getValue(row, 'retail price (idr)'));
            priceEUR = cleanPrice(getValue(row, 'retail price (eur)'));
            priceUSD = cleanPrice(getValue(row, 'retail price (usd)'));
            nettPrice = cleanPrice(getValue(row, 'nett price (idr)'));

            const nfsVal = String(getValue(row, 'not for sale') || '').toLowerCase();
            isNFS = nfsVal.includes('not for sale') || nfsVal === 'true';

            const upcomingVal = String(getValue(row, 'upcoming') || '').toLowerCase();
            isUpcoming = upcomingVal.includes('upcoming') || upcomingVal === 'true';

            eta = String(getValue(row, 'eta') || '');
            discounts = parseDiscounts(getValue(row, 'discounts'));
            
            image_url = String(getValue(row, 'image file') || '');
            detail = String(getValue(row, 'detail') || '');
            dims = String(getValue(row, 'dimensions') || '');
            finish = String(getValue(row, 'finishing') || '');
            location = String(getValue(row, 'location') || '');
            systemId = String(getValue(row, 'system id') || '');

        } else {
            brand = String(getValue(row, 'brand', 'Brand') || '');
            category = String(getValue(row, 'category', 'Category') || '');
            collection = String(getValue(row, 'collection', 'Collection') || '');
            code = String(getValue(row, 'code', 'Code') || '');
            total_stock = parseInt(String(getValue(row, 'quantity', 'qty') || '0'));

            priceIDR = cleanPrice(getValue(row, 'retail price', 'retail_price_idr'));
            priceEUR = cleanPrice(getValue(row, 'retail price in euro', 'retail_price_eur'));
            priceUSD = cleanPrice(getValue(row, 'retail price in usd', 'retail_price_usd'));
            nettPrice = cleanPrice(getValue(row, 'nett price', 'nett_price_idr'));

            const rawStatus = String(getValue(row, 'status') || '').toUpperCase();
            isNFS = rawStatus.includes('NOT FOR SALE') || rawStatus.includes('NFS');
            isUpcoming = rawStatus.includes('UPCOMING');
            eta = String(getValue(row, 'eta', 'arriving_eta') || '');

            discounts = parseDiscounts(getValue(row, 'discount'));
            
            image_url = String(getValue(row, 'image') || '');
            detail = String(getValue(row, 'detail', 'description') || '');
            dims = String(getValue(row, 'size', 'dimensions') || '');
            finish = String(getValue(row, 'finishing') || '');
            location = String(getValue(row, 'location') || '');
            systemId = ''; 
        }
        
        return {
          id: systemId,
          brand: brand,
          category: category,
          collection: collection,
          code: code,
          image_url: image_url ? (image_url.includes('products/') ? image_url : `products/${image_url}`) : '',
          total_stock: total_stock,
          retail_price_idr: priceIDR,
          retail_price_eur: priceEUR,
          retail_price_usd: priceUSD,
          nett_price_idr: nettPrice,
          discounts: discounts,
          detail: detail,
          dimensions: dims,
          finishing: finish,
          is_not_for_sale: isNFS,
          is_upcoming: isUpcoming,
          upcoming_eta: eta,
          location: location || 'Warehouse (Import)'
        };
      });

      setLogs(prev => [...prev, `Mapped ${productsPayload.length} items. Sending to backend...`]);

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
                        <span className="text-sm font-bold text-gray-700">Click to Select File</span>
                        <span className="text-xs text-gray-400 mt-1">Supports .CSV and .XLSX (Excel)</span>
                    </div>
                    <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                </div>
            )}

            {step === 'CONFIRM' && (
                <div className="space-y-6">
                    <div className="bg-gray-50 border border-gray-200 p-4 rounded flex items-start gap-3 relative">
                        <CheckCircle size={20} className="text-gray-600 mt-0.5" />
                        <div>
                            <div className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                File Analysis Complete
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                                Found <span className="font-bold">{stats.totalRows} items</span> to process.
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2">
                         {/* Updates (Primary Style) */}
                         {stats.updates > 0 && (
                            <div className="flex-1 bg-primary/5 border border-primary/20 p-3 rounded text-center">
                                <div className="text-xs text-primary/70 uppercase font-bold tracking-wider">UPDATE</div>
                                <div className="text-lg font-bold text-primary">{stats.updates}</div>
                            </div>
                         )}
                         
                         {/* New Items (Primary Strong Style) */}
                         {stats.newItems > 0 && (
                            <div className="flex-1 bg-primary/10 border border-primary/20 p-3 rounded text-center">
                                <div className="text-xs text-primary uppercase font-bold tracking-wider">NEW</div>
                                <div className="text-lg font-bold text-primary">{stats.newItems}</div>
                            </div>
                         )}

                         {/* Duplicates (Neutral Style - UNIFORMED) */}
                         {stats.duplicates > 0 && (
                            <div className="flex-1 bg-gray-50 border border-gray-200 p-3 rounded text-center">
                                <div className="text-xs text-gray-400 uppercase font-bold tracking-wider">DUPLICATE</div>
                                <div className="text-lg font-bold text-gray-500">{stats.duplicates}</div>
                            </div>
                         )}
                    </div>

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
                        {stats.totalRows === 0 ? 'No Changes Found' : `Confirm Import (${stats.totalRows})`}
                    </button>
                    
                    <button onClick={reset} className="w-full py-2 text-xs font-bold text-gray-400 hover:text-gray-600">
                        Cancel & Select Different File
                    </button>

                    {/* STATUS INFORMATION BOX */}
                    <div className="bg-gray-50 border border-gray-200 p-4 rounded text-left text-xs space-y-4">
                        <div className="font-bold text-gray-700 border-b border-gray-200 pb-2">STATUS INFORMATION</div>
                        
                        <div>
                            <div className="font-bold text-primary mb-1">UPDATE</div>
                            <div className="text-gray-500 leading-relaxed">
                                Detected by matching the System ID column.<br/>
                                The system found these IDs in your database and will overwrite the existing prices, dimensions, status, and details with the values from this file.
                            </div>
                        </div>

                        <div>
                            <div className="font-bold text-primary mb-1">NEW</div>
                            <div className="text-gray-500 leading-relaxed">
                                Detected by checking the Brand + Collection Name.<br/>
                                The system could not find a matching ID or Name in your database. These rows will be registered as fresh inventory, and new System SKUs will be generated for them.
                            </div>
                        </div>

                        <div>
                            <div className="font-bold text-gray-500 mb-1">DUPLICATE (Skipped)</div>
                            <div className="text-gray-400 leading-relaxed">
                                Detected when a row has no System ID but the Brand + Collection Name already exists.<br/>
                                The system automatically skips these rows to protect your data integrity and prevent creating double entries for the same product.
                            </div>
                        </div>
                    </div>

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