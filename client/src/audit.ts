import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';

// Define the structure of a Log Entry
export interface AuditLog {
  action: string;       // e.g., "ITEM_ADDED", "ITEM_DELETED", "LOGIN"
  target: string;       // e.g., "Product: Blueside-Glenda"
  performedBy: string;  // User ID or Email
  timestamp: Date;
  details?: unknown;    // Flexible object for extra info
}

// The Logger Function
export const logActivity = async (
  action: string, 
  target: string, 
  user: string = 'guest', // Default to guest until Auth is built
  details: unknown = {}
) => {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      action,
      target,
      performedBy: user,
      timestamp: new Date(),
      details
    });
    console.log(`[AUDIT] ${action}: ${target}`);
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
};