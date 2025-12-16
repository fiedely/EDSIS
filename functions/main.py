from firebase_functions import https_fn
from firebase_admin import initialize_app, firestore, storage # <--- Added storage
import firebase_admin
import json
import datetime
import uuid

if not firebase_admin._apps:
    initialize_app()

db = firestore.client()

def serialize_doc(doc_dict):
    if not doc_dict: return {}
    for key, value in doc_dict.items():
        if isinstance(value, datetime.datetime):
            doc_dict[key] = value.isoformat()
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    serialize_doc(item)
    return doc_dict

# --- READ FUNCTIONS ---

@https_fn.on_request(region="asia-southeast2")
def get_all_products(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)
    
    try:
        docs = db.collection('products').stream()
        products = [serialize_doc(doc.to_dict()) for doc in docs]
        return https_fn.Response(json.dumps({'data': products}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

@https_fn.on_request(region="asia-southeast2")
def get_product_inventory(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)
    
    product_id = req.args.get('product_id')
    if not product_id: return https_fn.Response("Missing product_id", status=400, headers=headers)

    try:
        query = db.collection('inventory_items').where('product_id', '==', product_id).stream()
        inventory = []
        for doc in query:
            d = doc.to_dict()
            d['id'] = doc.id
            inventory.append(serialize_doc(d))
        return https_fn.Response(json.dumps({'data': inventory}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

# --- WRITE FUNCTIONS ---

@https_fn.on_request(region="asia-southeast2")
def manage_product(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        data = req.get_json()
        mode = data.get('mode')
        product_data = data.get('product')
        
        if not product_data:
            return https_fn.Response("Missing product data", status=400, headers=headers)

        product_id = product_data.get('id')
        if not product_id:
             product_id = str(uuid.uuid4())
             product_data['id'] = product_id
        
        product_data['retail_price_idr'] = int(product_data.get('retail_price_idr', 0))
        product_data['total_stock'] = int(product_data.get('total_stock', 0))
        
        # Enforce Casing
        if product_data.get('brand'):
            product_data['brand'] = product_data['brand'].strip().upper()
        
        if product_data.get('category'):
            cat = product_data['category'].strip()
            product_data['category'] = cat.title() 

        db.collection('products').document(product_id).set(product_data, merge=True)

        if mode == 'ADD':
            initial_qty = product_data.get('total_stock', 0)
            batch = db.batch()
            
            for i in range(initial_qty):
                new_item_ref = db.collection('inventory_items').document()
                qr_content = f"ED-{product_id}-{uuid.uuid4().hex[:6].upper()}"
                
                item_data = {
                    'product_id': product_id,
                    'product_name': f"{product_data.get('brand')} - {product_data.get('collection')}",
                    'qr_code': qr_content,
                    'status': 'AVAILABLE',
                    'current_location': 'Warehouse (New)',
                    'created_at': datetime.datetime.now(),
                    'history_log': [{
                        'action': 'ITEM_CREATED',
                        'location': 'Warehouse (New)',
                        'date': datetime.datetime.now(),
                        'note': 'Initial Stock Creation'
                    }]
                }
                batch.set(new_item_ref, item_data)
            
            batch.commit()

        return https_fn.Response(json.dumps({'success': True, 'id': product_id}), status=200, headers=headers, mimetype='application/json')

    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

@https_fn.on_request(region="asia-southeast2")
def delete_product(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'DELETE', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        data = req.get_json()
        product_id = data.get('product_id')
        
        if not product_id:
            return https_fn.Response("Missing product_id", status=400, headers=headers)

        # 1. Fetch Product first to find Image URL
        doc_ref = db.collection('products').document(product_id)
        doc = doc_ref.get()
        
        if doc.exists:
            product_data = doc.to_dict()
            image_url = product_data.get('image_url')

            # --- NEW: Delete Image from Storage ---
            if image_url:
                try:
                    bucket = storage.bucket() # Uses default bucket
                    blob = bucket.blob(image_url)
                    blob.delete()
                    print(f"Deleted image: {image_url}")
                except Exception as img_err:
                    print(f"Warning: Could not delete image {image_url}: {img_err}")
                    # We continue deleting the product even if image delete fails
            
            # 2. Delete Master Product Document
            doc_ref.delete()

        # 3. Delete ALL associated inventory items
        items = db.collection('inventory_items').where('product_id', '==', product_id).stream()
        batch = db.batch()
        count = 0
        for item in items:
            batch.delete(item.reference)
            count += 1
            if count >= 400:
                batch.commit()
                batch = db.batch()
                count = 0
        
        if count > 0:
            batch.commit()

        return https_fn.Response(json.dumps({'success': True}), status=200, headers=headers, mimetype='application/json')

    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)