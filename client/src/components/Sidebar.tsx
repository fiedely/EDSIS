import React from 'react';
import { X, Plus, FileText, RefreshCw, Settings, Shield, User, LogOut, FileSpreadsheet, Percent } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: () => void;
  onImport: () => void;
  onManageDiscounts: () => void; 
  userRole?: string;
}

interface MenuButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onAddItem, onImport, onManageDiscounts, userRole = 'admin' }) => {
  const canAdd = userRole === 'admin' || userRole === 'manager';
  const canAdmin = userRole === 'admin';

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/50 z-50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <div className={`fixed inset-y-0 left-0 w-72 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        <div className="p-6 bg-primary text-white flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold tracking-wider">EDSIS</h2>
                <div className="text-[10px] opacity-70 uppercase tracking-widest mt-1">Management Console</div>
            </div>
            <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                <X size={20} />
            </button>
        </div>

        <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-400">
                <User size={20} />
            </div>
            <div>
                <div className="text-sm font-bold text-gray-800">Guest User</div>
                <div className="text-xs text-gray-500">Access Level: {userRole}</div>
            </div>
        </div>

        <div className="flex-grow overflow-y-auto py-4">
            <div className="px-6 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Inventory</div>
            
            <MenuButton 
                icon={<Plus size={18} />} 
                label="Add New Item" 
                onClick={() => { onClose(); onAddItem(); }}
                disabled={!canAdd}
            />
            
            <MenuButton 
                icon={<FileSpreadsheet size={18} />} 
                label="Import Inventory" 
                onClick={() => { onClose(); onImport(); }}
                disabled={!canAdd}
            />
            
            <MenuButton icon={<FileText size={18} />} label="Export Inventory" onClick={() => {}} />
            <MenuButton icon={<RefreshCw size={18} />} label="Manage Exchange" onClick={() => {}} />
            
            {/* MOVED HERE per Req #5 */}
            <MenuButton 
                icon={<Percent size={18} />} 
                label="Manage Discounts" 
                onClick={() => { onClose(); onManageDiscounts(); }}
                disabled={!canAdd}
            />

            <div className="px-6 mt-6 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">System</div>
            
            <MenuButton 
                icon={<Shield size={18} />} 
                label="Admin & Audit" 
                onClick={() => {}} 
                disabled={!canAdmin}
            />
             <MenuButton icon={<Settings size={18} />} label="Settings" onClick={() => {}} />
        </div>

        <div className="p-4 border-t border-gray-200">
            <button className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                <LogOut size={18} />
                Sign Out
            </button>
        </div>
      </div>
    </>
  );
};

const MenuButton: React.FC<MenuButtonProps> = ({ icon, label, onClick, disabled = false }) => (
    <button 
        onClick={disabled ? undefined : onClick}
        className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors
            ${disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50 hover:text-primary'}
        `}
    >
        {icon}
        <span>{label}</span>
        {disabled && <span className="ml-auto text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">LOCKED</span>}
    </button>
);

export default Sidebar;