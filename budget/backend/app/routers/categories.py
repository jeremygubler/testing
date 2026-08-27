from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.deps import CurrentHousehold, DbSession
from app.enums import GROUP_FLOW, CategoryGroup
from app.models import Category, Transaction
from app.schemas import CategoryCreate, CategoryRead, CategoryUpdate

router = APIRouter(prefix="/api/categories", tags=["categories"])


def _get(db: DbSession, household: CurrentHousehold, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None or category.household_id != household.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kategorie nicht gefunden.")
    return category


@router.get("", response_model=list[CategoryRead])
def list_categories(
    household: CurrentHousehold,
    db: DbSession,
    include_inactive: bool = True,
    group: CategoryGroup | None = None,
) -> list[CategoryRead]:
    query = select(Category).where(Category.household_id == household.id)
    if not include_inactive:
        query = query.where(Category.is_active.is_(True))
    if group is not None:
        query = query.where(Category.group == group)
    rows = db.scalars(query.order_by(Category.sort_order, Category.id))
    return [CategoryRead.model_validate(row) for row in rows]


@router.post("", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate, household: CurrentHousehold, db: DbSession
) -> CategoryRead:
    if db.scalar(
        select(Category).where(Category.household_id == household.id, Category.name == payload.name)
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Die Kategorie '{payload.name}' existiert bereits."
        )
    data = payload.model_dump()
    # Der Flow folgt zwingend aus der Gruppe -- sonst gaebe es "Einkommen als Ausgabe".
    category = Category(household_id=household.id, flow=GROUP_FLOW[payload.group], **data)
    db.add(category)
    db.flush()
    return CategoryRead.model_validate(category)


@router.patch("/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: int, payload: CategoryUpdate, household: CurrentHousehold, db: DbSession
) -> CategoryRead:
    category = _get(db, household, category_id)
    data = payload.model_dump(exclude_unset=True)

    if "name" in data and data["name"] != category.name:
        clash = db.scalar(
            select(Category).where(
                Category.household_id == household.id,
                Category.name == data["name"],
                Category.id != category.id,
            )
        )
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, "Kategoriename ist bereits vergeben.")

    if "group" in data and GROUP_FLOW[data["group"]] != category.flow:
        # Ein Gruppenwechsel ueber die Flow-Grenze wuerde alle Auswertungen der
        # Vergangenheit umdrehen. Das ist keine Aenderung, das ist eine neue Kategorie.
        used = db.scalar(
            select(func.count())
            .select_from(Transaction)
            .where(Transaction.category_id == category.id)
        )
        if used:
            raise HTTPException(
                422,
                "Diese Kategorie hat Buchungen und kann nicht zwischen Einnahme und "
                "Ausgabe wechseln. Bitte eine neue Kategorie anlegen.",
            )
        category.flow = GROUP_FLOW[data["group"]]

    for field, value in data.items():
        setattr(category, field, value)
    db.flush()
    return CategoryRead.model_validate(category)


@router.delete("/{category_id}", response_model=CategoryRead)
def deactivate_category(
    category_id: int, household: CurrentHousehold, db: DbSession
) -> CategoryRead:
    """Kategorien werden deaktiviert, nicht geloescht -- Buchungen bleiben zuordenbar."""
    category = _get(db, household, category_id)
    category.is_active = False
    db.flush()
    return CategoryRead.model_validate(category)
