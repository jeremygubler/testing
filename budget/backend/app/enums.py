from enum import StrEnum


class Flow(StrEnum):
    """Richtung eines Geldflusses."""

    INCOME = "INCOME"
    EXPENSE = "EXPENSE"


class CategoryGroup(StrEnum):
    """Ersetzt die fuenf festen Spalten-Typen der Excel-Loesung."""

    EINKOMMEN = "EINKOMMEN"
    FIXKOSTEN = "FIXKOSTEN"
    VARIABEL = "VARIABEL"
    SPAREN = "SPAREN"
    SCHULDEN = "SCHULDEN"


class AccountKind(StrEnum):
    """Art eines Kontos. Bestimmt nur Vorbelegungen und Darstellung, keine Logik."""

    CHECKING = "CHECKING"
    SAVINGS = "SAVINGS"
    CASH = "CASH"
    CREDIT_CARD = "CREDIT_CARD"


class Interval(StrEnum):
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"
    QUARTERLY = "QUARTERLY"
    YEARLY = "YEARLY"


class SplitTemplate(StrEnum):
    """Eingabe-Helfer. Gespeichert wird immer das Ergebnis in Splits."""

    SINGLE = "SINGLE"
    EQUAL = "EQUAL"
    KEY = "KEY"
    MANUAL = "MANUAL"


class SettlementBasis(StrEnum):
    """Referenz fuer den 'fairen Anteil' im Personen-Ausgleich."""

    WEIGHT = "WEIGHT"
    INCOME = "INCOME"


#: Zuordnung Gruppe -> erlaubter Flow. EINKOMMEN ist die einzige Einnahmen-Gruppe.
GROUP_FLOW: dict[CategoryGroup, Flow] = {
    CategoryGroup.EINKOMMEN: Flow.INCOME,
    CategoryGroup.FIXKOSTEN: Flow.EXPENSE,
    CategoryGroup.VARIABEL: Flow.EXPENSE,
    CategoryGroup.SPAREN: Flow.EXPENSE,
    CategoryGroup.SCHULDEN: Flow.EXPENSE,
}
