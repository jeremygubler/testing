class_name SaveGame
extends Resource

## Container für einen Speicherstand im .tres-Format.
##
## Der eigentliche Inhalt ist dasselbe Dictionary wie beim JSON-Backend
## ([method GameState.to_dict]) -- so gibt es nur *ein* Speicherformat und
## zwei Transportwege (siehe [SaveSystem]).

## Muss zu [constant GameState.SAVE_VERSION] passen; wird beim Speichern gesetzt.
@export var version: int = 1
@export var saved_at: String = ""
@export var data: Dictionary = {}
