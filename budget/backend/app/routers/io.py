import datetime as dt

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import select

from app.deps import CurrentHousehold, DbSession
from app.models import Category, Member
from app.schemas import (
    ImportPreview,
    ImportRequest,
    ImportResult,
    ImportRowPreview,
    ResetRequest,
    ResetResult,
    ResetScope,
    RestoreRequest,
    RestoreResult,
    SplitSpec,
)
from app.services import inference
from app.services import io as service
from app.services import transactions as txn_service
from app.services.splits import SplitError

router = APIRouter(prefix="/api/io", tags=["io"])


@router.get("/export/transactions.csv", response_class=PlainTextResponse)
def export_transactions_csv(household: CurrentHousehold, db: DbSession) -> PlainTextResponse:
    csv_text = service.transactions_csv(db, household)
    filename = f"buchungen-{dt.date.today().isoformat()}.csv"
    return PlainTextResponse(
        # BOM, damit Excel die Umlaute richtig liest.
        "﻿" + csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/household.json")
def export_household_json(household: CurrentHousehold, db: DbSession) -> JSONResponse:
    filename = f"haushalt-{dt.date.today().isoformat()}.json"
    return JSONResponse(
        service.household_json(db, household),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _lookup(household_id: int, db) -> tuple[dict[str, Category], dict[str, Member]]:
    categories = {
        service.normalize(c.name): c
        for c in db.scalars(select(Category).where(Category.household_id == household_id))
    }
    members = {
        service.normalize(m.name): m
        for m in db.scalars(select(Member).where(Member.household_id == household_id))
    }
    return categories, members


def _analyze(payload: ImportRequest, household, db) -> list[ImportRowPreview]:
    categories, members = _lookup(household.id, db)
    seen: set[tuple[str, int, str]] = set()
    previews: list[ImportRowPreview] = []

    # Zeilen ohne erkennbare Kategorie aus der eigenen Historie erraten. Das ist der
    # Unterschied zwischen "300 Zeilen von Hand zuordnen" und "durchsehen".
    guesses = (
        inference.suggest_many(
            db, household.id, [row.description for row in payload.rows if row.description]
        )
        if payload.guess_categories
        else {}
    )

    for row in payload.rows:
        errors: list[str] = []

        date = service.parse_date(row.date)
        if date is None:
            errors.append(f"Datum nicht lesbar: {row.date!r}")

        amount, amount_error = service.parse_amount_cell(row.amount, payload.keep_sign)
        if amount_error:
            errors.append(amount_error)

        category = categories.get(service.normalize(row.category)) if row.category else None
        category_source = "CSV" if category is not None else None

        if category is None:
            guess = guesses.get(inference.normalize(row.description))
            if guess is not None:
                category = db.get(Category, guess.category_id)
                category_source = "HISTORY"

        if category is None and payload.fallback_category_id is not None:
            category = db.get(Category, payload.fallback_category_id)
            if category is not None and category.household_id != household.id:
                category = None
            else:
                category_source = "FALLBACK"

        if category is None:
            errors.append(
                f"Kategorie unbekannt: {row.category!r}" if row.category else "Keine Kategorie"
            )
            category_source = None
        elif not category.is_active:
            errors.append(f"Kategorie '{category.name}' ist deaktiviert")

        member = members.get(service.normalize(row.member)) if row.member else None
        if row.member and member is None:
            errors.append(f"Person unbekannt: {row.member!r}")

        duplicate_id = None
        if date is not None and amount is not None:
            duplicate_id = service.find_duplicate(db, household.id, date, amount, row.description)
            # Auch Dubletten innerhalb derselben Datei erkennen.
            key = (date.isoformat(), amount, service.normalize(row.description))
            if key in seen:
                duplicate_id = duplicate_id or -1
            seen.add(key)

        previews.append(
            ImportRowPreview(
                row_number=row.row_number,
                date=date,
                amount_minor=amount,
                description=row.description.strip(),
                category_id=category.id if category else None,
                category_name=category.name if category else None,
                category_source=category_source,
                member_id=member.id if member else None,
                is_duplicate=duplicate_id is not None,
                duplicate_transaction_id=duplicate_id if (duplicate_id or 0) > 0 else None,
                error="; ".join(errors) if errors else None,
            )
        )
    return previews


@router.post("/import/preview", response_model=ImportPreview)
def preview_import(
    payload: ImportRequest, household: CurrentHousehold, db: DbSession
) -> ImportPreview:
    """Zeigt jede Zeile mit ihrem Zustand. Schreibt nichts."""
    rows = _analyze(payload, household, db)
    return ImportPreview(
        rows=rows,
        total=len(rows),
        importable=sum(1 for row in rows if row.error is None),
        duplicates=sum(1 for row in rows if row.is_duplicate),
        errors=sum(1 for row in rows if row.error is not None),
    )


@router.post("/import", response_model=ImportResult)
def commit_import(
    payload: ImportRequest,
    household: CurrentHousehold,
    db: DbSession,
    skip_duplicates: bool = True,
) -> ImportResult:
    rows = _analyze(payload, household, db)
    created = 0
    skipped = 0

    for row in rows:
        if (
            row.error is not None
            or row.date is None
            or row.amount_minor is None
            or row.category_id is None
        ):
            skipped += 1
            continue
        if skip_duplicates and row.is_duplicate:
            skipped += 1
            continue

        split = (
            SplitSpec(template="SINGLE", member_id=row.member_id)
            if row.member_id is not None
            else payload.fallback_split
        )
        try:
            txn_service.create_transaction(
                db,
                household,
                date=row.date,
                category_id=row.category_id,
                account_id=payload.account_id,
                description=row.description,
                note=None,
                amount_minor=row.amount_minor,
                split=split,
            )
        except SplitError as exc:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Zeile {row.row_number}: {exc}",
            ) from exc
        created += 1

    return ImportResult(created=created, skipped=skipped)


@router.post("/restore", response_model=RestoreResult)
def restore(payload: RestoreRequest, household: CurrentHousehold, db: DbSession) -> RestoreResult:
    """Spielt ein JSON-Backup zurueck.

    Der bestehende Haushalt wird dabei vollstaendig ersetzt. Weil das nicht
    rueckgaengig zu machen ist, muss ``confirm_replace`` ausdruecklich gesetzt sein --
    ein versehentlicher Aufruf soll keine Daten kosten.
    """
    if not payload.confirm_replace:
        raise HTTPException(
            422,
            "Das Zurueckspielen ersetzt den gesamten Haushalt. "
            "Bitte ausdruecklich bestaetigen (confirm_replace).",
        )
    try:
        counts = service.restore_household(db, household, payload.backup)
    except service.RestoreError as exc:
        raise HTTPException(422, str(exc)) from exc
    except (KeyError, TypeError, ValueError) as exc:
        # Ein kaputtes Backup darf keinen halben Haushalt hinterlassen -- die Session
        # wird von get_db zurueckgerollt.
        raise HTTPException(422, f"Das Backup ist fehlerhaft: {exc}") from exc
    return RestoreResult(restored=counts)


@router.post("/reset", response_model=ResetResult)
def reset(payload: ResetRequest, household: CurrentHousehold, db: DbSession) -> ResetResult:
    """Leert den Haushalt -- entweder nur die Buchungen oder alles."""
    keep_master_data = payload.scope is ResetScope.TRANSACTIONS
    removed = service.wipe(db, household.id, keep_master_data=keep_master_data)

    if payload.scope is ResetScope.ALL:
        # Ohne Haushalt zeigt die App wieder ihre Einrichtung -- das ist hier gewollt.
        db.delete(household)
        db.flush()
        return ResetResult(removed=removed, household_deleted=True)
    return ResetResult(removed=removed, household_deleted=False)
