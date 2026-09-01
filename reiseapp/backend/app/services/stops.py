from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ConflictError, NotFoundError
from app.models import Stop, Trip
from app.schemas.geo import StopCreate, StopRead, StopUpdate
from app.services.geo import lat_lon, point_ewkt


def to_read(stop: Stop) -> StopRead:
    coordinates = lat_lon(stop.geom)  # type: ignore[arg-type]
    if coordinates is None:  # pragma: no cover – the column is NOT NULL
        raise AppError("Stop without a position")
    lat, lon = coordinates
    return StopRead(
        id=stop.id,
        trip_id=stop.trip_id,
        name=stop.name,
        lat=lat,
        lon=lon,
        altitude_m=stop.altitude_m,
        arrived_at=stop.arrived_at,
        left_at=stop.left_at,
        country=stop.country,
        locality=stop.locality,
        notes=stop.notes,
        created_at=stop.created_at,
        updated_at=stop.updated_at,
    )


async def create_stop(session: AsyncSession, trip: Trip, data: StopCreate) -> Stop:
    if data.id is not None and await session.get(Stop, data.id) is not None:
        raise ConflictError("A stop with this id already exists")
    stop = Stop(
        trip_id=trip.id,
        name=data.name.strip(),
        geom=point_ewkt(data.lat, data.lon),
        altitude_m=data.altitude_m,
        arrived_at=data.arrived_at,
        left_at=data.left_at,
        country=data.country.upper() if data.country else None,
        locality=data.locality,
        notes=data.notes,
    )
    if data.id is not None:
        stop.id = data.id
    session.add(stop)
    await session.flush()
    await session.refresh(stop)
    return stop


async def list_stops(session: AsyncSession, trip: Trip) -> list[Stop]:
    result = await session.execute(
        select(Stop)
        .where(Stop.trip_id == trip.id, Stop.deleted_at.is_(None))
        # Stops without a time still have to land somewhere stable in the list.
        .order_by(Stop.arrived_at.nulls_last(), Stop.created_at)
    )
    return list(result.scalars().all())


async def get_stop(session: AsyncSession, trip: Trip, stop_id: UUID) -> Stop:
    result = await session.execute(
        select(Stop).where(
            Stop.id == stop_id, Stop.trip_id == trip.id, Stop.deleted_at.is_(None)
        )
    )
    stop = result.scalar_one_or_none()
    if stop is None:
        raise NotFoundError("Stop not found")
    return stop


async def update_stop(session: AsyncSession, stop: Stop, data: StopUpdate) -> Stop:
    values = data.model_dump(exclude_unset=True)
    lat, lon = values.pop("lat", None), values.pop("lon", None)
    if lat is not None and lon is not None:
        stop.geom = point_ewkt(lat, lon)
    if "country" in values and values["country"]:
        values["country"] = values["country"].upper()
    for field, value in values.items():
        setattr(stop, field, value)

    if stop.arrived_at and stop.left_at and stop.left_at < stop.arrived_at:
        raise AppError("left_at must not be before arrived_at")
    await session.flush()
    await session.refresh(stop)
    return stop


async def delete_stop(session: AsyncSession, stop: Stop) -> None:
    stop.deleted_at = datetime.now(UTC)
    await session.flush()
