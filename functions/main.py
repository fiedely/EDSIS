from firebase_functions import https_fn
from firebase_admin import initialize_app, firestore, storage
from google.cloud.firestore_v1.base_query import FieldFilter
import firebase_admin
import json
import datetime
import uuid
import re
import random

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

# --- SKU GENERATOR LOGIC ---

def get_4char_segment(text):
    if not text: return "XXXX"
    # Clean non-alphanumeric but keep spaces for word splitting
    clean = re.sub(r'[^a-zA-Z0-9\s]', '', text)
    words = clean.split()
    
    code = ""
    if len(words) >= 2:
        # First 2 chars of first 2 words
        code = (words[0][:2] + words[1][:2]).upper()
    elif len(words) == 1:
        # First 4 chars of single word
        code = words[0][:4].upper()
    
    # Pad with '1' if too short (e.g. "ACE" -> "ACE1")
    if len(code) < 4:
        code = code.ljust(4, '1')
        
    return code

def resolve_sku_collision(base_sku, existing_skus):
    """
    If SLAM-POLA-TUBA exists, try SLAM-POLA-TUB1, TUB2... TUB9.
    If those fill up, fall back to random suffix.
    """
    if base_sku not in existing_skus:
        return base_sku
    
    parts = base_sku.split('-')
    if len(parts) < 3: return f"{base_sku}-01" # Fallback
    
    name_part = parts[2] # The 3rd block is the name identifier
    prefix = f"{parts[0]}-{parts[1]}"
    
    # Strategy: Replace last char with 1-9
    base_name = name_part[:3] # First 3 chars
    
    for i in range(1, 10):
        candidate_name = f"{base_name}{i}"
        candidate_sku = f"{prefix}-{candidate_name}"
        if candidate_sku not in existing_skus:
            return candidate_sku
            
    # If all 1-9 are taken, add random integer suffix (Survival Mode)
    return f"{base_sku}{random.randint(10,99)}"

# --- HELPER: SYNC COUNTERS ---
def update_product_counters(product_id):
    items = db.collection('inventory_items').where('product_id', '==', product_id).stream()
    total = 0
    booked = 0
    sold = 0
    
    for item in items:
        data = item.to_dict()
        status = data.get('status', 'AVAILABLE')
        
        if status == 'SOLD':
            sold += 1
        else:
            total += 1 
        
        if status == 'BOOKED':
            booked += 1
            
    db.collection('products').document(product_id).update({
        'total_stock': total,
        'booked_stock': booked,
        'sold_stock': sold
    })

# --- EXCHANGE RATES ---

