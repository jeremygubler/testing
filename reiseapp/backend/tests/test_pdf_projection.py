"""The projection behind the route sketch – pure geometry, no canvas."""

from __future__ import annotations

import pytest

from app.services.pdfbook import SKETCH_PADDING, fit_projection

WIDTH, HEIGHT = 400.0, 200.0
REIDEN = (47.2433, 7.9688)
ZURICH = (47.3769, 8.5417)


def test_everything_lands_inside_the_box() -> None:
    project = fit_projection([REIDEN, ZURICH], WIDTH, HEIGHT)
    for place in (REIDEN, ZURICH):
        x, y = project(*place)
        assert SKETCH_PADDING - 0.01 <= x <= WIDTH - SKETCH_PADDING + 0.01
        assert -0.01 <= y <= HEIGHT + 0.01


def test_north_is_up_and_east_is_right() -> None:
    project = fit_projection([REIDEN, ZURICH], WIDTH, HEIGHT)
    south_west, north_east = project(*REIDEN), project(*ZURICH)
    assert north_east[0] > south_west[0]
    assert north_east[1] > south_west[1]


def test_a_single_place_does_not_divide_by_a_zero_span() -> None:
    """One stop and no track is a real trip, and it must still draw."""
    project = fit_projection([REIDEN], WIDTH, HEIGHT)
    x, y = project(*REIDEN)
    assert 0 <= x <= WIDTH
    assert 0 <= y <= HEIGHT


def test_longitude_is_squeezed_by_the_latitude() -> None:
    """Without the cosine correction a Swiss square would draw as a wide rectangle."""
    side = 0.1
    square = [(47.0, 8.0), (47.0 + side, 8.0 + side)]
    project = fit_projection(square, WIDTH, WIDTH)
    (x0, y0), (x1, y1) = project(*square[0]), project(*square[1])
    # cos(47°) ≈ 0.682: the same degree count spans less ground east-west.
    assert (x1 - x0) == pytest.approx((y1 - y0) * 0.682, rel=0.01)
