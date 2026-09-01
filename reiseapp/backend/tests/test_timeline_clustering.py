"""Photo clustering – pure logic over in-memory objects, no database."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from app.models import Photo
from app.services.timeline import CLUSTER_GAP, cluster_photos

T0 = datetime(2026, 6, 1, 10, 0, tzinfo=UTC)


def photo(minutes: int, stop_id: uuid.UUID | None = None) -> Photo:
    return Photo(
        id=uuid.uuid4(),
        trip_id=uuid.uuid4(),
        stop_id=stop_id,
        storage_key=f"k{minutes}",
        taken_at=T0 + timedelta(minutes=minutes),
    )


def test_no_photos_no_clusters() -> None:
    assert cluster_photos([]) == []


def test_photos_within_the_gap_form_one_burst() -> None:
    clusters = cluster_photos([photo(0), photo(20), photo(45)])
    assert [len(cluster) for cluster in clusters] == [3]


def test_a_long_pause_starts_a_new_cluster() -> None:
    gap_minutes = int(CLUSTER_GAP.total_seconds() // 60) + 5
    clusters = cluster_photos([photo(0), photo(gap_minutes)])
    assert [len(cluster) for cluster in clusters] == [1, 1]


def test_a_different_stop_splits_even_within_the_gap() -> None:
    # Two places minutes apart are two moments, however close in time.
    here, there = uuid.uuid4(), uuid.uuid4()
    clusters = cluster_photos([photo(0, here), photo(5, there), photo(10, there)])
    assert [len(cluster) for cluster in clusters] == [1, 2]


def test_input_order_does_not_matter() -> None:
    late, early, middle = photo(50), photo(0), photo(25)
    clusters = cluster_photos([late, early, middle])
    assert [p.id for p in clusters[0]] == [early.id, middle.id, late.id]
