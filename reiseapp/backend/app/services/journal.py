from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError, ConflictError, NotFoundError
from app.models import JournalEntry, JournalEntryPhoto, Photo, Trip, User
from app.schemas.journal import JournalEntryCreate, JournalEntryRead, JournalEntryUpdate
from app.services.photos import to_read as photo_to_read


def to_read(entry: JournalEntry) -> JournalEntryRead:
    return JournalEntryRead(
        id=entry.id,
        trip_id=entry.trip_id,
        stop_id=entry.stop_id,
        author_id=entry.author_id,
        title=entry.title,
        text=entry.text,
        timestamp=entry.timestamp,
        # photo_links is ordered by position at the relationship level.
        photos=[photo_to_read(link.photo) for link in entry.photo_links],
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


def _loaded() -> tuple[object, ...]:
    return (selectinload(JournalEntry.photo_links).selectinload(JournalEntryPhoto.photo),)


async def _resolve_photos(
    session: AsyncSession, trip: Trip, photo_ids: list[UUID]
) -> list[UUID]:
    """Keeps the given order and refuses photos from another trip."""
    if not photo_ids:
        return []
    result = await session.execute(
        select(Photo.id).where(
            Photo.id.in_(photo_ids), Photo.trip_id == trip.id, Photo.deleted_at.is_(None)
        )
    )
    known = set(result.scalars().all())
    missing = [pid for pid in photo_ids if pid not in known]
    if missing:
        raise AppError(f"{len(missing)} of the referenced photos do not belong to this trip")
    # De-duplicate while preserving order: the same photo twice in one entry is
    # a client mistake, not an ordering instruction.
    seen: set[UUID] = set()
    ordered: list[UUID] = []
    for photo_id in photo_ids:
        if photo_id not in seen:
            seen.add(photo_id)
            ordered.append(photo_id)
    return ordered


async def _set_photos(
    session: AsyncSession, entry: JournalEntry, photo_ids: list[UUID]
) -> None:
    # A DELETE statement rather than entry.photo_links.clear(): touching the
    # collection lazy-loads it, and a lazy load outside the greenlet context is
    # exactly what MissingGreenlet is.
    await session.execute(
        delete(JournalEntryPhoto).where(JournalEntryPhoto.entry_id == entry.id)
    )
    await session.flush()
    for position, photo_id in enumerate(photo_ids):
        session.add(
            JournalEntryPhoto(entry_id=entry.id, photo_id=photo_id, position=position)
        )
    await session.flush()


async def create_entry(
    session: AsyncSession, trip: Trip, author: User, data: JournalEntryCreate
) -> JournalEntry:
    if data.id is not None and await session.get(JournalEntry, data.id) is not None:
        raise ConflictError("A journal entry with this id already exists")

    photo_ids = await _resolve_photos(session, trip, data.photo_ids)
    entry = JournalEntry(
        trip_id=trip.id,
        stop_id=data.stop_id,
        author_id=author.id,
        title=data.title,
        text=data.text,
        timestamp=data.timestamp,
    )
    if data.id is not None:
        entry.id = data.id
    session.add(entry)
    await session.flush()
    await _set_photos(session, entry, photo_ids)
    return await get_entry(session, trip, entry.id)


async def list_entries(session: AsyncSession, trip: Trip) -> list[JournalEntry]:
    result = await session.execute(
        select(JournalEntry)
        .options(*_loaded())  # type: ignore[arg-type]
        .where(JournalEntry.trip_id == trip.id, JournalEntry.deleted_at.is_(None))
        .order_by(JournalEntry.timestamp, JournalEntry.created_at)
    )
    return list(result.scalars().unique().all())


async def get_entry(session: AsyncSession, trip: Trip, entry_id: UUID) -> JournalEntry:
    result = await session.execute(
        select(JournalEntry)
        .options(*_loaded())  # type: ignore[arg-type]
        # populate_existing: the instance may already sit in the identity map
        # with a stale photo collection from before the links were rewritten.
        .execution_options(populate_existing=True)
        .where(
            JournalEntry.id == entry_id,
            JournalEntry.trip_id == trip.id,
            JournalEntry.deleted_at.is_(None),
        )
    )
    entry = result.scalars().unique().one_or_none()
    if entry is None:
        raise NotFoundError("Journal entry not found")
    return entry


async def update_entry(
    session: AsyncSession, trip: Trip, entry: JournalEntry, data: JournalEntryUpdate
) -> JournalEntry:
    values = data.model_dump(exclude_unset=True)
    photo_ids = values.pop("photo_ids", None)
    for field, value in values.items():
        setattr(entry, field, value)
    await session.flush()

    if photo_ids is not None:
        await _set_photos(session, entry, await _resolve_photos(session, trip, photo_ids))
    return await get_entry(session, trip, entry.id)


async def delete_entry(session: AsyncSession, entry: JournalEntry) -> None:
    entry.deleted_at = datetime.now(UTC)
    await session.flush()
