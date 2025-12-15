from firebase_functions import https_fn
from firebase_admin import initialize_app, firestore
import firebase_admin
import json
import datetime

# 1. Initialize the App safely
# We check if apps are already initialized to prevent "App already exists" errors during hot-reloads
if not firebase_admin._apps:
    initialize_app()

db = firestore.client()

def serialize_doc(doc_dict):
    """Helper to convert Firestore timestamps to strings for JSON"""
    if not doc_dict: return {}
    for key, value in doc_dict.items():
        if isinstance(value, datetime.datetime):
            doc_dict[key] = value.isoformat()
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    serialize_doc(item)
    return doc_dict

@https_fn.on_request(region="asia-southeast2")
def get_all_products(req: https_fn.Request) -> https_fn.Response:
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
    }
    if req.method == 'OPTIONS':
        return https_fn.Response('', status=204, headers=headers)

    try:
        docs = db.collection('products').stream()
        products = []
        for doc in docs:
            data = doc.to_dict()
            products.append(serialize_doc(data))
            
        return https_fn.Response(
            json.dumps({'data': products}), 
            status=200, 
            headers=headers,
            mimetype='application/json'
        )
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)

@https_fn.on_request(region="asia-southeast2")
def get_product_inventory(req: https_fn.Request) -> https_fn.Response:
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
    }
    if req.method == 'OPTIONS':
        return https_fn.Response('', status=204, headers=headers)

    product_id = req.args.get('product_id')
    
    if not product_id:
        return https_fn.Response("Missing product_id", status=400, headers=headers)

    try:
        query = db.collection('inventory_items').where('product_id', '==', product_id).stream()
        
        inventory = []
        for doc in query:
            data = doc.to_dict()
            data['id'] = doc.id 
            inventory.append(serialize_doc(data))

        return https_fn.Response(
            json.dumps({'data': inventory}),
            status=200, 
            headers=headers,
            mimetype='application/json'
        )
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)