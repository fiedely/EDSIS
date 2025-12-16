from firebase_functions import https_fn
from firebase_admin import initialize_app, firestore, storage
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

# --- DISCOUNT API ---
@https_fn.on_request(region="asia-southeast2")
def get_discounts(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        docs = db.collection('discounts').stream()
        discounts = []
        for doc in docs:
            d = doc.to_dict()
            d['id'] = doc.id
            discounts.append(serialize_doc(d))
        return https_fn.Response(json.dumps({'data': discounts}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

@https_fn.on_request(region="asia-southeast2")
def manage_discount(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        data = req.get_json()
        mode = data.get('mode')
        discount_data = data.get('discount')
        
        if not discount_data:
            return https_fn.Response("Missing discount data", status=400, headers=headers)

        discount_id = discount_data.get('id')

        if mode == 'DELETE':
            if discount_id:
                db.collection('discounts').document(discount_id).delete()
            return https_fn.Response(json.dumps({'success': True}), status=200, headers=headers, mimetype='application/json')

        # ADD / EDIT
        if not discount_id:
             discount_id = str(uuid.uuid4())
             discount_data['id'] = discount_id
        
        # --- NEW: UNIQUE NAME CHECK ---
        target_name = discount_data.get('name', '').strip()
        if target_name:
            # Check if any other discount has this name
            existing = db.collection('discounts').where('name', '==', target_name).stream()
            for doc in existing:
                if doc.id != discount_id:
                    return https_fn.Response(f"Error: Discount name '{target_name}' already exists.", status=400, headers=headers)
        # -----------------------------

        discount_data['value'] = float(discount_data.get('value', 0))
        discount_data['is_active'] = bool(discount_data.get('is_active', True))

        # 1. Update Master Rule
        db.collection('discounts').document(discount_id).set(discount_data, merge=True)

        # 2. CASCADE UPDATE: Update all products using this discount
        if mode == 'EDIT':
            # Find all products that have this discount_id
            affected_products = db.collection('products').where('discount_ids', 'array_contains', discount_id).stream()
            
            batch = db.batch()
            batch_count = 0
            
            for doc in affected_products:
                prod = doc.to_dict()
                discounts = prod.get('discounts', [])
                updated = False
                
                # Update the specific discount entry inside the array
                for d in discounts:
                    if d.get('id') == discount_id:
                        d['name'] = discount_data['name']
                        d['value'] = discount_data['value']
                        updated = True
                
                if updated:
                    # Recalculate Nett Price
                    retail = prod.get('retail_price_idr', 0)
                    current_price = retail
                    for d in discounts:
                        val = float(d.get('value', 0))
                        current_price = current_price * ((100 - val) / 100)
                    
                    batch.update(doc.reference, {
                        'discounts': discounts,
                        'nett_price_idr': int(current_price)
                    })
                    batch_count += 1
                
                if batch_count >= 400:
                    batch.commit()
                    batch = db.batch()
                    batch_count = 0
            
            if batch_count > 0:
                batch.commit()

        return https_fn.Response(json.dumps({'success': True, 'id': discount_id}), status=200, headers=headers, mimetype='application/json')

    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

# --- PRODUCT WRITE FUNCTIONS ---

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
        
        if product_data.get('brand'):
            product_data['brand'] = product_data['brand'].strip().upper()
        if product_data.get('category'):
            product_data['category'] = product_data['category'].strip().title()

        discount_ids = []
        for d in product_data.get('discounts', []):
            if d.get('id'):
                discount_ids.append(d.get('id'))
        product_data['discount_ids'] = discount_ids

        db.collection('products').document(product_id).set(product_data, merge=True)

        if mode == 'ADD':
            initial_qty = product_data.get('total_stock', 0)
            batch = db.batch()
            for i in range(initial_qty):
                new_item_ref = db.collection('inventory_items').document()
                qr_content = f"ED-{product_id}-{uuid.uuid4().hex[:6].upper()}"
                status = 'AVAILABLE'
                if product_data.get('is_not_for_sale'): status = 'NOT_FOR_SALE'

                item_data = {
                    'product_id': product_id,
                    'product_name': f"{product_data.get('brand')} - {product_data.get('collection')}",
                    'qr_code': qr_content,
                    'status': status,
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
        if not product_id: return https_fn.Response("Missing product_id", status=400, headers=headers)

        doc_ref = db.collection('products').document(product_id)
        doc = doc_ref.get()
        if doc.exists:
            product_data = doc.to_dict()
            image_url = product_data.get('image_url')
            if image_url:
                try:
                    bucket = storage.bucket()
                    bucket.blob(image_url).delete()
                except: pass
            doc_ref.delete()

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
        if count > 0: batch.commit()

        return https_fn.Response(json.dumps({'success': True}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

@https_fn.on_request(region="asia-southeast2")
def bulk_import_products(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        data = req.get_json()
        new_products = data.get('products', [])
        
        if not new_products: return https_fn.Response("No products", status=400, headers=headers)

        batch = db.batch()
        count = 0
        
        now = datetime.datetime.now()
        timestamp_str = now.strftime("%Y%m%d-%H%M")
        random_str = uuid.uuid4().hex[:4].upper()
        batch_name = f"IMPORT-{timestamp_str}-{random_str}"

        session_discounts = {} 

        for p_data in new_products:
            # --- DISCOUNT PROCESSING ---
            raw_discounts = p_data.get('discounts', [])
            processed_discounts = []
            discount_ids = []
            
            for d in raw_discounts:
                try:
                    val = float(d.get('value', 0))
                    if val > 0:
                        if val in session_discounts:
                            rule = session_discounts[val] 
                            rule_id, rule_name = rule
                        else:
                            new_rule_id = str(uuid.uuid4())
                            display_val = int(val) if val.is_integer() else val
                            rule_name = f"Imported {display_val}% [{batch_name}]"
                            
                            rule_doc = {
                                'id': new_rule_id,
                                'name': rule_name,
                                'value': val,
                                'is_active': True,
                                'created_at': now
                            }
                            batch.set(db.collection('discounts').document(new_rule_id), rule_doc)
                            count += 1
                            session_discounts[val] = (new_rule_id, rule_name)
                            rule_id = new_rule_id
                        
                        processed_discounts.append({
                            'id': rule_id, 
                            'name': rule_name,
                            'value': val
                        })
                        discount_ids.append(rule_id)
                except:
                    pass
            
            p_data['discounts'] = processed_discounts
            p_data['discount_ids'] = discount_ids

            # --- PRODUCT CREATION ---
            # FIX: Added .strip() to remove trailing spaces
            brand_clean = p_data.get('brand', '').strip().upper()
            category_clean = p_data.get('category', '').strip().title()
            collection_clean = p_data.get('collection', '').strip()
            code_clean = p_data.get('code', '').strip()

            product_id = str(uuid.uuid4()) 
            
            product_doc = {
                'id': product_id,
                'brand': brand_clean,
                'category': category_clean,
                'collection': collection_clean,
                'code': code_clean,
                'image_url': p_data.get('image_url', ''), 
                'detail': p_data.get('detail', ''),
                'retail_price_idr': int(p_data.get('retail_price_idr', 0)),
                'total_stock': int(p_data.get('total_stock', 0)),
                'created_at': now,
                
                'nett_price_idr': int(p_data.get('nett_price_idr', 0)),
                'discounts': processed_discounts,
                'discount_ids': discount_ids,
                'is_not_for_sale': p_data.get('is_not_for_sale', False),
                'is_upcoming': p_data.get('is_upcoming', False),
                'upcoming_eta': p_data.get('upcoming_eta', ''),
            }
            
            ref = db.collection('products').document(product_id)
            batch.set(ref, product_doc)
            count += 1

            qty = product_doc['total_stock']
            for i in range(qty):
                item_ref = db.collection('inventory_items').document()
                qr_content = f"ED-{product_id}-{uuid.uuid4().hex[:6].upper()}"
                status = 'AVAILABLE'
                if product_doc['is_not_for_sale']: status = 'NOT_FOR_SALE'
                
                item_data = {
                    'product_id': product_id,
                    'product_name': f"{product_doc['brand']} - {product_doc['collection']}",
                    'qr_code': qr_content,
                    'status': status,
                    'current_location': p_data.get('location', 'Warehouse (Import)'),
                    'created_at': now,
                    'history_log': [{
                        'action': 'BULK_IMPORT',
                        'batch_id': batch_name,
                        'location': p_data.get('location', 'Warehouse (Import)'),
                        'date': now,
                        'note': f'Imported via Batch {batch_name}'
                    }]
                }
                batch.set(item_ref, item_data)
                count += 1

            if count >= 400:
                batch.commit()
                batch = db.batch()
                count = 0

        if count > 0:
            batch.commit()

        return https_fn.Response(json.dumps({'success': True, 'count': len(new_products), 'batch_id': batch_name}), status=200, headers=headers, mimetype='application/json')

    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)