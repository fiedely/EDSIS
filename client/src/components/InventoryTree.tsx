import { useMemo, useState } from 'react';
import { buildProductTree, type GroupNode } from '../utils';
import type { Product } from '../types';
import { ChevronDown, ChevronRight, Layers, Percent, AlertCircle, Clock, Book, XCircle, RefreshCw, ChevronsDown, ChevronsUp } from 'lucide-react';
import clsx from 'clsx';
import StorageImage from './StorageImage';

interface Props {
  products: Product[];
  activeTab: string;
  searchQuery: string;
  loading: boolean;
  onSelectProduct: (p: Product) => void;
  onRefresh: () => void;
}

// Helper for Status Tree Building
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

export default function InventoryTree({ products, activeTab, searchQuery, loading, onSelectProduct, onRefresh }: Props) {
  const [expandedState, setExpandedState] = useState<Record<string, Set<string>>>({
    BRAND: new Set(),
    CATEGORY: new Set(),
    STATUS: new Set(),
    LOCATION: new Set()
  });

  const currentExpandedKeys = expandedState[activeTab] || new Set();

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

  const treeData = useMemo(() => {
    const filtered = products.filter(p => {
      if (searchQuery) {
        const terms = searchQuery.toLowerCase().split(',').map(t => t.trim()).filter(t => t.length > 0);
        if (terms.length > 0) {
            const searchableText = `${p.brand} ${p.category} ${p.collection} ${p.code} ${p.manufacturer_code || ''}`.toLowerCase();
            const matches = terms.every(term => searchableText.includes(term));
            if (!matches) return false;
        }
      }

      if (activeTab === 'BRAND' || activeTab === 'CATEGORY') {
          if (p.is_not_for_sale || p.is_upcoming) return false;
      }
      
      return true;
    });

    if (activeTab === 'STATUS') {
        return buildStatusTree(filtered);
    }

    let levels: string[] = [];
    if (activeTab === 'BRAND') levels = ['brand', 'category'];
    if (activeTab === 'CATEGORY') levels = ['category', 'brand'];
    if (activeTab === 'LOCATION') levels = ['current_location', 'brand', 'category'];

    return buildProductTree(filtered, levels);
  }, [products, activeTab, searchQuery]);

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

  const getGroupCount = (node: GroupNode): number => node.items.length;
  const getTotalItems = () => treeData.reduce((acc, node) => acc + getGroupCount(node), 0);

  const renderItemCard = (item: Product) => {
    const isDiscount = item.discounts && item.discounts.length > 0;
    const isNFS = item.is_not_for_sale;
    const isUpcoming = item.is_upcoming;
    const isNoStock = item.total_stock === 0;
    const isBooked = item.booked_stock > 0; 

    return (
        <div 
            key={item.id} 
            onClick={() => onSelectProduct(item)} 
            className="p-3 flex gap-3 border-b border-gray-200/50 last:border-0 hover:bg-white transition-colors cursor-pointer group bg-white relative"
        >
        <div className="w-12 h-12 flex-shrink-0 bg-gray-100 border border-gray-200 overflow-hidden relative">
            <StorageImage 
                filename={item.image_url} 
                alt={item.collection} 
                className="w-full h-full object-cover" 
            />
            {isNFS && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[8px] text-white font-bold text-center leading-tight">NOT FOR<br/>SALE</div>}
            {isUpcoming && <div className="absolute inset-0 bg-gray-900/60 flex items-center justify-center text-[8px] text-white font-bold text-center leading-tight">SOON</div>}
        </div>

        <div className="flex-grow min-w-0">
            <div className="flex items-center gap-2">
                <div className="text-sm font-bold text-gray-800 line-clamp-1">{item.collection}</div>
                
                {isDiscount && <span className="text-[9px] bg-primary/10 text-primary px-1 rounded font-bold flex items-center"><Percent size={8} className="mr-0.5"/> SALE</span>}
                {isNFS && <span className="text-[9px] bg-gray-200 text-gray-600 px-1 rounded font-bold flex items-center"><AlertCircle size={8} className="mr-0.5"/> NFS</span>}
                {isUpcoming && <span className="text-[9px] bg-gray-100 text-gray-600 px-1 rounded font-bold flex items-center"><Clock size={8} className="mr-0.5"/> ETA</span>}
                
                {isBooked && (
                    <span className="text-[9px] bg-primary/10 text-primary px-1 rounded font-bold flex items-center">
                        <Book size={8} className="mr-0.5"/> BOOK
                    </span>
                )}

                {isNoStock && (
                    <span className="text-[9px] bg-gray-100 text-gray-400 px-1 rounded font-bold flex items-center">
                        <XCircle size={8} className="mr-0.5"/> 
                        <span className="decoration-gray-400 line-through">STK</span>
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

  if (loading) {
    return (
        <div className="p-10 text-center text-gray-400 text-sm animate-pulse flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            Syncing Inventory...
        </div>
    );
  }

  return (
    <div className="pb-10">
        <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm border-b border-gray-200 px-4 py-2 flex justify-between items-center shadow-sm">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                {searchQuery ? (
                    <>Found {getTotalItems()} items</>
                ) : (
                    <>{treeData.length} Groups</>
                )}
            </span>
            
            <div className="flex items-center gap-4">
                <button 
                    onClick={onRefresh}
                    disabled={loading}
                    className="flex items-center gap-1 text-[10px] font-bold text-gray-600 hover:text-primary transition-colors disabled:opacity-50"
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
  );
}