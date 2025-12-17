import React, { useState } from 'react';
import { X, FileSpreadsheet, FileText, Loader2, Download, AlertCircle } from 'lucide-react';
import axios from 'axios';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ExportModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [exportType, setExportType] = useState<'EXCEL' | 'PDF'>('EXCEL');

  if (!isOpen) return null;

  const handleExport = async () => {
    setLoading(true);
    try {
        let endpoint = '';
        if (exportType === 'EXCEL') {
            endpoint = 'http://127.0.0.1:5001/edievo-project/asia-southeast2/export_inventory_excel';
        } else {
            alert("PDF Catalog generation coming in the next phase!");
            setLoading(false);
            return;
        }

        const response = await axios.get(endpoint, {
            responseType: 'blob', 
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        
        // --- ROBUST FILENAME LOGIC ---
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '').substring(0, 4); // HHMM
        
        // 1. Default with Time
        let fileName = `EDSIS_Inventory_Master_${dateStr}_${timeStr}.xlsx`;
        
        // 2. Try to get from Backend (Best Case)
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
            const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
            if (fileNameMatch && fileNameMatch.length === 2) {
                fileName = fileNameMatch[1];
            }
        }
        
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        
        link.remove();
        window.URL.revokeObjectURL(url);
        
        onClose();
    } catch (err) {
        console.error("Export failed:", err);
        alert("Failed to download file. Please check console for details.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="bg-white w-full max-w-md shadow-2xl z-10 flex flex-col rounded-none animate-in fade-in zoom-in-95 duration-200">
        
        {/* Maroon Header */}
        <div className="p-4 bg-primary text-white flex justify-between items-center shrink-0">
            <h2 className="text-lg font-bold tracking-wide flex items-center gap-2">
                <Download size={20}/> EXPORT INVENTORY
            </h2>
            <button onClick={onClose}><X size={20}/></button>
        </div>

        <div className="p-6 space-y-6">
            <div className="space-y-3">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Select Format</label>
                
                {/* Excel Option */}
                <div 
                    onClick={() => setExportType('EXCEL')}
                    className={`flex items-center gap-4 p-4 border-2 cursor-pointer transition-all ${exportType === 'EXCEL' ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200'}`}
                >
                    <div className={`p-3 rounded-full ${exportType === 'EXCEL' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                        <FileSpreadsheet size={24} />
                    </div>
                    <div>
                        <div className={`font-bold ${exportType === 'EXCEL' ? 'text-primary' : 'text-gray-600'}`}>Excel Database (.xlsx)</div>
                        <div className="text-xs text-gray-400 mt-0.5">Complete data backup. Compatible for re-importing.</div>
                    </div>
                </div>

                {/* PDF Option (Disabled for now) */}
                <div 
                    onClick={() => setExportType('PDF')}
                    className={`flex items-center gap-4 p-4 border-2 cursor-pointer transition-all ${exportType === 'PDF' ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200'}`}
                >
                    <div className={`p-3 rounded-full ${exportType === 'PDF' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                        <FileText size={24} />
                    </div>
                    <div>
                        <div className={`font-bold ${exportType === 'PDF' ? 'text-primary' : 'text-gray-600'}`}>Product Catalog (.pdf)</div>
                        <div className="text-xs text-gray-400 mt-0.5">Print-ready document with images and details.</div>
                    </div>
                </div>
            </div>

            <div className="bg-gray-50 border-l-4 border-gray-400 p-3 flex gap-3">
                <AlertCircle size={18} className="text-gray-500 mt-0.5 shrink-0" />
                <div className="text-xs text-gray-500 leading-relaxed">
                    Generating the file may take a few seconds depending on inventory size. The download will start automatically.
                </div>
            </div>

            <button 
                onClick={handleExport}
                disabled={loading}
                className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
            >
                {loading ? <Loader2 className="animate-spin" size={20}/> : <Download size={20}/>}
                {loading ? 'GENERATING FILE...' : 'DOWNLOAD FILE'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;