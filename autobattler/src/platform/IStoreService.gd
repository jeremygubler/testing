class_name IStoreService
extends RefCounted

## Platform-agnostic storefront interface (purchasing).
##
## Cosmetic-only. Skins are purely visual (no pay-to-win). During development the
## MockStoreService fulfils purchases instantly against a local wallet. A Switch
## build implements this against the eShop / Nintendo IAP API in the platform
## layer. Game code only ever sees product ids, price tiers, and a purchase result.

enum PurchaseResult {
	SUCCESS,       ## Purchase completed and entitlement granted.
	CANCELLED,     ## User cancelled the platform purchase flow.
	ALREADY_OWNED, ## Product already entitled.
	INSUFFICIENT,  ## Not enough funds / declined.
	UNAVAILABLE,   ## Product not offered on this platform/region.
	ERROR,         ## Backend/network error.
}

signal purchase_completed(product_id: String, result: PurchaseResult)


## Return the list of purchasable product ids available on this platform.
func get_available_products() -> Array[String]:
	push_error("IStoreService.get_available_products() not implemented")
	return []


## Localised, platform-formatted price string for display (e.g. "CHF 4.90").
func get_price_display(product_id: String) -> String:
	push_error("IStoreService.get_price_display() not implemented")
	return ""


## Begin a purchase. Emits `purchase_completed` when done. Returns false if the
## product id is unknown / cannot start.
func purchase(product_id: String) -> bool:
	push_error("IStoreService.purchase() not implemented")
	return false


## Restore previously-purchased entitlements (required by most console stores).
func restore_purchases() -> bool:
	push_error("IStoreService.restore_purchases() not implemented")
	return false
