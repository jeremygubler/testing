from __future__ import annotations

from app.db.base import Base
from app.models import Trip, User, Waypoint


def test_all_core_tables_registered() -> None:
    expected = {
        "users",
        "trips",
        "trip_members",
        "waypoints",
        "stops",
        "photos",
        "journal_entries",
        "journal_entry_photos",
    }
    assert expected <= set(Base.metadata.tables)


def test_waypoint_geometry_is_geography_point_4326() -> None:
    geom = Waypoint.__table__.c.geom.type
    assert geom.geometry_type == "POINT"
    assert geom.srid == 4326


def test_ids_are_client_generatable_uuids() -> None:
    # Offline-first: ids must be assignable without touching the database, so the
    # default has to be a Python-side callable, not a server default.
    for model in (User, Trip, Waypoint):
        column = model.__table__.c.id
        assert column.primary_key
        assert column.default is not None and column.default.is_callable
        assert column.server_default is None


def test_soft_delete_column_present_on_syncable_tables() -> None:
    for table in ("trips", "waypoints", "stops", "photos", "journal_entries"):
        assert "deleted_at" in Base.metadata.tables[table].c


def test_photo_geometry_is_nullable_but_track_geometry_is_not() -> None:
    # Regression: GeoAlchemy2 writes nullability back onto the type object, so a
    # shared Geography instance would make photos.geom NOT NULL – a photo without
    # EXIF GPS must still be storable.
    from app.models import Photo

    assert Photo.__table__.c.geom.nullable is True
    assert Waypoint.__table__.c.geom.nullable is False


def test_journal_photo_link_has_no_redundant_unique_constraint() -> None:
    from sqlalchemy import UniqueConstraint

    table = Base.metadata.tables["journal_entry_photos"]
    assert [c.name for c in table.primary_key.columns] == ["entry_id", "photo_id"]
    assert not [c for c in table.constraints if isinstance(c, UniqueConstraint)]
