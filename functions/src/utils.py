import datetime
import re
import random

def serialize_doc(doc_dict):
    """
    Converts Firestore types (like datetime) to JSON serializable formats.
    Used recursively for nested dictionaries and lists.
    """
    if not doc_dict: return {}
    for key, value in doc_dict.items():
        if isinstance(value, datetime.datetime):
            doc_dict[key] = value.isoformat()
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    serialize_doc(item)
    return doc_dict

def get_4char_segment(text):
    """
    Generates a 4-character code from a string (e.g., 'Blue Side' -> 'BLSI').
    Used for constructing the base SKU parts.
    """
    if not text: return "XXXX"
    clean = re.sub(r'[^a-zA-Z0-9\s]', '', text)
    words = clean.split()
    
    code = ""
    if len(words) >= 2:
        code = (words[0][:2] + words[1][:2]).upper()
    elif len(words) == 1:
        code = words[0][:4].upper()
    
    if len(code) < 4:
        code = code.ljust(4, '1')
        
    return code

def resolve_sku_collision(base_sku, existing_skus):
    """
    Ensures the generated SKU is unique.
    If 'ABCD-EFGH-IJKL' exists, it tries 'ABCD-EFGH-IJK1', etc.
    """
    if base_sku not in existing_skus:
        return base_sku
    
    parts = base_sku.split('-')
    if len(parts) < 3: return f"{base_sku}-01"
    
    name_part = parts[2]
    prefix = f"{parts[0]}-{parts[1]}"
    base_name = name_part[:3]
    
    for i in range(1, 10):
        candidate_name = f"{base_name}{i}"
        candidate_sku = f"{prefix}-{candidate_name}"
        if candidate_sku not in existing_skus:
            return candidate_sku
            
    # Fallback to random suffix if 1-9 are taken
    return f"{base_sku}{random.randint(10,99)}"