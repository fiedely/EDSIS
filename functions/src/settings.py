from firebase_functions import https_fn
from firebase_admin import firestore
import json
import datetime
import uuid
from .config import db
from .utils import serialize_doc

# --- EXCHANGE RATES ---

@https_fn.on_request(region="asia-southeast2")
def get_exchange_rates(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)
    
    try:
        doc = db.collection('settings').document('global').get()
        data = doc.to_dict() if doc.exists else {'eur_rate': 17000, 'usd_rate': 15500} 
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

# --- DISCOUNTS ---

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
            # Update all products using this discount (Batch Operation)
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