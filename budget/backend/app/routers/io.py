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
    SplitSpec,
)
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

    for row in payload.rows:
        errors: list[str] = []

        date = service.parse_date(row.date)
        if date is None:
            errors.append(f"Datum nicht lesbar: {row.date!r}")

        amount, amount_error = service.parse_amount_cell(row.amount, payload.keep_sign)
        if amount_error:
            errors.append(amount_error)

        category = categories.get(service.normalize(row.category)) if row.category else None
        if category is None and payload.fallback_category_id is not None:
            category = db.get(Category, payload.fallback_category_id)
            if category is not None and category.household_id != household.id:
                category = None
        if category is None:
            errors.append(
                f"Kategorie unbekannt: {row.category!r}" if row.category else "Keine Kategorie"
            )
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
        if row.error is not None or row.date is None or row.amount_minor is None or row.category_id is None:
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
