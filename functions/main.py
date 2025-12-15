from firebase_functions import https_fn
from firebase_admin import initialize_app, firestore
import json
import datetime

initialize_app()
db = firestore.client()

def serialize_doc(doc_dict):
    """Helper to convert Firestore timestamps to strings for JSON"""
    for key, value in doc_dict.items():
        if isinstance(value, datetime.datetime):
            doc_dict[key] = value.isoformat()
    return doc_dict

@https_fn.on_request(region="asia-southeast2")
def get_all_products(req: https_fn.Request) -> https_fn.Response:
    # 1. Handle CORS (Allow React to talk to Python)
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
    }
    if req.method == 'OPTIONS':
        return https_fn.Response('', status=204, headers=headers)

    try:
        # 2. Fetch all products
        # (406 items is small enough to fetch all at once for a fast UI)
        docs = db.collection('products').stream()
        products = []
        
        for doc in docs:
            data = doc.to_dict()
            products.append(serialize_doc(data))
            
        # 3. Return JSON
        return https_fn.Response(
            json.dumps({'data': products}), 
            status=200, 
            headers=headers,
            mimetype='application/json'
        )
    except Exception as e:
        return https_fn.Response(str(e), status=500, headers=headers)