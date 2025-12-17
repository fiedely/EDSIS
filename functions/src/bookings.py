from firebase_functions import https_fn
from firebase_admin import firestore
import json
import datetime
from .config import db
from .utils import serialize_doc
from .inventory import update_product_counters

# --- SYSTEM JOB FUNCTIONS ---

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
        
        if not expired_at_str: return https_fn.Response("Missing expiration date", status=400, headers=headers)

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