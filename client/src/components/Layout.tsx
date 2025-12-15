import React, { type ReactNode } from 'react';
import { Tag, Layers, Flag, MapPin, ScanLine, Menu, Search, X } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

interface NavButtonProps {
  icon: ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  onTabChange,
  searchQuery,
  onSearchChange 
}) => {
  return (
    <div className="flex flex-col h-screen bg-gray-100 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      
      {/* 1. Header (Interactive Search) */}
      <header className="bg-primary text-white p-4 flex gap-2 items-center shadow-md z-10">
        <button className="p-2 hover:bg-primary-dark transition-colors rounded-none">
            <Menu size={24} />
        </button>
        
        <div className="flex-grow bg-primary-dark/30 p-2 flex items-center border border-white/20 relative">
            <Search size={18} className="text-white/60 ml-1" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search Brand, Code..." 
              className="bg-transparent border-none outline-none text-white text-sm ml-2 w-full placeholder:text-white/40 font-medium"
            />
            {searchQuery && (
              <button onClick={() => onSearchChange('')} className="p-1 hover:text-white text-white/60">
                <X size={16} />
              </button>
            )}
        </div>

        <button className="p-2 hover:bg-primary-dark transition-colors rounded-none">
            <ScanLine size={24} />
        </button>
      </header>

      {/* 2. Main Scrollable Content */}
      <main className="flex-grow overflow-y-auto pb-20 no-scrollbar bg-white">
        {children}
      </main>

      {/* 3. Bottom Navigation Bar */}
      <nav className="absolute bottom-0 w-full bg-white border-t border-gray-200 flex justify-between px-2 py-2 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <NavButton 
          icon={<Tag size={20} />} 
          label="BRAND" 
          isActive={activeTab === 'BRAND'} 
          onClick={() => onTabChange('BRAND')} 
        />
        <NavButton 
          icon={<Layers size={20} />} 
          label="CATEGORY" 
          isActive={activeTab === 'CATEGORY'} 
          onClick={() => onTabChange('CATEGORY')} 
        />
        <NavButton 
          icon={<Flag size={20} />} 
          label="STATUS" 
          isActive={activeTab === 'STATUS'} 
          onClick={() => onTabChange('STATUS')} 
        />
        <NavButton 
          icon={<MapPin size={20} />} 
          label="LOCATION" 
          isActive={activeTab === 'LOCATION'} 
          onClick={() => onTabChange('LOCATION')} 
        />
      </nav>
    </div>
  );
};

const NavButton: React.FC<NavButtonProps> = ({ icon, label, isActive, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-full py-2 transition-all duration-200
      ${isActive ? 'text-primary border-t-2 border-primary -mt-[10px] pt-[10px] font-bold' : 'text-gray-400 hover:text-gray-600'}
    `}
  >
    {icon}
    <span className="text-[10px] tracking-widest mt-1">{label}</span>
  </button>
);

export default Layout;