import type { Product } from './types';

export interface GroupNode {
  key: string;
  items: Product[];       
  subgroups: GroupNode[]; 
  level: number;
}

export const buildProductTree = (
  products: Product[], 
  levels: string[]
): GroupNode[] => {
  
  const groupRecursive = (items: Product[], currentLevelIndex: number): GroupNode[] => {
    if (currentLevelIndex >= levels.length) {
      return [];
    }

    const field = levels[currentLevelIndex];
    const groups: Record<string, Product[]> = {};

    items.forEach(item => {
      // FIX: Double cast (Product -> unknown -> Record) to bypass the overlap check
      const rawValue = (item as unknown as Record<string, unknown>)[field];
      
      // Ensure the key is a string and exists, otherwise default to 'Unknown'
      const key = typeof rawValue === 'string' && rawValue ? rawValue : 'Unknown';
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    return Object.entries(groups)
      .sort((a, b) => a[0].localeCompare(b[0])) // Sorts the Groups (A-Z)
      .map(([key, groupItems]) => ({
        key,
        // [NEW] Sort the Items inside the group by Collection Name
        items: groupItems.sort((a, b) => a.collection.localeCompare(b.collection)),
        level: currentLevelIndex,
        subgroups: groupRecursive(groupItems, currentLevelIndex + 1)
      }));
  };

  return groupRecursive(products, 0);
};