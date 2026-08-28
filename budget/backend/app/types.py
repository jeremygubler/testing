"""Eigene SQLAlchemy-Typen."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from sqlalchemy import String
from sqlalchemy.types import TypeDecorator


class EnumStr(TypeDecorator):
    """Speichert ein ``StrEnum`` als VARCHAR und liefert es als Enum zurueck.

    Ohne das kommt aus der Datenbank ein blanker ``str`` zurueck. ``==`` funktioniert
    damit zwar noch (StrEnum ist ein str), ``is`` aber nicht mehr -- ein Fehler, der
    still das falsche Ergebnis liefert statt zu krachen.
    """

    impl = String
    cache_ok = True

    def __init__(self, enum_cls: type[StrEnum], length: int = 32, **kwargs: Any) -> None:
        self.enum_cls = enum_cls
        super().__init__(length=length, **kwargs)

    def process_bind_param(self, value: Any, _dialect: Any) -> str | None:
        if value is None:
            return None
        return self.enum_cls(value).value

    def process_result_value(self, value: Any, _dialect: Any) -> StrEnum | None:
        if value is None:
            return None
        return self.enum_cls(value)
