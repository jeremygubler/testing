extends SceneTree

## Einstiegspunkt der Testsuite.
##
##     godot --headless --path . -s res://tests/TestRunner.gd
##
## Beendet sich mit Exit-Code 1, sobald ein Test fehlschlägt -- damit die CI
## rot wird. Die eigentlichen Tests stehen in tests/TestSuite.gd; dieses
## Skript lädt sie erst zur Laufzeit, weil Entry-Scripts noch vor der
## Autoload-Registrierung kompiliert werden.

func _initialize() -> void:
	var suite_script: GDScript = load("res://tests/TestSuite.gd")
	var suite: RefCounted = suite_script.new()
	var failures: int = int(suite.call("run"))
	quit(1 if failures > 0 else 0)
