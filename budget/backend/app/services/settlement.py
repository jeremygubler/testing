"""Ausgleich zwischen Personen.

Die Frage lautet: Wer hat mehr getragen, als sein Anteil vorsieht -- und wie gleicht man
das mit moeglichst wenigen Zahlungen aus?
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.money import allocate


@dataclass(frozen=True, slots=True)
class MemberBalance:
    member_id: int
    borne_minor: int
    """Was diese Person tatsaechlich getragen hat."""
    share_minor: int
    """Was sie nach Schluessel haette tragen sollen."""

    @property
    def balance_minor(self) -> int:
        """Positiv = hat vorgelegt und bekommt zurueck. Negativ = schuldet."""
        return self.borne_minor - self.share_minor


@dataclass(frozen=True, slots=True)
class Payment:
    from_member_id: int
    to_member_id: int
    amount_minor: int


def compute_balances(
    borne: dict[int, int],
    weights: dict[int, int],
) -> list[MemberBalance]:
    """Verteilt die Gesamtausgaben gewichtet und stellt sie dem Getragenen gegenueber.

    ``borne``   Person -> tatsaechlich getragene Ausgaben (Minoreinheiten)
    ``weights`` Person -> Gewicht des fairen Anteils (Schluessel oder Einkommensanteil)

    Alle Personen aus ``weights`` erscheinen im Ergebnis, auch wenn sie nichts getragen
    haben. Personen, die nur in ``borne`` vorkommen (z. B. inzwischen deaktiviert, aber mit
    Buchungen in der Periode), bekommen Gewicht 0 -- ihr Beitrag zaehlt, aber sie tragen
    keinen Soll-Anteil mehr.
    """
    member_ids = list(weights.keys()) + [m for m in borne if m not in weights]
    if not member_ids:
        return []

    total = sum(borne.values())
    weight_list = [max(0, weights.get(member_id, 0)) for member_id in member_ids]

    if sum(weight_list) <= 0:
        # Kein tragfaehiger Schluessel: jeder traegt seinen eigenen Anteil, nichts wird
        # ausgeglichen. Besser als eine willkuerliche Gleichverteilung.
        shares = [borne.get(member_id, 0) for member_id in member_ids]
    else:
        shares = allocate(total, weight_list)

    return [
        MemberBalance(
            member_id=member_id,
            borne_minor=borne.get(member_id, 0),
            share_minor=share,
        )
        for member_id, share in zip(member_ids, shares, strict=True)
    ]


def settle(balances: list[MemberBalance]) -> list[Payment]:
    """Greedy-Ausgleich: groesster Schuldner zahlt an groessten Glaeubiger.

    Erzeugt hoechstens ``n - 1`` Zahlungen. Deterministisch: bei gleichen Betraegen
    entscheidet die Personen-ID, damit dieselben Daten immer dieselbe Empfehlung ergeben.
    """
    debtors = sorted(
        ((b.member_id, -b.balance_minor) for b in balances if b.balance_minor < 0),
        key=lambda item: (-item[1], item[0]),
    )
    creditors = sorted(
        ((b.member_id, b.balance_minor) for b in balances if b.balance_minor > 0),
        key=lambda item: (-item[1], item[0]),
    )

    payments: list[Payment] = []
    i = j = 0
    debt = list(debtors)
    credit = list(creditors)
    while i < len(debt) and j < len(credit):
        debtor_id, owed = debt[i]
        creditor_id, due = credit[j]
        amount = min(owed, due)
        if amount > 0:
            payments.append(Payment(debtor_id, creditor_id, amount))
        owed -= amount
        due -= amount
        debt[i] = (debtor_id, owed)
        credit[j] = (creditor_id, due)
        if owed == 0:
            i += 1
        if due == 0:
            j += 1
    return payments
