from firebase_functions import https_fn
from google.cloud.firestore_v1.base_query import FieldFilter
from firebase_admin import firestore
import json
import uuid
import datetime
import io
import pandas as pd

from .config import db
from .utils import serialize_doc, get_4char_segment, resolve_sku_collision

# --- HELPER: SYNC COUNTERS ---
def update_product_counters(product_id):
    """
    Recalculates stock levels (Total, Booked, Sold) for a product 
    by counting its inventory items.
    """
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

# --- READ FUNCTIONS ---

def get_all_products(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)
    
    try:
        docs = db.collection('products').stream()
        products = [serialize_doc(doc.to_dict()) for doc in docs]
        return https_fn.Response(json.dumps({'data': products}), status=200, headers=headers, mimetype='application/json')
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

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
        
        if product_data.get('brand'): product_data['brand'] = product_data['brand'].strip().upper()
        if product_data.get('category'): product_data['category'] = product_data['category'].strip().title()
        
        # SKU Logic
        c1 = get_4char_segment(product_data.get('brand', ''))
        c2 = get_4char_segment(product_data.get('category', ''))
        c3 = get_4char_segment(product_data.get('collection', ''))
        base_sku = f"{c1}-{c2}-{c3}"

        current_code = product_data.get('code')
        existing_with_sku = db.collection('products').where('code', '>=', base_sku).where('code', '<=', base_sku + '\uf8ff').stream()
        existing_skus = {doc.to_dict().get('code') for doc in existing_with_sku}
        
        # Only generate new SKU if ADD or if we are editing and want to change it (logic here preserves existing if match)
        final_sku = current_code
        if mode == 'ADD' or (mode == 'EDIT' and current_code not in existing_skus and not current_code):
             final_sku = resolve_sku_collision(base_sku, existing_skus)
        
        product_data['code'] = final_sku
        product_data['retail_price_idr'] = int(product_data.get('retail_price_idr', 0))
        
        if 'retail_price_eur' in product_data:
            product_data['retail_price_eur'] = int(product_data.get('retail_price_eur', 0))
        if 'retail_price_usd' in product_data:
            product_data['retail_price_usd'] = int(product_data.get('retail_price_usd', 0))
        
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

# --- BULK OPERATIONS ---

def bulk_import_products(req: https_fn.Request) -> https_fn.Response:
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type'}
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        data = req.get_json()
        new_products = data.get('products', [])
        if not new_products: return https_fn.Response("No products", status=400, headers=headers)

        settings_doc = db.collection('settings').document('global').get()
        settings = settings_doc.to_dict() if settings_doc.exists else {'eur_rate': 17000, 'usd_rate': 15500}
        eur_rate = settings.get('eur_rate', 17000)
        usd_rate = settings.get('usd_rate', 15500)

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
            
            # 2. Check for ID (UPDATE MODE)
            provided_id = p_data.get('id')
            is_update = False
            
            if provided_id and len(provided_id) > 10: 
                product_id = provided_id
                is_update = True
            else:
                product_id = str(uuid.uuid4())

            # 3. SKU Logic
            brand_clean = p_data.get('brand', '').strip().upper()
            category_clean = p_data.get('category', '').strip().title()
            collection_clean = p_data.get('collection', '').strip()
            manufacturer_code = p_data.get('code', '').strip()

            if not is_update:
                c1 = get_4char_segment(brand_clean)
                c2 = get_4char_segment(category_clean)
                c3 = get_4char_segment(collection_clean)
                base_sku = f"{c1}-{c2}-{c3}"
                final_sku = resolve_sku_collision(base_sku, existing_skus)
                existing_skus.add(final_sku)
            else:
                final_sku = p_data.get('code') 

            # 4. Pricing
            total_stock = int(p_data.get('total_stock', 0))
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
            elif raw_usd:
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
                'manufacturer_code': manufacturer_code,
                'image_url': p_data.get('image_url', ''), 
                'detail': p_data.get('detail', ''),
                'dimensions': p_data.get('dimensions', ''),
                'finishing': p_data.get('finishing', ''),
                'currency': currency,
                'retail_price_idr': final_idr,
                'retail_price_eur': retail_eur,
                'retail_price_usd': retail_usd,
                'total_stock': total_stock,
                'nett_price_idr': int(p_data.get('nett_price_idr', final_idr)),
                'discounts': processed_discounts,
                'discount_ids': discount_ids,
                'is_not_for_sale': p_data.get('is_not_for_sale', False),
                'is_upcoming': p_data.get('is_upcoming', False),
                'upcoming_eta': p_data.get('upcoming_eta', ''),
            }
            
            if not is_update:
                product_doc['code'] = final_sku
                product_doc['booked_stock'] = 0
                product_doc['sold_stock'] = 0
                product_doc['created_at'] = now
                product_doc['last_sequence'] = total_stock
            
            batch.set(db.collection('products').document(product_id), product_doc, merge=True)
            count += 1

            if not is_update:
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

