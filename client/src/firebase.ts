import { initializeApp } from "firebase/app";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// 1. Firebase Configuration
// Since we are using Emulators, these values can be placeholders.
const firebaseConfig = {
  apiKey: "demo-key",
  authDomain: "edievo-project.firebaseapp.com",
  projectId: "edievo-project",
  storageBucket: "edievo-project.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123456"
};

// 2. Initialize App
const app = initializeApp(firebaseConfig);

// 3. Initialize Storage
export const storage = getStorage(app);

// 4. Connect to Emulator (Local Development Mode)
// This tells the app to look at localhost:9199 instead of the real cloud
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    connectStorageEmulator(storage, "127.0.0.1", 9199);
}