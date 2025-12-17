import firebase_admin
from firebase_admin import credentials, firestore, storage, initialize_app

# Initialize Firebase App
if not firebase_admin._apps:
    initialize_app()

# Export the DB client to be used elsewhere
db = firestore.client()