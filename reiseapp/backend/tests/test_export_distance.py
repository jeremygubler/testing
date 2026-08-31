"""Formatting the one number a travel book is judged by."""

from __future__ import annotations

import pytest

from app.services.export import format_distance


@pytest.mark.parametrize(
    ("metres", "expected"),
    [
        (42, "42 m"),
        (0.4, "0 m"),
        (999, "999 m"),
        (1000, "1,0 km"),
        (1449, "1,4 km"),
        (9949, "9,9 km"),
        (10_000, "10 km"),
        (12_640, "13 km"),
        (1_284_000, "1284 km"),
    ],
)
def test_format_distance(metres: float, expected: str) -> None:
    assert format_distance(metres) == expected
