"""initial schema: postgis + core travel model

Revision ID: 0001
Revises:
Create Date: 2026-08-29
"""
from __future__ import annotations

from collections.abc import Sequence

import geoalchemy2
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TS = sa.DateTime(timezone=True)


def _point() -> geoalchemy2.types.Geography:
    # A fresh instance per column: GeoAlchemy2's DDL listener writes nullability
    # back onto the type, so sharing one object leaks NOT NULL between tables.
    return geoalchemy2.types.Geography(geometry_type="POINT", srid=4326, spatial_index=False)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", _TS, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", _TS, server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", _TS, nullable=True),
    ]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_updated_at"), "users", ["updated_at"])

    op.create_table(
        "trips",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        # FK added at the end of this migration – photos does not exist yet.
        sa.Column("cover_photo_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column(
            "visibility",
            sa.Enum(
                "private", "link", "public",
                name="tripvisibility", native_enum=False, length=16,
            ),
            nullable=False,
            server_default="private",
        ),
        *_timestamps(),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_trips_owner_id"), "trips", ["owner_id"])
    op.create_index(op.f("ix_trips_updated_at"), "trips", ["updated_at"])

    op.create_table(
        "trip_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "role",
            sa.Enum("owner", "editor", "viewer", name="memberrole", native_enum=False, length=16),
            nullable=False,
            server_default="viewer",
        ),
        *_timestamps(),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("trip_id", "user_id"),
    )
    op.create_index(op.f("ix_trip_members_trip_id"), "trip_members", ["trip_id"])
    op.create_index(op.f("ix_trip_members_user_id"), "trip_members", ["user_id"])
    op.create_index(op.f("ix_trip_members_updated_at"), "trip_members", ["updated_at"])

    op.create_table(
        "waypoints",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("geom", _point(), nullable=False),
        sa.Column("altitude_m", sa.Float(), nullable=True),
        sa.Column("accuracy_m", sa.Float(), nullable=True),
        sa.Column("speed_mps", sa.Float(), nullable=True),
        sa.Column("heading_deg", sa.Float(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "source",
            sa.Enum("gps", "import", "manual", name="waypointsource", native_enum=False, length=16),
            nullable=False,
            server_default="gps",
        ),
        sa.Column("device_id", sa.String(length=64), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_waypoints_trip_id_recorded_at", "waypoints", ["trip_id", "recorded_at"])
    op.create_index("ix_waypoints_geom", "waypoints", ["geom"], postgresql_using="gist")
    op.create_index(op.f("ix_waypoints_updated_at"), "waypoints", ["updated_at"])

    op.create_table(
        "stops",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("geom", _point(), nullable=False),
        sa.Column("altitude_m", sa.Float(), nullable=True),
        sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("country", sa.String(length=2), nullable=True),
        sa.Column("locality", sa.String(length=200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stops_trip_id_arrived_at", "stops", ["trip_id", "arrived_at"])
    op.create_index("ix_stops_geom", "stops", ["geom"], postgresql_using="gist")
    op.create_index(op.f("ix_stops_updated_at"), "stops", ["updated_at"])

    op.create_table(
        "photos",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stop_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=True),
        sa.Column(
            "content_type", sa.String(length=100), nullable=False, server_default="image/jpeg"
        ),
        sa.Column("byte_size", sa.BigInteger(), nullable=True),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("geom", _point(), nullable=True),
        sa.Column("altitude_m", sa.Float(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("caption", sa.String(length=500), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stop_id"], ["stops.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index("ix_photos_trip_id_taken_at", "photos", ["trip_id", "taken_at"])
    op.create_index("ix_photos_geom", "photos", ["geom"], postgresql_using="gist")
    op.create_index(op.f("ix_photos_stop_id"), "photos", ["stop_id"])
    op.create_index(op.f("ix_photos_checksum_sha256"), "photos", ["checksum_sha256"])
    op.create_index(op.f("ix_photos_updated_at"), "photos", ["updated_at"])

    op.create_table(
        "journal_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stop_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("text", sa.Text(), nullable=False, server_default=""),
        *_timestamps(),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stop_id"], ["stops.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_journal_entries_trip_id_timestamp", "journal_entries", ["trip_id", "timestamp"]
    )
    op.create_index(op.f("ix_journal_entries_stop_id"), "journal_entries", ["stop_id"])
    op.create_index(op.f("ix_journal_entries_updated_at"), "journal_entries", ["updated_at"])

    op.create_table(
        "journal_entry_photos",
        sa.Column("entry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("photo_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["entry_id"], ["journal_entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["photo_id"], ["photos.id"], ondelete="CASCADE"),
        # The composite PK already enforces uniqueness – a separate UNIQUE would
        # be a second index for nothing (and shows up as drift in `alembic check`).
        sa.PrimaryKeyConstraint("entry_id", "photo_id"),
    )

    op.create_foreign_key(
        "fk_trips_cover_photo_id_photos",
        "trips",
        "photos",
        ["cover_photo_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_trips_cover_photo_id_photos", "trips", type_="foreignkey")
    op.drop_table("journal_entry_photos")
    op.drop_table("journal_entries")
    op.drop_table("photos")
    op.drop_table("stops")
    op.drop_table("waypoints")
    op.drop_table("trip_members")
    op.drop_table("trips")
    op.drop_table("users")
    # postgis extension is left in place – other schemas may rely on it.
