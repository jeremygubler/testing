extends IStoreService

## Local mock storefront for development. Reads purchasable products from the
## GameDatabase (skins), maintains a fake wallet, and fulfils purchases instantly
## by granting the entitlement. NO real money, NO network. The real eShop IAP
## implementation lives in the Switch platform layer and reuses IEntitlementService.

# Fixed price per rarity tier (in a neutral "dev currency"). Real prices come from
# the platform store catalogue on console; these are placeholders for the mock UI.
const PRICE_BY_TIER := {
	"common": 1.90,
	"rare": 3.90,
	"epic": 6.90,
	"legendary": 9.90,
}

var _entitlements: IEntitlementService
var _wallet: float = 1000.0  # generous dev wallet so testing never blocks.


func _init(entitlements: IEntitlementService) -> void:
	_entitlements = entitlements


func get_available_products() -> Array[String]:
	var out: Array[String] = []
	for skin in GameDatabase.all_skins():
		out.append(String(skin.id))
	return out


func _price_of(product_id: String) -> float:
	var skin := GameDatabase.get_skin(product_id)
	if skin == null:
		return -1.0
	return PRICE_BY_TIER.get(skin.rarity, 4.90)


func get_price_display(product_id: String) -> String:
	var p := _price_of(product_id)
	if p < 0.0:
		return "—"
	return "CHF %.2f" % p


func purchase(product_id: String) -> bool:
	var skin := GameDatabase.get_skin(product_id)
	if skin == null:
		call_deferred("_emit", product_id, PurchaseResult.UNAVAILABLE)
		return false
	if _entitlements.owns(product_id):
		call_deferred("_emit", product_id, PurchaseResult.ALREADY_OWNED)
		return true
	var price := _price_of(product_id)
	if price > _wallet:
		call_deferred("_emit", product_id, PurchaseResult.INSUFFICIENT)
		return false
	_wallet -= price
	_entitlements.grant(product_id)
	call_deferred("_emit", product_id, PurchaseResult.SUCCESS)
	return true


func restore_purchases() -> bool:
	# Mock: nothing to restore beyond what's already persisted locally.
	return true


func get_wallet() -> float:
	return _wallet


func _emit(product_id: String, result: PurchaseResult) -> void:
	purchase_completed.emit(product_id, result)
