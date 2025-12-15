import React, { useEffect, useState } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../firebase';
import { Image, Package, AlertCircle } from 'lucide-react';

interface Props {
  filename: string;
  alt: string;
  className?: string;
}

const StorageImage: React.FC<Props> = ({ filename, alt, className }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!filename) {
        setLoading(false);
        return;
    }

    const fetchUrl = async () => {
      setLoading(true);
      setError(false);
      
      try {
        const storageRef = ref(storage, filename); 
        const url = await getDownloadURL(storageRef);
        setImageUrl(url);
      } catch (err) {
        // Safe error handling
        const firebaseErr = err as { code?: string; message?: string };
        console.warn(`[StorageImage] Failed to load: "${filename}"`);
        if (firebaseErr.code !== 'storage/object-not-found') {
             console.error("Reason:", firebaseErr.code, firebaseErr.message);
        }
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchUrl();
  }, [filename]);

  // Shared container styles for placeholders
  const placeholderClass = `flex flex-col items-center justify-center text-gray-300 border border-gray-200 overflow-hidden ${className}`;

  if (!filename || error) {
    return (
      <div className={`bg-gray-100 ${placeholderClass}`} title={filename || "No Image"}>
        {error ? <AlertCircle size={24} className="text-gray-300 mb-1" /> : <Package size={24} className="mb-1" />}
        {/* Only show text if the box is big enough (heuristic: checks if 'h-full' or explicit height is used) */}
        <span className="text-[8px] uppercase font-bold tracking-widest text-center px-1">
            {error ? "Not Found" : "No Image"}
        </span>
      </div>
    );
  }

  if (loading || !imageUrl) {
    return (
      <div className={`bg-gray-50 animate-pulse ${placeholderClass}`}>
        <Image size={24} className="text-gray-200" />
      </div>
    );
  }

  return (
    <img 
      src={imageUrl} 
      alt={alt} 
      // Changed: Removed 'object-cover' so parent can decide
      className={className} 
    />
  );
};

export default StorageImage;