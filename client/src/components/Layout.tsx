import React, { type ReactNode } from 'react'; // <--- Added 'type' here
import { Tag, Layers, Flag, MapPin, ScanLine, Menu } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// New Interface to fix 'any' error
interface NavButtonProps {
  icon: ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  return (
    <div className="flex flex-col h-screen bg-gray-100 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      
      {/* 1. Header (Smart Search & Scan) */}
      <header className="bg-primary text-white p-4 flex gap-2 items-center shadow-md z-10">
        <button className="p-2 hover:bg-primary-dark transition-colors">
            <Menu size={24} />
        </button>
        <div className="flex-grow bg-white/10 p-2 flex items-center border border-white/20">
            <span className="text-white/60 text-sm ml-2">Search inventory...</span>
        </div>
        <button className="p-2 hover:bg-primary-dark transition-colors">
            <ScanLine size={24} />
        </button>
      </header>

      {/* 2. Main Scrollable Content */}
      <main className="flex-grow overflow-y-auto pb-20 no-scrollbar">
        {children}
      </main>

      {/* 3. Bottom Navigation Bar */}
      <nav className="absolute bottom-0 w-full bg-white border-t border-gray-200 flex justify-between px-2 py-2 z-20">
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

// Helper Component with Proper Types
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