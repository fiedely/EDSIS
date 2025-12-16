import { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import Layout from './components/Layout';
import type { Product, ExchangeRates } from './types';
import { buildProductTree, type GroupNode } from './utils';
import { ChevronDown, ChevronRight, Layers, ChevronsDown, ChevronsUp, RefreshCw, AlertCircle, Clock, Percent, XCircle, Book } from 'lucide-react';
import clsx from 'clsx';
import ProductDetailModal from './components/ProductDetailModal';
import StorageImage from './components/StorageImage';
import Sidebar from './components/Sidebar';
import ProductFormModal from './components/ProductFormModal';
import ImportModal from './components/ImportModal';
import DiscountManagerModal from './components/DiscountManagerModal';
import ActiveBookingsModal from './components/ActiveBookingsModal';
import ExchangeRateModal from './components/ExchangeRateModal'; // [NEW]

function App() {
  const [activeTab, setActiveTab] = useState('BRAND');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // [NEW] State for Exchange Rates
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);

  const [expandedState, setExpandedState] = useState<Record<string, Set<string>>>({
    BRAND: new Set(),
    CATEGORY: new Set(),
    STATUS: new Set(),
    LOCATION: new Set()
  });
  
  const currentExpandedKeys = expandedState[activeTab] || new Set();

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [formMode, setFormMode] = useState<'ADD' | 'EDIT'>('ADD');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDiscountManagerOpen, setIsDiscountManagerOpen] = useState(false);
  const [isActiveBookingsOpen, setIsActiveBookingsOpen] = useState(false); 

  const fetchProducts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (!silent) {
        // Run global expiration check on load to keep data fresh
        await axios.post('http://127.0.0.1:5001/edievo-project/asia-southeast2/check_expired_bookings');
      }
      
      // [NEW] Fetch Exchange Rates
      const rateRes = await axios.get('http://127.0.0.1:5001/edievo-project/asia-southeast2/get_exchange_rates');
      setRates(rateRes.data.data);

      const res = await axios.get('http://127.0.0.1:5001/edievo-project/asia-southeast2/get_all_products');
      setProducts(res.data.data);
      return res.data.data;
    } catch (err) {
      console.error("API Error:", err);
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const toggleExpand = (uniqueKey: string) => {
    const newSet = new Set(currentExpandedKeys);
    if (newSet.has(uniqueKey)) {
      newSet.delete(uniqueKey);
    } else {
      newSet.add(uniqueKey);
    }
    setExpandedState(prev => ({
        ...prev,
        [activeTab]: newSet
    }));
  };

  const handleExpandAll = () => {
    const allKeys = new Set<string>();
    const traverse = (nodes: GroupNode[], parentKey = '') => {
        nodes.forEach(node => {
            const uniqueKey = parentKey ? `${parentKey}-${node.key}` : node.key;
            allKeys.add(uniqueKey);
            traverse(node.subgroups, uniqueKey);
        });
    };
    traverse(treeData);
    setExpandedState(prev => ({ ...prev, [activeTab]: allKeys }));
  };

  const handleCollapseAll = () => {
    setExpandedState(prev => ({ ...prev, [activeTab]: new Set() }));
  };

  const treeData = useMemo(() => {
    const filtered = products.filter(p => {
      // 1. Search Logic
      if (searchQuery) {
        const terms = searchQuery.toLowerCase().split(',').map(t => t.trim()).filter(t => t.length > 0);
        if (terms.length > 0) {
            // [UPDATED] Search includes Manufacturer Code
            const searchableText = `${p.brand} ${p.category} ${p.collection} ${p.code} ${p.manufacturer_code || ''}`.toLowerCase();
            const matches = terms.every(term => searchableText.includes(term));
            if (!matches) return false;
        }
      }

      // 2. Tab Visibility Logic
      if (activeTab === 'BRAND' || activeTab === 'CATEGORY') {
          if (p.is_not_for_sale || p.is_upcoming) return false;
      }
      
      return true;
    });

    let levels: string[] = [];
    if (activeTab === 'BRAND') levels = ['brand', 'category'];
    if (activeTab === 'CATEGORY') levels = ['category', 'brand'];
    
    // Custom Grouping for STATUS Tab
    if (activeTab === 'STATUS') {
        return buildStatusTree(filtered);
    }

    if (activeTab === 'LOCATION') levels = ['current_location', 'brand', 'category'];

    return buildProductTree(filtered, levels);
  }, [products, activeTab, searchQuery]);

  function buildStatusTree(items: Product[]): GroupNode[] {
    const groups: Record<string, Product[]> = {
        'DISCOUNT ITEM': [],
        'BOOKED ITEM': [],
        'UPCOMING ITEM': [],
        'NOT FOR SALE': [],
        'NO STOCK': [] 
    };

    items.forEach(p => {
        if (p.is_not_for_sale) groups['NOT FOR SALE'].push(p);
        if (p.is_upcoming) groups['UPCOMING ITEM'].push(p);
        if (p.discounts && p.discounts.length > 0) groups['DISCOUNT ITEM'].push(p);
        if (p.booked_stock > 0) groups['BOOKED ITEM'].push(p);
        if (p.total_stock === 0) groups['NO STOCK'].push(p);
    });

    return Object.entries(groups)
        .filter(([, list]) => list.length > 0) 
        .map(([key, list]) => {
            const subTree = buildProductTree(list, ['brand']);
            
            const shiftLevel = (nodes: GroupNode[]): GroupNode[] => {
                return nodes.map(n => ({
                    ...n,
                    level: n.level + 1,
                    subgroups: shiftLevel(n.subgroups)
                }));
            };

            return {
                key,
                level: 0,
                items: list, 
                subgroups: shiftLevel(subTree)
            };
        });
  }

  const getGroupCount = (node: GroupNode): number => {
    return node.items.length;
  };

  const handleAddClick = () => {
    setFormMode('ADD');
    setProductToEdit(null);
    setIsFormOpen(true);
  };

  const handleEditClick = (product: Product) => {
    setFormMode('EDIT');
    setProductToEdit(product);
    setIsFormOpen(true);
  };
  
  const handleImportClick = () => {
    setIsImportOpen(true);
  };
  
  const handleManageDiscountsClick = () => {
    setIsDiscountManagerOpen(true);
  };

  const handleRefresh = async () => {
    const newProducts: Product[] = await fetchProducts(true); 
    if (selectedProduct) {
        const updatedItem = newProducts.find(p => p.id === selectedProduct.id);
        if (updatedItem) {
            setSelectedProduct(updatedItem);
        } else {
            setSelectedProduct(null);
        }
    }
  };

  const renderNode = (node: GroupNode, parentKey: string = '') => {
    const uniqueKey = parentKey ? `${parentKey}-${node.key}` : node.key;
    const isExpanded = currentExpandedKeys.has(uniqueKey) || searchQuery.length > 0;
    const isDeepLevel = node.level > 0;
    
    return (
      <div key={uniqueKey} className={clsx("border-gray-100", isDeepLevel ? "border-l-2 ml-4" : "border-b bg-white")}>
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

        {isExpanded && (
          <div className="animate-in slide-in-from-top-1 duration-200">
            {node.subgroups.length > 0 && (
               <div className="border-b border-gray-100 last:border-0 ml-4 border-l-2 border-primary/20">
                  <div 
                    onClick={() => toggleExpand(`${uniqueKey}-ALL`)}
                    className="flex items-center gap-2 p-3 pl-3 cursor-pointer hover:bg-gray-50 text-xs font-bold text-primary/70"
                  >
                    <Layers size={14} />
                    <span>ALL {node.key.toUpperCase()}</span>
                    <span className="ml-auto text-gray-400">{node.items.length} Items</span>
                    {currentExpandedKeys.has(`${uniqueKey}-ALL`) ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                  </div>
                  {currentExpandedKeys.has(`${uniqueKey}-ALL`) && (
                    <div className="pl-4">
                      {node.items.map(item => renderItemCard(item))}
                    </div>
                  )}
               </div>
            )}
            
            {node.subgroups.map(subgroup => renderNode(subgroup, uniqueKey))}
            
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

  const renderItemCard = (item: Product) => {
    const isDiscount = item.discounts && item.discounts.length > 0;
    const isNFS = item.is_not_for_sale;
    const isUpcoming = item.is_upcoming;
    const isNoStock = item.total_stock === 0;
    const isBooked = item.booked_stock > 0; 

    return (
        <div 
            key={item.id} 
            onClick={() => setSelectedProduct(item)} 
            className="p-3 flex gap-3 border-b border-gray-200/50 last:border-0 hover:bg-white transition-colors cursor-pointer group bg-white relative"
        >
        <div className="w-12 h-12 flex-shrink-0 bg-gray-100 border border-gray-200 overflow-hidden relative">
            <StorageImage 
                filename={item.image_url} 
                alt={item.collection} 
                className="w-full h-full object-cover" 
            />
            {isNFS && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[8px] text-white font-bold text-center leading-tight">NOT FOR<br/>SALE</div>}
            {isUpcoming && <div className="absolute inset-0 bg-blue-900/60 flex items-center justify-center text-[8px] text-white font-bold text-center leading-tight">SOON</div>}
        </div>

        <div className="flex-grow min-w-0">
            <div className="flex items-center gap-2">
                <div className="text-sm font-bold text-gray-800 line-clamp-1">{item.collection}</div>
                
                {isDiscount && <span className="text-[9px] bg-red-100 text-red-600 px-1 rounded font-bold flex items-center"><Percent size={8} className="mr-0.5"/> SALE</span>}
                {isNFS && <span className="text-[9px] bg-gray-200 text-gray-600 px-1 rounded font-bold flex items-center"><AlertCircle size={8} className="mr-0.5"/> NFS</span>}
                {isUpcoming && <span className="text-[9px] bg-blue-100 text-blue-600 px-1 rounded font-bold flex items-center"><Clock size={8} className="mr-0.5"/> ETA</span>}
                
                {isBooked && (
                    <span className="text-[9px] bg-indigo-100 text-indigo-600 px-1 rounded font-bold flex items-center">
                        <Book size={8} className="mr-0.5"/> BOOK
                    </span>
                )}

                {isNoStock && (
                    <span className="text-[9px] bg-orange-100 text-orange-600 px-1 rounded font-bold flex items-center">
                        <XCircle size={8} className="mr-0.5"/> 
                        <span className="decoration-orange-600 line-through">STK</span>
                    </span>
                )}
            </div>
            
            <div className="text-[10px] text-gray-500 font-medium">
            {item.code} 
            {activeTab !== 'BRAND' && <span className="text-primary/70"> • {item.brand}</span>}
            </div>
        </div>
        
        <div className="flex flex-col items-end justify-center min-w-[50px]">
            <span className={clsx("text-xs font-bold", item.total_stock > 0 ? "text-primary" : "text-gray-300")}>
                {item.total_stock}
            </span>
        </div>
        </div>
    );
  };

  return (
    <>
        <Layout 
            activeTab={activeTab} 
            onTabChange={(tab) => {
                setActiveTab(tab);
                setSearchQuery(''); 
            }}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onMenuClick={() => setSidebarOpen(true)}
        >
        {loading ? (
            <div className="p-10 text-center text-gray-400 text-sm animate-pulse flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            Syncing Inventory...
            </div>
        ) : (
            <div className="pb-10">
                <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm border-b border-gray-200 px-4 py-2 flex justify-between items-center shadow-sm">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        {searchQuery ? (
                            <>Found {treeData.reduce((acc, node) => acc + getGroupCount(node), 0)} items</>
                        ) : (
                            <>{treeData.length} Groups</>
                        )}
                    </span>
                    
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => handleRefresh()}
                            disabled={loading}
                            className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary-dark transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> 
                            SYNC
                        </button>

                        <div className="h-4 w-px bg-gray-300 mx-1"></div>

                        <button 
                            onClick={handleExpandAll}
                            className="flex items-center gap-1 text-[10px] font-bold text-gray-600 hover:text-primary transition-colors"
                        >
                            <ChevronsDown size={14} /> EXPAND
                        </button>
                        <button 
                            onClick={handleCollapseAll}
                            className="flex items-center gap-1 text-[10px] font-bold text-gray-600 hover:text-primary transition-colors"
                        >
                            <ChevronsUp size={14} /> COLLAPSE
                        </button>
                    </div>
                </div>

                {treeData.map(node => renderNode(node))}
                
                {treeData.length === 0 && (
                    <div className="p-10 text-center text-gray-400 text-sm">No items found.</div>
                )}
            </div>
        )}
        </Layout>

        <Sidebar 
            isOpen={isSidebarOpen} 
            onClose={() => setSidebarOpen(false)} 
            onAddItem={handleAddClick}
            onImport={handleImportClick}
            onManageDiscounts={handleManageDiscountsClick}
            onOpenActiveBookings={() => setIsActiveBookingsOpen(true)} 
            onManageRates={() => setIsRateModalOpen(true)} // [NEW] Pass Handler
        />

        <ProductDetailModal 
            product={selectedProduct} 
            isOpen={!!selectedProduct} 
            onClose={() => setSelectedProduct(null)} 
            onEdit={() => selectedProduct && handleEditClick(selectedProduct)}
            onRefresh={handleRefresh} 
            currentRates={rates} // [NEW] Pass Rates
        />

        <ProductFormModal 
            isOpen={isFormOpen}
            mode={formMode}
            initialData={productToEdit}
            existingProducts={products} 
            currentRates={rates} // [NEW] Pass Rates
            onClose={() => setIsFormOpen(false)}
            onSuccess={handleRefresh}
        />
        
        <ImportModal
            isOpen={isImportOpen}
            onClose={() => setIsImportOpen(false)}
            onSuccess={handleRefresh}
            existingProducts={products} 
        />
        
        <DiscountManagerModal 
            isOpen={isDiscountManagerOpen}
            onClose={() => setIsDiscountManagerOpen(false)}
            onSuccess={handleRefresh} 
        />

        <ActiveBookingsModal 
            isOpen={isActiveBookingsOpen}
            onClose={() => setIsActiveBookingsOpen(false)}
            onSuccess={handleRefresh}
        />

        {/* [NEW] Exchange Rate Modal */}
        <ExchangeRateModal 
            isOpen={isRateModalOpen}
            onClose={() => setIsRateModalOpen(false)}
            currentRates={rates}
            onSuccess={() => fetchProducts(true)} 
        />
    </>
  );
}

export default App;