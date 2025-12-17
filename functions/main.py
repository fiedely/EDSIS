from firebase_functions import https_fn
from firebase_admin import initialize_app

# The app initialization happens in src/config.py, 
# but we import the functions here to expose them to the Firebase Runtime.

from src.inventory import (
    get_all_products, 
    get_product_inventory, 
    manage_product, 
    delete_product, 
    bulk_import_products, 
    export_inventory_excel
)

from src.bookings import (
    book_item, 
    release_item, 
    check_expired_bookings
)

from src.settings import (
    get_exchange_rates, 
    update_exchange_rates, 
    manage_discount, 
    get_discounts
)