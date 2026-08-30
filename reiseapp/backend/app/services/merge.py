"""Per-field last-write-wins.

Two people editing the same trip offline is the normal case for a shared trip,
not an edge case. Merging whole records would mean the later push silently
overwrites a title someone else changed hours earlier; merging per field keeps
both edits as long as they touched different things.

Kept free of database and framework imports so the rules can be tested directly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

# A field without its own timestamp falls back to the record's updated_at. That
# is what makes plain REST writes and sync pushes comparable: a REST write bumps
# updated_at, which then stands for every field it touched.
FieldStamps = dict[str, datetime]


@dataclass
class MergeResult:
    values: dict[str, Any] = field(default_factory=dict)
    stamps: FieldStamps = field(default_factory=dict)
    #: Fields the incoming record wanted to change but lost on age.
    rejected: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.values)


def stamp_for(field_name: str, stamps: FieldStamps, fallback: datetime) -> datetime:
    return stamps.get(field_name, fallback)


def merge_fields(
    *,
    incoming: dict[str, Any],
    incoming_stamps: FieldStamps,
    incoming_updated_at: datetime,
    current: dict[str, Any],
    current_stamps: FieldStamps,
    current_updated_at: datetime,
) -> MergeResult:
    """Decides, field by field, which side is newer.

    Ties go to the stored value: a client that resends an unchanged record must
    not count as an edit, and without this rule two devices with synchronised
    clocks would ping-pong the same value forever.
    """
    result = MergeResult()

    for name, value in incoming.items():
        theirs = stamp_for(name, incoming_stamps, incoming_updated_at)
        ours = stamp_for(name, current_stamps, current_updated_at)

        if theirs > ours:
            if name not in current or current[name] != value:
                result.values[name] = value
            result.stamps[name] = theirs
        elif name in current and current[name] != value:
            # Only a real difference is a conflict; agreeing on a value is not.
            result.rejected.append(name)

    return result
