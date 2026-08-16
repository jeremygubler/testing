class_name IEntitlementService
extends RefCounted

## Platform-agnostic ownership interface (what the player owns & has applied).
##
## Separated from IStoreService on purpose: "can the player use skin X" is a
## question the whole game asks constantly, while "buy skin X" is a rare flow.
## The entitlement store is what a Switch port persists via ISaveService and/or
## validates against the platform account.

signal entitlement_changed(entitlement_id: String, owned: bool)
signal skin_applied(hero_id: String, skin_id: String)


## True if the player owns the given entitlement (usually a skin id).
func owns(entitlement_id: String) -> bool:
	push_error("IEntitlementService.owns() not implemented")
	return false


## Grant an entitlement (called by the store after a successful purchase, or by
## the mock backend for dev/testing). Emits entitlement_changed.
func grant(entitlement_id: String) -> void:
	push_error("IEntitlementService.grant() not implemented")


## All owned entitlement ids.
func owned_ids() -> Array[String]:
	push_error("IEntitlementService.owned_ids() not implemented")
	return []


## Apply an owned skin to a hero (visual selection). No effect if not owned.
## Returns true if applied. Emits skin_applied.
func apply_skin(hero_id: String, skin_id: String) -> bool:
	push_error("IEntitlementService.apply_skin() not implemented")
	return false


## The skin id currently applied for a hero, or "" for the default look.
func get_applied_skin(hero_id: String) -> String:
	push_error("IEntitlementService.get_applied_skin() not implemented")
	return ""
