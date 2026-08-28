"""Aufteilungslogik: Vorlagen loesen sich immer exakt in Splits auf."""

import pytest

from app.enums import SplitTemplate
from app.services.splits import SplitError, SplitLine, build_splits, validate


def test_single_puts_everything_on_one_person(members):
    anna, _ben = members
    lines = build_splits(SplitTemplate.SINGLE, 12_345, members, single_member_id=anna.id)
    assert lines == [SplitLine(anna.id, 12_345)]


def test_single_rejects_unknown_member(members):
    with pytest.raises(SplitError, match="aktiven Personen"):
        build_splits(SplitTemplate.SINGLE, 100, members, single_member_id=999)


def test_single_requires_a_member(members):
    with pytest.raises(SplitError, match="fehlt die Person"):
        build_splits(SplitTemplate.SINGLE, 100, members)


def test_equal_splits_evenly_and_remainder_to_first(db, members, household):
    from app.models import Member

    third = Member(household_id=household.id, name="Cara", sort_order=2)
    db.add(third)
    db.flush()
    everyone = [*members, third]

    lines = build_splits(SplitTemplate.EQUAL, 1000, everyone)
    assert [line.amount_minor for line in lines] == [334, 333, 333]
    assert sum(line.amount_minor for line in lines) == 1000


def test_equal_uses_sort_order_not_insertion_order(db, members, household):
    anna, ben = members
    anna.sort_order = 5
    ben.sort_order = 0
    db.flush()
    lines = build_splits(SplitTemplate.EQUAL, 101, members)
    assert lines[0].member_id == ben.id
    assert lines[0].amount_minor == 51


def test_key_uses_share_weights(members):
    anna, ben = members  # 60 / 40
    lines = build_splits(SplitTemplate.KEY, 10_000, members)
    assert {line.member_id: line.amount_minor for line in lines} == {
        anna.id: 6000,
        ben.id: 4000,
    }


def test_key_never_loses_a_rappen(members):
    anna, ben = members
    for total in range(1, 400):
        lines = build_splits(SplitTemplate.KEY, total, members)
        assert sum(line.amount_minor for line in lines) == total
    del anna, ben


def test_key_skips_members_with_zero_share(db, members, household):
    from app.models import Member

    guest = Member(household_id=household.id, name="Gast", sort_order=9, share_weight=1)
    db.add(guest)
    db.flush()
    lines = build_splits(SplitTemplate.KEY, 2, [*members, guest])
    # 2 Rappen auf 60/40/1 -> der Gast bekommt nichts und faellt raus.
    assert all(line.amount_minor != 0 for line in lines)
    assert sum(line.amount_minor for line in lines) == 2


def test_manual_must_match_the_total(members):
    anna, ben = members
    with pytest.raises(SplitError, match="entspricht nicht dem Betrag"):
        build_splits(
            SplitTemplate.MANUAL,
            10_000,
            members,
            manual=[SplitLine(anna.id, 6000), SplitLine(ben.id, 3000)],
        )


def test_manual_accepts_exact_match(members):
    anna, ben = members
    lines = build_splits(
        SplitTemplate.MANUAL,
        10_000,
        members,
        manual=[SplitLine(anna.id, 7500), SplitLine(ben.id, 2500)],
    )
    assert sum(line.amount_minor for line in lines) == 10_000


def test_zero_amount_is_rejected(members):
    with pytest.raises(SplitError, match="nicht 0"):
        build_splits(SplitTemplate.EQUAL, 0, members)


def test_equal_needs_active_members():
    with pytest.raises(SplitError, match="keine aktiven Personen"):
        build_splits(SplitTemplate.EQUAL, 100, [])


def test_validate_rejects_mixed_signs(members):
    anna, ben = members
    with pytest.raises(SplitError, match="Vorzeichen"):
        validate(4000, [SplitLine(anna.id, 5000), SplitLine(ben.id, -1000)])


def test_validate_rejects_duplicate_member(members):
    anna, _ = members
    with pytest.raises(SplitError, match="hoechstens ein Split"):
        validate(2000, [SplitLine(anna.id, 1000), SplitLine(anna.id, 1000)])


def test_validate_rejects_empty():
    with pytest.raises(SplitError, match="mindestens einen Split"):
        validate(100, [])


def test_negative_total_is_split_as_correction(members):
    lines = build_splits(SplitTemplate.KEY, -10_000, members)
    assert sum(line.amount_minor for line in lines) == -10_000
    assert all(line.amount_minor < 0 for line in lines)
