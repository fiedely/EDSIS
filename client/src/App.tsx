import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Sidebar from './components/Sidebar';
import InventoryTree from './components/InventoryTree';
import ProductDetailModal from './components/ProductDetailModal';
import ProductFormModal from './components/ProductFormModal';
import ImportModal from './components/ImportModal';
import DiscountManagerModal from './components/DiscountManagerModal';
import ActiveBookingsModal from './components/ActiveBookingsModal';
import ExchangeRateModal from './components/ExchangeRateModal'; 
import ExportModal from './components/ExportModal'; 
import { useInventory } from './hooks/useInventory';
import type { Product } from './types';

function App() {
  // --- UI State ---
  const [activeTab, setActiveTab] = useState('BRAND');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  // --- Data & Business Logic (via Hook) ---
  const { products, rates, loading, fetchProducts } = useInventory();

  // --- Modal States ---
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'ADD' | 'EDIT'>('ADD');
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDiscountManagerOpen, setIsDiscountManagerOpen] = useState(false);
  const [isActiveBookingsOpen, setIsActiveBookingsOpen] = useState(false);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Initial Fetch
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // --- Handlers ---

  const handleEditClick = (product: Product) => {
    setFormMode('EDIT');
    setProductToEdit(product);
    setIsFormOpen(true);
  };

  const handleAddClick = () => {
    setFormMode('ADD');
    setProductToEdit(null);
    setIsFormOpen(true);
  };

  const handleRefresh = async () => {
    // [FIX] Cast the result to Product[] so TypeScript knows what 'p' is below
    const newProducts = (await fetchProducts(true)) as Product[]; 
    
    // If a product is currently open in the Detail Modal, update its data live
    if (selectedProduct) {
        const updatedItem = newProducts.find(p => p.id === selectedProduct.id);
        setSelectedProduct(updatedItem || null);
    }
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
            <InventoryTree 
                products={products}
                activeTab={activeTab}
                searchQuery={searchQuery}
                loading={loading}
                onSelectProduct={setSelectedProduct}
                onRefresh={handleRefresh}
            />
        </Layout>

        <Sidebar 
            isOpen={isSidebarOpen} 
            onClose={() => setSidebarOpen(false)} 
            onAddItem={handleAddClick}
            onImport={() => setIsImportOpen(true)}
            onManageDiscounts={() => setIsDiscountManagerOpen(true)}
            onOpenActiveBookings={() => setIsActiveBookingsOpen(true)} 
            onManageRates={() => setIsRateModalOpen(true)}
            onExport={() => setIsExportOpen(true)}
        />

        {/* --- Modals --- */}
        
        <ProductDetailModal 
            product={selectedProduct} 
            isOpen={!!selectedProduct} 
            onClose={() => setSelectedProduct(null)} 
            onEdit={() => selectedProduct && handleEditClick(selectedProduct)}
            onRefresh={handleRefresh} 
            currentRates={rates} 
        />

        <ProductFormModal 
            isOpen={isFormOpen}
            mode={formMode}
            initialData={productToEdit}
            existingProducts={products} 
            currentRates={rates} 
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

        <ExchangeRateModal 
            isOpen={isRateModalOpen}
            onClose={() => setIsRateModalOpen(false)}
            currentRates={rates}
            onSuccess={() => fetchProducts(true)} 
        />

        <ExportModal 
            isOpen={isExportOpen}
            onClose={() => setIsExportOpen(false)}
        />
    </>
  );
}

export default App;