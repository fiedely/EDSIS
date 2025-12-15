import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import Layout from './components/Layout';
import type { Product, GroupedProducts } from './types'; // <--- Added 'type' here
import { ChevronDown, ChevronRight, Box } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('BRAND');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);

  // 1. Fetch Data on Load
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:5001/edievo-project/asia-southeast2/get_all_products');
        setProducts(res.data.data);
      } catch (err) {
        console.error("API Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 2. Group Products by Brand
  const brandsGrouped = useMemo(() => {
    const groups: GroupedProducts = {};
    products.forEach(p => {
      const brand = p.brand || 'Unknown';
      if (!groups[brand]) groups[brand] = [];
      groups[brand].push(p);
    });
    return Object.keys(groups).sort().reduce((obj: GroupedProducts, key) => {
      obj[key] = groups[key];
      return obj;
    }, {});
  }, [products]);

  // 3. Render Brand List
  const renderBrandList = () => (
    <div className="flex flex-col">
      {Object.entries(brandsGrouped).map(([brandName, items]) => {
        const isExpanded = expandedBrand === brandName;
        
        return (
          <div key={brandName} className="border-b border-gray-200 bg-white">
            {/* Brand Header Row */}
            <div 
              onClick={() => setExpandedBrand(isExpanded ? null : brandName)}
              className={`p-4 flex justify-between items-center cursor-pointer transition-colors
                ${isExpanded ? 'bg-primary/5' : 'hover:bg-gray-50'}
              `}
            >
              <div className="flex items-center gap-3">
                <span className={`font-bold text-sm tracking-wide ${isExpanded ? 'text-primary' : 'text-gray-800'}`}>
                  {brandName.toUpperCase()}
                </span>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-none">
                  {items.length}
                </span>
              </div>
              {isExpanded ? <ChevronDown size={18} className="text-primary"/> : <ChevronRight size={18} className="text-gray-300"/>}
            </div>

            {/* Expanded Items List */}
            {isExpanded && (
              <div className="bg-gray-50 border-t border-gray-100 animate-in slide-in-from-top-2 duration-200">
                {items.map(item => (
                  <div key={item.id} className="p-3 pl-8 flex gap-3 border-b border-gray-100 last:border-0 hover:bg-white transition-colors">
                    <div className="w-10 h-10 bg-gray-200 flex-shrink-0 flex items-center justify-center text-gray-400">
                      <Box size={16}/>
                    </div>
                    
                    <div className="flex-grow">
                      <div className="text-sm font-medium text-gray-800 line-clamp-1">{item.collection}</div>
                      <div className="text-xs text-gray-500">{item.code} • {item.category}</div>
                    </div>

                    <div className="flex flex-col items-end justify-center min-w-[60px]">
                      <span className="text-xs font-bold text-primary">{item.total_stock} Units</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {loading ? (
        <div className="p-10 text-center text-gray-400 text-sm animate-pulse">Syncing Inventory...</div>
      ) : (
        <>
          {activeTab === 'BRAND' && renderBrandList()}
          {activeTab !== 'BRAND' && (
            <div className="p-8 text-center text-gray-400 text-sm">
              Menu {activeTab} coming soon...
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

export default App;