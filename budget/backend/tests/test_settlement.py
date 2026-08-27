"""Ausgleich: wer wem wie viel schuldet, mit moeglichst wenigen Zahlungen."""

import pytest

from app.services.settlement import MemberBalance, compute_balances, settle


def test_equal_weights_split_expenses_evenly():
    balances = compute_balances(borne={1: 10_000, 2: 0}, weights={1: 1, 2: 1})
    by_id = {b.member_id: b for b in balances}
    assert by_id[1].share_minor == 5000
    assert by_id[2].share_minor == 5000
    assert by_id[1].balance_minor == 5000
    assert by_id[2].balance_minor == -5000


def test_shares_follow_the_household_key():
    balances = compute_balances(borne={1: 5000, 2: 5000}, weights={1: 60, 2: 40})
    by_id = {b.member_id: b for b in balances}
    assert by_id[1].share_minor == 6000
    assert by_id[2].share_minor == 4000
    # Anna haette 60 tragen sollen, hat aber nur 50 getragen -> sie schuldet 10.
    assert by_id[1].balance_minor == -1000
    assert by_id[2].balance_minor == 1000


def test_shares_sum_exactly_to_total_expenses():
    for total in range(0, 500):
        balances = compute_balances(
            borne={1: total, 2: 0, 3: 0}, weights={1: 1, 2: 1, 3: 1}
        )
        assert sum(b.share_minor for b in balances) == total


def test_balances_always_net_to_zero():
    balances = compute_balances(
        borne={1: 33_333, 2: 12_500, 3: 7}, weights={1: 3, 2: 2, 3: 1}
    )
    assert sum(b.balance_minor for b in balances) == 0


def test_member_without_expenses_still_appears():
    balances = compute_balances(borne={}, weights={1: 1, 2: 1})
    assert {b.member_id for b in balances} == {1, 2}
    assert all(b.share_minor == 0 for b in balances)


def test_inactive_member_with_expenses_gets_no_share():
    # Person 3 ist deaktiviert (kein Gewicht mehr), hat in der Periode aber gezahlt.
    balances = compute_balances(borne={1: 0, 2: 0, 3: 6000}, weights={1: 1, 2: 1})
    by_id = {b.member_id: b for b in balances}
    assert by_id[3].share_minor == 0
    assert by_id[3].balance_minor == 6000
    assert by_id[1].share_minor == 3000


def test_settle_produces_one_payment_for_two_people():
    payments = settle(
        [MemberBalance(1, borne_minor=10_000, share_minor=5000),
         MemberBalance(2, borne_minor=0, share_minor=5000)]
    )
    assert len(payments) == 1
    assert payments[0].from_member_id == 2
    assert payments[0].to_member_id == 1
    assert payments[0].amount_minor == 5000


def test_settle_needs_at_most_n_minus_one_payments():
    balances = [
        MemberBalance(1, borne_minor=12_000, share_minor=4000),   # +8000
        MemberBalance(2, borne_minor=1000, share_minor=4000),     # -3000
        MemberBalance(3, borne_minor=0, share_minor=4000),        # -4000
        MemberBalance(4, borne_minor=3000, share_minor=4000),     # -1000
    ]
    payments = settle(balances)
    assert len(payments) <= len(balances) - 1
    assert sum(p.amount_minor for p in payments) == 8000
    assert all(p.to_member_id == 1 for p in payments)


def test_settle_clears_every_balance():
    balances = [
        MemberBalance(1, borne_minor=9000, share_minor=3000),
        MemberBalance(2, borne_minor=0, share_minor=3000),
        MemberBalance(3, borne_minor=0, share_minor=3000),
    ]
    net = {b.member_id: b.balance_minor for b in balances}
    for payment in settle(balances):
        net[payment.from_member_id] += payment.amount_minor
        net[payment.to_member_id] -= payment.amount_minor
    assert set(net.values()) == {0}


def test_settle_is_empty_when_everyone_is_even():
    balances = [
        MemberBalance(1, borne_minor=5000, share_minor=5000),
        MemberBalance(2, borne_minor=5000, share_minor=5000),
    ]
    assert settle(balances) == []


def test_settle_is_deterministic():
    balances = [
        MemberBalance(1, borne_minor=0, share_minor=1000),
        MemberBalance(2, borne_minor=0, share_minor=1000),
        MemberBalance(3, borne_minor=4000, share_minor=1000),
        MemberBalance(4, borne_minor=0, share_minor=1000),
    ]
    first = settle(balances)
    for _ in range(5):
        assert settle(list(reversed(balances))) == first


def test_no_key_means_no_settlement():
    # Ohne tragfaehigen Schluessel wird nichts umverteilt, statt willkuerlich zu raten.
    balances = compute_balances(borne={1: 8000, 2: 2000}, weights={1: 0, 2: 0})
    assert all(b.balance_minor == 0 for b in balances)
    assert settle(balances) == []


@pytest.mark.parametrize("total", [1, 7, 99, 100_001])
def test_greedy_never_invents_money(total):
    balances = compute_balances(borne={1: total, 2: 0, 3: 0}, weights={1: 1, 2: 2, 3: 3})
    payments = settle(balances)
    incoming = sum(p.amount_minor for p in payments if p.to_member_id == 1)
    assert incoming == max(0, balances[0].balance_minor)