@https_fn.on_request(region="asia-southeast2")
def get_exchange_rates(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)
    
    try:
        doc = db.collection('settings').document('global').get()
        # Default Fallback if not set yet
        data = doc.to_dict() if doc.exists else {'eur_rate': 17000, 'usd_rate': 15500} 
        
        # [FIX] Serialize data to handle datetime objects
        serialized_data = serialize_doc(data)
        
        return https_fn.Response(json.dumps({'data': serialized_data}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

@https_fn.on_request(region="asia-southeast2")
def update_exchange_rates(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        data = req.get_json()
        rates = {
            'eur_rate': int(data.get('eur_rate', 0)),
            'usd_rate': int(data.get('usd_rate', 0)),
            'last_updated': datetime.datetime.now()
        }
        db.collection('settings').document('global').set(rates, merge=True)
        return https_fn.Response(json.dumps({'success': True}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

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

# --- SYSTEM JOB FUNCTIONS ---

@https_fn.on_request(region="asia-southeast2")
def check_expired_bookings(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        booked_items = db.collection('inventory_items').where('status', '==', 'BOOKED').stream()
        
        now = datetime.datetime.now()
        updated_products = set()
        count = 0
        batch = db.batch()
        
        for doc in booked_items:
            data = doc.to_dict()
            booking = data.get('booking', {})
            expired_str = booking.get('expired_at')
            
            if expired_str:
                try:
                    exp_date = datetime.datetime.fromisoformat(expired_str)
                    if now > exp_date:
                        update_data = {
                            'status': 'AVAILABLE',
                            'booking': firestore.DELETE_FIELD,
                            'history_log': firestore.ArrayUnion([{
                                'action': 'AUTO_RELEASED',
                                'location': data.get('current_location', ''),
                                'date': now,
                                'note': "Global expiration check"
                            }])
                        }
                        batch.update(doc.reference, update_data)
                        updated_products.add(data.get('product_id'))
                        count += 1
                except:
                    continue

            if count >= 400:
                batch.commit()
                batch = db.batch()
                count = 0
        
        if count > 0:
            batch.commit()

        for pid in updated_products:
            if pid: update_product_counters(pid)

        return https_fn.Response(json.dumps({'success': True, 'released_count': count}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

# --- ACTION FUNCTIONS ---

@https_fn.on_request(region="asia-southeast2")
def book_item(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        data = req.get_json()
        item_id = data.get('item_id')
        booked_by = data.get('booked_by', 'Unknown')
        system_user = data.get('system_user', 'System')
        notes = data.get('notes', '')
        expired_at_str = data.get('expired_at')
        
        if not expired_at_str:
             return https_fn.Response("Missing expiration date", status=400, headers=headers)

        doc_ref = db.collection('inventory_items').document(item_id)
        doc = doc_ref.get()
        if not doc.exists: return https_fn.Response("Item not found", status=404, headers=headers)
        
        item_data = doc.to_dict()
        if item_data.get('status') not in ['AVAILABLE', 'NOT_FOR_SALE']:
            return https_fn.Response("Item cannot be booked", status=400, headers=headers)

        try:
            exp_date = datetime.datetime.fromisoformat(expired_at_str).replace(hour=23, minute=59, second=59)
        except ValueError:
             return https_fn.Response("Invalid date format", status=400, headers=headers)
             
        now = datetime.datetime.now()

        update_data = {
            'status': 'BOOKED',
            'booking': {
                'booked_by': booked_by,
                'system_user': system_user,
                'booked_at': now.isoformat(),
                'expired_at': exp_date.isoformat(),
                'notes': notes
            },
            'history_log': firestore.ArrayUnion([{
                'action': 'BOOKED',
                'location': item_data.get('current_location', ''),
                'date': now,
                'note': f"Booked for {booked_by} by {system_user}"
            }])
        }
        
        doc_ref.update(update_data)
        update_product_counters(item_data['product_id'])
        
        return https_fn.Response(json.dumps({'success': True}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

@https_fn.on_request(region="asia-southeast2")
def release_item(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        data = req.get_json()
        item_id = data.get('item_id')
        
        doc_ref = db.collection('inventory_items').document(item_id)
        doc = doc_ref.get()
        item_data = doc.to_dict()
        
        update_data = {
            'status': 'AVAILABLE',
            'booking': firestore.DELETE_FIELD,
            'history_log': firestore.ArrayUnion([{
                'action': 'RELEASED',
                'location': item_data.get('current_location', ''),
                'date': datetime.datetime.now(),
                'note': "Booking released manually"
            }])
        }
        
        doc_ref.update(update_data)
        update_product_counters(item_data['product_id'])
        
        return https_fn.Response(json.dumps({'success': True}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

# --- MANAGEMENT FUNCTIONS ---

@https_fn.on_request(region="asia-southeast2")
def manage_discount(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        data = req.get_json()
        mode = data.get('mode')
        discount_data = data.get('discount')
        
        if not discount_data: return https_fn.Response("Missing data", status=400, headers=headers)
        discount_id = discount_data.get('id')

        if mode == 'DELETE':
            if discount_id: db.collection('discounts').document(discount_id).delete()
            return https_fn.Response(json.dumps({'success': True}), status=200, headers=headers, mimetype='application/json')

        if not discount_id:
             discount_id = str(uuid.uuid4())
             discount_data['id'] = discount_id
        
        target_name = discount_data.get('name', '').strip()
        if target_name:
            existing = db.collection('discounts').where('name', '==', target_name).stream()
            for doc in existing:
                if doc.id != discount_id:
                    return https_fn.Response(f"Error: Discount name '{target_name}' already exists.", status=400, headers=headers)

        discount_data['value'] = float(discount_data.get('value', 0))
        discount_data['is_active'] = bool(discount_data.get('is_active', True))

        db.collection('discounts').document(discount_id).set(discount_data, merge=True)

        if mode == 'EDIT':
            affected_products = db.collection('products').where('discount_ids', 'array_contains', discount_id).stream()
            batch = db.batch()
            batch_count = 0
            for doc in affected_products:
                prod = doc.to_dict()
                discounts = prod.get('discounts', [])
                updated = False
                for d in discounts:
                    if d.get('id') == discount_id:
                        d['name'] = discount_data['name']
                        d['value'] = discount_data['value']
                        updated = True
                
                if updated:
                    retail = prod.get('retail_price_idr', 0)
                    current_price = retail
                    for d in discounts:
                        val = float(d.get('value', 0))
                        current_price = current_price * ((100 - val) / 100)
                    
                    batch.update(doc.reference, {'discounts': discounts, 'nett_price_idr': int(current_price)})
                    batch_count += 1
                
                if batch_count >= 400:
                    batch.commit(); batch = db.batch(); batch_count = 0
            if batch_count > 0: batch.commit()

        return https_fn.Response(json.dumps({'success': True, 'id': discount_id}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

@https_fn.on_request(region="asia-southeast2")
def manage_product(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        data = req.get_json()
        mode = data.get('mode')
        product_data = data.get('product')
        
        if not product_data: return https_fn.Response("Missing data", status=400, headers=headers)

        product_id = product_data.get('id')
        if not product_id:
             product_id = str(uuid.uuid4())
             product_data['id'] = product_id
        
        # Clean Inputs
        if product_data.get('brand'): product_data['brand'] = product_data['brand'].strip().upper()
        if product_data.get('category'): product_data['category'] = product_data['category'].strip().title()
        
        # --- SMART SKU GENERATION ---
        # 1. Generate Proposal: BRAND-CAT-NAME
        c1 = get_4char_segment(product_data.get('brand', ''))
        c2 = get_4char_segment(product_data.get('category', ''))
        c3 = get_4char_segment(product_data.get('collection', ''))
        base_sku = f"{c1}-{c2}-{c3}"

        # 2. Check for Collisions
        current_code = product_data.get('code')
        
        existing_with_sku = db.collection('products').where('code', '>=', base_sku).where('code', '<=', base_sku + '\uf8ff').stream()
        existing_skus = {doc.to_dict().get('code') for doc in existing_with_sku}
        
        if mode == 'EDIT' and current_code in existing_skus:
            pass 
        
        final_sku = resolve_sku_collision(base_sku, existing_skus)
        product_data['code'] = final_sku

        # [MODIFIED] Pricing Logic
        product_data['retail_price_idr'] = int(product_data.get('retail_price_idr', 0))
        
        # Ensure eur/usd are numbers if present
        if 'retail_price_eur' in product_data:
            product_data['retail_price_eur'] = int(product_data.get('retail_price_eur', 0))
        if 'retail_price_usd' in product_data:
            product_data['retail_price_usd'] = int(product_data.get('retail_price_usd', 0))
        
        # We trust the frontend sent the correct calculated IDR, but we store the currency flag
        product_data['currency'] = product_data.get('currency', 'IDR')

        product_data['total_stock'] = int(product_data.get('total_stock', 0))

        discount_ids = []
        for d in product_data.get('discounts', []):
            if d.get('id'): discount_ids.append(d.get('id'))
        product_data['discount_ids'] = discount_ids

        doc_ref = db.collection('products').document(product_id)
        doc_snap = doc_ref.get()
        current_data = doc_snap.to_dict() if doc_snap.exists else {}
        
        last_seq = current_data.get('last_sequence', 0)
        product_data['last_sequence'] = last_seq
        
        doc_ref.set(product_data, merge=True)

        if mode == 'ADD':
            initial_qty = product_data.get('total_stock', 0)
            batch = db.batch()
            
            for i in range(initial_qty):
                last_seq += 1
                seq_str = str(last_seq).zfill(4)
                qr_content = f"{final_sku}-{seq_str}"
                
                new_item_ref = db.collection('inventory_items').document()
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
            
            doc_ref.update({'last_sequence': last_seq})
            batch.commit()

        return https_fn.Response(json.dumps({'success': True, 'id': product_id, 'sku': final_sku}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

@https_fn.on_request(region="asia-southeast2")
def delete_product(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'DELETE', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        data = req.get_json()
        product_id = data.get('product_id')
        if not product_id: return https_fn.Response("Missing id", status=400, headers=headers)

        db.collection('products').document(product_id).delete()
        
        items = db.collection('inventory_items').where('product_id', '==', product_id).stream()
        batch = db.batch()
        count = 0
        for item in items:
            batch.delete(item.reference)
            count += 1
            if count >= 400:
                batch.commit(); batch = db.batch(); count = 0
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

        # 1. Fetch Rates for Auto-Calc during Import
        settings_doc = db.collection('settings').document('global').get()
        settings = settings_doc.to_dict() if settings_doc.exists else {'eur_rate': 17000, 'usd_rate': 15500}
        eur_rate = settings.get('eur_rate', 17000)
        usd_rate = settings.get('usd_rate', 15500)

        # Pre-fetch existing SKUs for collision detection
        all_products_ref = db.collection('products').select(['code']).stream()
        existing_skus = {doc.to_dict().get('code') for doc in all_products_ref}

        batch = db.batch()
        count = 0
        now = datetime.datetime.now()
        batch_name = f"IMPORT-{now.strftime('%Y%m%d-%H%M')}-{uuid.uuid4().hex[:4].upper()}"
        session_discounts = {} 

        for p_data in new_products:
            # 1. Discounts
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
                            rule_doc = {'id': new_rule_id, 'name': rule_name, 'value': val, 'is_active': True, 'created_at': now}
                            batch.set(db.collection('discounts').document(new_rule_id), rule_doc)
                            count += 1
                            session_discounts[val] = (new_rule_id, rule_name)
                            rule_id = new_rule_id
                        processed_discounts.append({'id': rule_id, 'name': rule_name, 'value': val})
                        discount_ids.append(rule_id)
                except: pass
            
            p_data['discounts'] = processed_discounts
            p_data['discount_ids'] = discount_ids
            
            # 2. SKU Generation
            brand_clean = p_data.get('brand', '').strip().upper()
            category_clean = p_data.get('category', '').strip().title()
            collection_clean = p_data.get('collection', '').strip()
            
            # Use Manufacturer Code if provided in CSV 'code' column
            manufacturer_code = p_data.get('code', '').strip()

            c1 = get_4char_segment(brand_clean)
            c2 = get_4char_segment(category_clean)
            c3 = get_4char_segment(collection_clean)
            base_sku = f"{c1}-{c2}-{c3}"
            
            final_sku = resolve_sku_collision(base_sku, existing_skus)
            existing_skus.add(final_sku) # Add to local set so next item in THIS batch doesn't collide

            product_id = str(uuid.uuid4())
            total_stock = int(p_data.get('total_stock', 0))

            # [MODIFIED] Price Logic for Import
            # Prioritize EUR > USD > IDR
            raw_eur = p_data.get('retail_price_eur')
            raw_usd = p_data.get('retail_price_usd')
            raw_idr = int(p_data.get('retail_price_idr', 0))

            final_idr = raw_idr
            currency = 'IDR'
            retail_eur = 0
            retail_usd = 0

            if raw_eur:
                try:
                    retail_eur = int(raw_eur)
                    if retail_eur > 0:
                        currency = 'EUR'
                        final_idr = retail_eur * eur_rate
                except: pass
            elif raw_usd: # Else check USD
                try:
                    retail_usd = int(raw_usd)
                    if retail_usd > 0:
                        currency = 'USD'
                        final_idr = retail_usd * usd_rate
                except: pass

            product_doc = {
                'id': product_id,
                'brand': brand_clean,
                'category': category_clean,
                'collection': collection_clean,
                'code': final_sku,               # System SKU
                'manufacturer_code': manufacturer_code, # Factory ID
                'image_url': p_data.get('image_url', ''), 
                'detail': p_data.get('detail', ''),
                
                'currency': currency,
                'retail_price_idr': final_idr,
                'retail_price_eur': retail_eur,
                'retail_price_usd': retail_usd,

                'total_stock': total_stock,
                'booked_stock': 0,
                'sold_stock': 0,
                'created_at': now,
                'nett_price_idr': int(p_data.get('nett_price_idr', final_idr)),
                'discounts': processed_discounts,
                'discount_ids': discount_ids,
                'is_not_for_sale': p_data.get('is_not_for_sale', False),
                'is_upcoming': p_data.get('is_upcoming', False),
                'upcoming_eta': p_data.get('upcoming_eta', ''),
                'last_sequence': total_stock
            }
            batch.set(db.collection('products').document(product_id), product_doc)
            count += 1

            for i in range(total_stock):
                seq_num = i + 1
                seq_str = str(seq_num).zfill(4)
                qr_content = f"{final_sku}-{seq_str}"

                item_ref = db.collection('inventory_items').document()
                status = 'AVAILABLE'
                if product_doc['is_not_for_sale']: status = 'NOT_FOR_SALE'
                
                item_data = {
                    'product_id': product_id,
                    'product_name': f"{product_doc['brand']} - {product_doc['collection']}",
                    'qr_code': qr_content,
                    'status': status,
                    'current_location': p_data.get('location', 'Warehouse (Import)'),
                    'created_at': now,
                    'history_log': [{'action': 'BULK_IMPORT', 'batch_id': batch_name, 'location': p_data.get('location', 'Warehouse (Import)'), 'date': now, 'note': f'Imported via Batch {batch_name}'}]
                }
                batch.set(item_ref, item_data)
                count += 1

            if count >= 400: batch.commit(); batch = db.batch(); count = 0
        if count > 0: batch.commit()

        return https_fn.Response(json.dumps({'success': True, 'count': len(new_products), 'batch_id': batch_name}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)