def export_inventory_excel(req: https_fn.Request) -> https_fn.Response:
    headers = {
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Methods': 'GET', 
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Expose-Headers': 'Content-Disposition' 
    }
    if req.method == 'OPTIONS': return https_fn.Response('', status=204, headers=headers)

    try:
        settings_doc = db.collection('settings').document('global').get()
        settings = settings_doc.to_dict() if settings_doc.exists else {'eur_rate': 17000, 'usd_rate': 15500}
        eur_rate = settings.get('eur_rate', 17000)
        usd_rate = settings.get('usd_rate', 15500)

        all_items = db.collection('inventory_items').stream()
        loc_map = {} 
        for item in all_items:
            i_data = item.to_dict()
            pid = i_data.get('product_id')
            status = i_data.get('status')
            loc = i_data.get('current_location', '').strip()
            if pid and loc and status != 'SOLD':
                if pid not in loc_map: loc_map[pid] = set()
                loc_map[pid].add(loc)

        docs = db.collection('products').stream()
        export_data = []
        
        for doc in docs:
            p = doc.to_dict()
            pid = p.get('id')
            
            currency = p.get('currency', 'IDR')
            retail_eur = p.get('retail_price_eur', 0)
            retail_usd = p.get('retail_price_usd', 0)
            current_idr = p.get('retail_price_idr', 0)

            if currency == 'EUR' and retail_eur > 0:
                current_idr = retail_eur * eur_rate
            elif currency == 'USD' and retail_usd > 0:
                current_idr = retail_usd * usd_rate
            
            discounts = p.get('discounts', [])
            discount_str = " + ".join([f"{d['value']}%" for d in discounts if d.get('value')])
            if not discount_str: discount_str = None
            
            current_nett = current_idr
            for d in discounts:
                val = float(d.get('value', 0))
                current_nett = current_nett * ((100 - val) / 100)
            current_nett = int(current_nett)

            locations = sorted(list(loc_map.get(pid, [])))
            location_str = " | ".join(locations) if locations else None

            nfs_str = "Not For Sale" if p.get('is_not_for_sale') else None
            upcoming_str = "Upcoming" if p.get('is_upcoming') else None
            
            image_val = p.get('image_url', '').replace('products/', '')
            if not image_val: image_val = None

            row = {
                'system sku': p.get('code') or None,
                'brand': p.get('brand') or None,
                'category': p.get('category') or None,
                'collection name': p.get('collection') or None,
                'manufacturer id': p.get('manufacturer_code') or None,
                'dimensions': p.get('dimensions') or None,
                'finishing': p.get('finishing') or None,
                'detail': p.get('detail') or None,
                
                'retail price (eur)': retail_eur,
                'retail price (usd)': retail_usd,
                'retail price (idr)': current_idr,
                
                'discounts': discount_str,
                'nett price (idr)': current_nett,
                
                'not for sale': nfs_str,
                'upcoming': upcoming_str,
                'eta': p.get('upcoming_eta') or None,
                
                'total qty': p.get('total_stock', 0),
                'booked qty': p.get('booked_stock', 0),
                'available qty': int(p.get('total_stock', 0)) - int(p.get('booked_stock', 0)),
                
                'location': location_str,
                'system id': p.get('id') or None,
                'image file': image_val
            }
            export_data.append(row)

        export_data.sort(key=lambda x: (x['brand'] or '', x['collection name'] or ''))

        df = pd.DataFrame(export_data)
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Inventory Master')
            worksheet = writer.sheets['Inventory Master']
            for column_cells in worksheet.columns:
                length = max(len(str(cell.value)) for cell in column_cells)
                worksheet.column_dimensions[column_cells[0].column_letter].width = min(length + 2, 40)

        output.seek(0)
        
        filename = f"EDSIS_Inventory_Master_{datetime.datetime.now().strftime('%Y-%m-%d_%H%M')}.xlsx"
        file_headers = {
            **headers,
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': f'attachment; filename="{filename}"'
        }
        return https_fn.Response(output.read(), status=200, headers=file_headers)

    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)