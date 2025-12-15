import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import Layout from './components/Layout';
import type { Product } from './types';
import { buildProductTree, type GroupNode } from './utils'; // <--- Fixed: Added 'type'
import { ChevronDown, ChevronRight, Box, Layers } from 'lucide-react'; // <--- Fixed: Removed 'Archive'
import clsx from 'clsx';

function App() {
  const [activeTab, setActiveTab] = useState('BRAND');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

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

  const toggleExpand = (uniqueKey: string) => {
    const newSet = new Set(expandedKeys);
    if (newSet.has(uniqueKey)) {
      newSet.delete(uniqueKey);
    } else {
      newSet.add(uniqueKey);
    }
    setExpandedKeys(newSet);
  };

  const treeData = useMemo(() => {
    const filtered = products.filter(p => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.brand?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.collection?.toLowerCase().includes(q) ||
        p.code?.toLowerCase().includes(q)
      );
    });

    let levels: string[] = [];
    if (activeTab === 'BRAND') levels = ['brand', 'category'];
    if (activeTab === 'CATEGORY') levels = ['category', 'brand'];
    if (activeTab === 'STATUS') levels = ['status', 'brand', 'category']; 
    if (activeTab === 'LOCATION') levels = ['current_location', 'brand', 'category'];

    return buildProductTree(filtered, levels);
  }, [products, activeTab, searchQuery]);


  const renderNode = (node: GroupNode, parentKey: string = '') => {
    const uniqueKey = parentKey ? `${parentKey}-${node.key}` : node.key;
    const isExpanded = expandedKeys.has(uniqueKey) || searchQuery.length > 0;
    const isDeepLevel = node.level > 0;

    return (
      <div key={uniqueKey} className={clsx("border-gray-100", isDeepLevel ? "border-l-2 ml-4" : "border-b bg-white")}>
        
        {/* Header Row */}
        <div 
          onClick={() => toggleExpand(uniqueKey)}
          className={clsx(
            "flex justify-between items-center cursor-pointer transition-colors pr-4 py-4",
            isDeepLevel ? "pl-3 py-3" : "pl-4",
            isExpanded && !isDeepLevel ? "bg-primary/5" : "hover:bg-gray-50"
          )}
        >
          <div className="flex items-center gap-3">
            <span className={clsx(
              "font-bold tracking-wide",
              isDeepLevel ? "text-xs text-gray-600 uppercase" : "text-sm text-gray-800",
              isExpanded && !isDeepLevel && "text-primary"
            )}>
              {node.key.toUpperCase()}
            </span>
            <span className={clsx(
              "text-[10px] font-bold px-2 py-0.5 rounded-none",
              isDeepLevel ? "text-gray-400 bg-gray-100" : "text-gray-400 bg-gray-100"
            )}>
              {node.items.length}
            </span>
          </div>
          {node.subgroups.length > 0 && (
            isExpanded ? <ChevronDown size={16} className="text-primary"/> : <ChevronRight size={16} className="text-gray-300"/>
          )}
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="animate-in slide-in-from-top-1 duration-200">
            
            {/* 1. "ALL" Group (Only if there are subgroups) */}
            {node.subgroups.length > 0 && (
               <div className="border-b border-gray-100 last:border-0 ml-4 border-l-2 border-primary/20">
                  <div 
                    onClick={() => toggleExpand(`${uniqueKey}-ALL`)}
                    className="flex items-center gap-2 p-3 pl-3 cursor-pointer hover:bg-gray-50 text-xs font-bold text-primary/70"
                  >
                    <Layers size={14} />
                    <span>ALL {node.key.toUpperCase()}</span>
                    <span className="ml-auto text-gray-400">{node.items.length} Items</span>
                    {expandedKeys.has(`${uniqueKey}-ALL`) ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                  </div>
                  
                  {expandedKeys.has(`${uniqueKey}-ALL`) && (
                    <div className="pl-4">
                      {node.items.map(item => renderItemCard(item))}
                    </div>
                  )}
               </div>
            )}

            {/* 2. Subgroups */}
            {node.subgroups.map(subgroup => renderNode(subgroup, uniqueKey))}

            {/* 3. Items (Leaf Level) */}
            {node.subgroups.length === 0 && (
              <div className="pl-4 pb-2 bg-gray-50/50">
                {node.items.map(item => renderItemCard(item))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderItemCard = (item: Product) => (
    <div key={item.id} className="p-3 flex gap-3 border-b border-gray-200/50 last:border-0 hover:bg-white transition-colors cursor-pointer group bg-white">
      <div className="w-10 h-10 bg-gray-100 border border-gray-200 flex-shrink-0 flex items-center justify-center text-gray-300">
        <Box size={16}/>
      </div>
      <div className="flex-grow">
        <div className="text-sm font-bold text-gray-800 line-clamp-1">{item.collection}</div>
        <div className="text-[10px] text-gray-500 font-medium">
          {item.code} 
          {activeTab !== 'BRAND' && <span className="text-primary/70"> • {item.brand}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end justify-center min-w-[50px]">
        <span className="text-xs font-bold text-primary">{item.total_stock}</span>
      </div>
    </div>
  );

  return (
    <Layout 
      activeTab={activeTab} 
      onTabChange={(tab) => {
        setActiveTab(tab);
        setExpandedKeys(new Set());
        setSearchQuery(''); 
      }}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    >
      {loading ? (
        <div className="p-10 text-center text-gray-400 text-sm animate-pulse flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          Syncing Inventory...
        </div>
      ) : (
        <div className="pb-10">
          {searchQuery && (
            <div className="p-4 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
              Found {treeData.reduce((acc, node) => acc + node.items.length, 0)} groups
            </div>
          )}

          {treeData.map(node => renderNode(node))}
          
          {treeData.length === 0 && (
            <div className="p-10 text-center text-gray-400 text-sm">No items found.</div>
          )}
        </div>
      )}
    </Layout>
  );
}

export default App;