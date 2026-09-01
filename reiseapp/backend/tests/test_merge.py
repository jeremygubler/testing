"""Per-field last-write-wins – pure logic, no database."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.merge import merge_fields

T0 = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)
LATER = T0 + timedelta(hours=1)
EARLIER = T0 - timedelta(hours=1)


def merge(incoming, current, *, incoming_stamps=None, current_stamps=None,
          incoming_updated_at=LATER, current_updated_at=T0):
    return merge_fields(
        incoming=incoming,
        incoming_stamps=incoming_stamps or {},
        incoming_updated_at=incoming_updated_at,
        current=current,
        current_stamps=current_stamps or {},
        current_updated_at=current_updated_at,
    )


def test_newer_record_wins() -> None:
    result = merge({"title": "Neu"}, {"title": "Alt"})
    assert result.values == {"title": "Neu"}
    assert result.rejected == []


def test_older_record_loses() -> None:
    result = merge({"title": "Alt"}, {"title": "Neu"}, incoming_updated_at=EARLIER)
    assert result.values == {}
    assert result.rejected == ["title"]


def test_two_devices_editing_different_fields_both_win() -> None:
    # The whole point: merging whole records would lose one of these.
    result = merge(
        {"title": "Meins", "description": "unverändert"},
        {"title": "Alt", "description": "unverändert"},
        incoming_stamps={"title": LATER, "description": EARLIER},
        current_stamps={"title": EARLIER, "description": LATER},
    )
    assert result.values == {"title": "Meins"}
    assert result.rejected == []


def test_field_stamp_beats_the_record_stamp() -> None:
    # A record that is newer overall can still carry an older individual field.
    result = merge(
        {"title": "Alt"},
        {"title": "Neu"},
        incoming_stamps={"title": EARLIER},
        current_stamps={"title": T0},
    )
    assert result.values == {}
    assert result.rejected == ["title"]


def test_resending_an_unchanged_value_is_not_a_change() -> None:
    result = merge({"title": "Gleich"}, {"title": "Gleich"})
    assert result.values == {}
    assert result.changed is False
    # It still claims the field, so the stamp advances.
    assert result.stamps == {"title": LATER}


def test_agreeing_on_a_value_is_never_a_conflict() -> None:
    result = merge({"title": "Gleich"}, {"title": "Gleich"}, incoming_updated_at=EARLIER)
    assert result.rejected == []


def test_ties_go_to_the_stored_value() -> None:
    # Without this two devices with synchronised clocks would ping-pong forever.
    result = merge({"title": "Meins"}, {"title": "Ihres"}, incoming_updated_at=T0)
    assert result.values == {}
    assert result.rejected == ["title"]


def test_unknown_fields_on_the_current_side_are_still_applied() -> None:
    result = merge({"notes": "neu"}, {})
    assert result.values == {"notes": "neu"}


def test_deletion_is_just_another_field() -> None:
    result = merge({"deleted_at": LATER}, {"deleted_at": None})
    assert result.values == {"deleted_at": LATER}

    # An edit newer than the delete brings the record back.
    revived = merge(
        {"deleted_at": None},
        {"deleted_at": T0},
        incoming_stamps={"deleted_at": LATER},
        current_stamps={"deleted_at": T0},
    )
    assert revived.values == {"deleted_at": None}
