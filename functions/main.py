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

# --- HELPER: SYNC PRODUCT COUNTERS ---
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
            # Total stock available in warehouse (Available + Booked + NFS)
            total += 1 
        
        if status == 'BOOKED':
            booked += 1
            
    db.collection('products').document(product_id).update({
        'total_stock': total,
        'booked_stock': booked,
        'sold_stock': sold
    })

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
        now = datetime.datetime.now()
        needs_update = False

        for doc in query:
            d = doc.to_dict()
            d['id'] = doc.id
            
            # --- LAZY EXPIRATION CHECK ---
            # If item is booked and past its expiry date, auto-release it.
            if d.get('status') == 'BOOKED' and d.get('booking'):
                expired_str = d['booking'].get('expired_at')
                if expired_str:
                    try:
                        exp_date = datetime.datetime.fromisoformat(expired_str)
                        if now > exp_date:
                            print(f"Auto-releasing item {d['id']}")
                            update_data = {
                                'status': 'AVAILABLE',
                                'booking': firestore.DELETE_FIELD,
                                'history_log': firestore.ArrayUnion([{
                                    'action': 'AUTO_RELEASED',
                                    'location': d.get('current_location', ''),
                                    'date': now,
                                    'note': "Booking expired"
                                }])
                            }
                            db.collection('inventory_items').document(d['id']).update(update_data)
                            d['status'] = 'AVAILABLE'
                            if 'booking' in d: del d['booking']
                            needs_update = True
                    except:
                        pass
            
            inventory.append(serialize_doc(d))
        
        if needs_update:
            update_product_counters(product_id)

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

# --- ACTION FUNCTIONS ---

@https_fn.on_request(region="asia-southeast2")
def book_item(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        data = req.get_json()
        item_id = data.get('item_id')
        booked_by = data.get('booked_by', 'Unknown') # Client Name
        system_user = data.get('system_user', 'System') # Staff Name
        notes = data.get('notes', '')
        expired_at_str = data.get('expired_at') # YYYY-MM-DD
        
        if not expired_at_str:
             return https_fn.Response("Missing expiration date", status=400, headers=headers)

        doc_ref = db.collection('inventory_items').document(item_id)
        doc = doc_ref.get()
        if not doc.exists: return https_fn.Response("Item not found", status=404, headers=headers)
        
        item_data = doc.to_dict()
        if item_data.get('status') not in ['AVAILABLE', 'NOT_FOR_SALE']:
            return https_fn.Response("Item cannot be booked", status=400, headers=headers)

        # Set expiry to end of selected day
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

@https_fn.on_request(region="asia-southeast2")
def sell_item(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        data = req.get_json()
        item_id = data.get('item_id')
        po_number = data.get('po_number', '')
        
        doc_ref = db.collection('inventory_items').document(item_id)
        doc = doc_ref.get()
        item_data = doc.to_dict()
        
        update_data = {
            'status': 'SOLD',
            'booking': firestore.DELETE_FIELD,
            'sold_at': datetime.datetime.now().isoformat(),
            'po_number': po_number,
            'history_log': firestore.ArrayUnion([{
                'action': 'SOLD',
                'location': item_data.get('current_location', ''),
                'date': datetime.datetime.now(),
                'note': f"Item marked as SOLD. PO: {po_number}" if po_number else "Item marked as SOLD"
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
        
        product_data['retail_price_idr'] = int(product_data.get('retail_price_idr', 0))
        product_data['total_stock'] = int(product_data.get('total_stock', 0))
        if product_data.get('brand'): product_data['brand'] = product_data['brand'].strip().upper()
        if product_data.get('category'): product_data['category'] = product_data['category'].strip().title()

        discount_ids = []
        for d in product_data.get('discounts', []):
            if d.get('id'): discount_ids.append(d.get('id'))
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

        batch = db.batch()
        count = 0
        now = datetime.datetime.now()
        batch_name = f"IMPORT-{now.strftime('%Y%m%d-%H%M')}-{uuid.uuid4().hex[:4].upper()}"
        session_discounts = {} 

        for p_data in new_products:
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
            
            brand_clean = p_data.get('brand', '').strip().upper()
            category_clean = p_data.get('category', '').strip().title()
            collection_clean = p_data.get('collection', '').strip()
            
            product_id = str(uuid.uuid4())
            product_doc = {
                'id': product_id,
                'brand': brand_clean,
                'category': category_clean,
                'collection': collection_clean,
                'code': p_data.get('code', '').strip(),
                'image_url': p_data.get('image_url', ''), 
                'detail': p_data.get('detail', ''),
                'retail_price_idr': int(p_data.get('retail_price_idr', 0)),
                'total_stock': int(p_data.get('total_stock', 0)),
                'booked_stock': 0,
                'sold_stock': 0, # Initialize
                'created_at': now,
                'nett_price_idr': int(p_data.get('nett_price_idr', 0)),
                'discounts': processed_discounts,
                'discount_ids': discount_ids,
                'is_not_for_sale': p_data.get('is_not_for_sale', False),
                'is_upcoming': p_data.get('is_upcoming', False),
                'upcoming_eta': p_data.get('upcoming_eta', ''),
            }
            batch.set(db.collection('products').document(product_id), product_doc)
            count += 1

            for i in range(product_doc['total_stock']):
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
                    'history_log': [{'action': 'BULK_IMPORT', 'batch_id': batch_name, 'location': p_data.get('location', 'Warehouse (Import)'), 'date': now, 'note': f'Imported via Batch {batch_name}'}]
                }
                batch.set(item_ref, item_data)
                count += 1

            if count >= 400: batch.commit(); batch = db.batch(); count = 0
        if count > 0: batch.commit()

        return https_fn.Response(json.dumps({'success': True, 'count': len(new_products), 'batch_id': batch_name}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)