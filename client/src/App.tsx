import React, { useEffect, useState } from 'react';

function App() {
  const [backendStatus, setBackendStatus] = useState<string>("Checking connection...");

  // Simple test to hit the Python Backend
  const checkBackend = async () => {
    try {
      // Note: 5001 is the default functions emulator port
      const response = await fetch('http://127.0.0.1:5001/edievo-project/asia-southeast2/health_check');
      const text = await response.text();
      setBackendStatus(text);
    } catch (error) {
      console.error(error);
      setBackendStatus("Error connecting to Backend (Is Emulator running?)");
    }
  };

  useEffect(() => {
    checkBackend();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* 1. Navbar - Tests Primary Color (Maroon) & Sharp Corners */}
      <nav className="bg-primary text-secondary p-4 shadow-md w-full">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-wider">EDSIS <span className="font-light text-sm">v1.0</span></h1>
          <div className="text-sm font-medium">Elementi Domus Smart Inventory</div>
        </div>
      </nav>

      {/* 2. Main Content - Tests Font (Montserrat) & Gray Background */}
      <main className="flex-grow p-8 max-w-7xl mx-auto w-full">
        <div className="bg-white p-8 border border-gray-200 shadow-sm mb-6">
          <h2 className="text-primary font-bold text-xl mb-4 border-b border-gray-200 pb-2">
            System Status
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: Frontend Check */}
            <div className="bg-gray-50 p-6 border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-2">Frontend Engine</h3>
              <p className="text-green-700 font-medium">✓ React + Vite Running</p>
              <p className="text-green-700 font-medium">✓ Tailwind Maroon Theme Active</p>
              <p className="text-green-700 font-medium">✓ Font is Montserrat</p>
            </div>

            {/* Card 2: Backend Check */}
            <div className="bg-gray-50 p-6 border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-2">Backend Engine</h3>
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 ${backendStatus.includes("Operational") ? "bg-green-500" : "bg-red-500"}`}></span>
                <p className="text-sm text-gray-600">{backendStatus}</p>
              </div>
              <button 
                onClick={checkBackend}
                className="mt-4 bg-primary hover:bg-primary-dark text-white px-6 py-2 text-sm uppercase tracking-wide transition-colors"
              >
                Retry Connection
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Footer */}
      <footer className="bg-gray-800 text-white p-4 text-center text-xs">
        &copy; 2025 Elementi Domus. System ID: ED-PROJECT
      </footer>
    </div>
  );
}

export default App;