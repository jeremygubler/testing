from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import CurrentHousehold, DbSession
from app.models import Account, Transaction
from app.schemas import AccountBalanceRead, AccountCreate, AccountRead, AccountUpdate
from app.services import accounts as service

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def _get(db: Session, household_id: int, account_id: int) -> Account:
    account = db.get(Account, account_id)
    if account is None or account.household_id != household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Konto nicht gefunden.")
    return account


@router.get("", response_model=list[AccountRead])
def list_accounts(
    household: CurrentHousehold, db: DbSession, include_inactive: bool = True
) -> list[AccountRead]:
    query = select(Account).where(Account.household_id == household.id)
    if not include_inactive:
        query = query.where(Account.is_active.is_(True))
    rows = db.scalars(query.order_by(Account.sort_order, Account.id))
    return [AccountRead.model_validate(row) for row in rows]


@router.get("/balances", response_model=list[AccountBalanceRead])
def account_balances(household: CurrentHousehold, db: DbSession) -> list[AccountBalanceRead]:
    """Kontostaende. Berechnet, nie gespeichert."""
    return [
        AccountBalanceRead(
            account_id=row.account_id,
            name=row.name,
            kind=row.kind,
            color=row.color,
            include_in_available=row.include_in_available,
            is_active=row.is_active,
            opening_balance_minor=row.opening_balance_minor,
            flow_minor=row.flow_minor,
            transfer_minor=row.transfer_minor,
            balance_minor=row.balance_minor,
        )
        for row in service.balances(db, household)
    ]


@router.post("", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: AccountCreate, household: CurrentHousehold, db: DbSession
) -> AccountRead:
    if db.scalar(
        select(Account).where(Account.household_id == household.id, Account.name == payload.name)
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Es gibt bereits ein Konto namens '{payload.name}'."
        )
    account = Account(household_id=household.id, **payload.model_dump())
    db.add(account)
    db.flush()
    return AccountRead.model_validate(account)


@router.patch("/{account_id}", response_model=AccountRead)
def update_account(
    account_id: int, payload: AccountUpdate, household: CurrentHousehold, db: DbSession
) -> AccountRead:
    account = _get(db, household.id, account_id)
    data = payload.model_dump(exclude_unset=True)

    if "name" in data and data["name"] != account.name:
        clash = db.scalar(
            select(Account).where(
                Account.household_id == household.id,
                Account.name == data["name"],
                Account.id != account.id,
            )
        )
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, "Kontoname ist bereits vergeben.")

    if data.get("is_active") is False and _in_use(db, account.id):
        # Deaktivieren ist erlaubt und richtig -- nur das letzte aktive Konto nicht,
        # sonst laesst sich nichts mehr erfassen.
        remaining = db.scalar(
            select(func.count())
            .select_from(Account)
            .where(
                Account.household_id == household.id,
                Account.is_active.is_(True),
                Account.id != account.id,
            )
        )
        if not remaining:
            raise HTTPException(422, "Das letzte aktive Konto kann nicht deaktiviert werden.")

    for field, value in data.items():
        setattr(account, field, value)
    db.flush()
    return AccountRead.model_validate(account)


def _in_use(db: Session, account_id: int) -> bool:
    used = db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(
            (Transaction.account_id == account_id) | (Transaction.counter_account_id == account_id)
        )
    )
    return bool(used)


@router.delete("/{account_id}", response_model=AccountRead)
def deactivate_account(account_id: int, household: CurrentHousehold, db: DbSession) -> AccountRead:
    """Konten mit Buchungen werden deaktiviert, nicht geloescht -- sonst verloeren die
    Buchungen ihren Kontostand. Ein unbenutztes Konto darf wirklich weg."""
    account = _get(db, household.id, account_id)
    remaining = db.scalar(
        select(func.count())
        .select_from(Account)
        .where(
            Account.household_id == household.id,
            Account.is_active.is_(True),
            Account.id != account.id,
        )
    )
    if account.is_active and not remaining:
        raise HTTPException(422, "Das letzte aktive Konto kann nicht entfernt werden.")

    if not _in_use(db, account.id):
        result = AccountRead.model_validate(account)
        db.delete(account)
        db.flush()
        return result.model_copy(update={"is_active": False})

    account.is_active = False
    db.flush()
    return AccountRead.model_validate(account)
