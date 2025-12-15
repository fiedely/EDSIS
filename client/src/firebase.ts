import { initializeApp } from "firebase/app";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

// 1. Firebase Configuration
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

// 3. Initialize Services
export const storage = getStorage(app);
export const db = getFirestore(app);

// 4. Connect to Emulators (Local Development Mode)
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
}