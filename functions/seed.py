import pandas as pd
import firebase_admin
from firebase_admin import firestore
import google.auth.credentials
import uuid
import datetime
import os

# --- CONFIGURATION ---
CSV_FILENAME = 'ED-Stock master data - In Stock.csv'
PROJECT_ID = 'edievo-project'

# 1. Setup - Connect to Firestore Emulator
# These environment variables are CRITICAL.
os.environ["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080"
os.environ["GCLOUD_PROJECT"] = PROJECT_ID

# --- THE BYPASS: Mock Credential Class ---
# Instead of feeding a fake key string, we create a fake Object.
# The SDK accepts this because it looks like a Credential object,
# but it doesn't try to validate any keys.
class MockCredentials(google.auth.credentials.Credentials):
    def refresh(self, request):
        pass # Do nothing

if not firebase_admin._apps:
    # Initialize using the Mock Credentials
    firebase_admin.initialize_app(credential=MockCredentials())

db = firestore.client()

def clean_price(price_str):
    """Helper to turn 'Rp 7,942,000' into integer 7942000"""
    if pd.isna(price_str): return 0
    clean_str = str(price_str).replace('Rp', '').replace(',', '').replace('.', '').strip()
    try:
        return int(clean_str)
    except ValueError:
        return 0

def seed_database():
    print(f"--- STARTING MIGRATION FOR {PROJECT_ID} ---")
    
    # 2. Check CSV
    if not os.path.exists(CSV_FILENAME):
        print(f"ERROR: Could not find '{CSV_FILENAME}' inside the 'functions' folder.")
        print("Please move the file there and try again.")
        return

    print("Reading CSV file...")
    try:
        df = pd.read_csv(CSV_FILENAME)
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return

    print(f"Found {len(df)} rows. Processing...")

    batch = db.batch()
    batch_counter = 0
    total_products = 0
    total_items = 0

    for index, row in df.iterrows():
        # --- A. Prepare Data ---
        sku_id = str(row[' unique id'])
        
        brand = str(row['brand']).strip() if pd.notna(row['brand']) else "Unknown Brand"
        category = str(row['category']).strip() if pd.notna(row['category']) else "Uncategorized"
        collection = str(row['collection']).strip() if pd.notna(row['collection']) else ""
        code = str(row['code']).strip() if pd.notna(row['code']) else ""
        location = str(row['location']).strip() if pd.notna(row['location']) else "Unknown Location"
        
        try:
            qty = int(float(row['quantity'])) if pd.notna(row['quantity']) else 0
        except:
            qty = 0

        # --- B. Create Master Product ---
        product_ref = db.collection('products').document(sku_id)
        
        # Search Keywords
        search_text = f"{brand} {category} {collection} {code}".lower()
        search_keywords = search_text.split()

        product_data = {
            'id': sku_id,
            'brand': brand,
            'category': category,
            'collection': collection,
            'code': code,
            'image_url': row['image'] if pd.notna(row['image']) else "",
            'dimensions': row['size'] if pd.notna(row['size']) else "",
            'finishing': row['finishing'] if pd.notna(row['finishing']) else "",
            'retail_price_eur': row['retail price in euro'] if pd.notna(row['retail price in euro']) else 0,
            'retail_price_idr': clean_price(row['retail price']),
            'total_stock': qty,
            'search_keywords': search_keywords,
            'created_at': datetime.datetime.now()
        }
        batch.set(product_ref, product_data)
        batch_counter += 1
        total_products += 1

        # --- C. Create Inventory Items ---
        for i in range(qty):
            new_item_ref = db.collection('inventory_items').document()
            
            qr_content = f"ED-{sku_id}-{uuid.uuid4().hex[:6].upper()}"

            item_data = {
                'product_id': sku_id,
                'product_name': f"{brand} - {collection}",
                'qr_code': qr_content,
                'status': 'AVAILABLE', 
                'current_location': location,
                'created_at': datetime.datetime.now(),
                'history_log': [
                    {
                        'action': 'INITIAL_IMPORT',
                        'location': location,
                        'timestamp': datetime.datetime.now(),
                        'note': 'Migrated from CSV Bulk Data'
                    }
                ]
            }
            batch.set(new_item_ref, item_data)
            batch_counter += 1
            total_items += 1

        if batch_counter >= 400:
            batch.commit()
            print(f"Saved progress... ({total_products} products, {total_items} items)")
            batch = db.batch()
            batch_counter = 0

    if batch_counter > 0:
        batch.commit()

    print("------------------------------------------------")
    print(" MIGRATION SUCCESSFUL! ")
    print(f" Total Master Products: {total_products}")
    print(f" Total Trackable Items: {total_items}")
    print("------------------------------------------------")

if __name__ == "__main__":
    seed_database()