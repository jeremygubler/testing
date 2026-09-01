"""URL building and thinning for the book's map page – no network."""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest

from app.services.staticmap import MAX_PATH_POINTS, static_map_url, thin

BASE = "http://tiles:8080"
ROUTE = [(47.24, 7.97), (47.30, 8.10), (47.38, 8.54)]


def line(count: int) -> list[tuple[float, float]]:
    return [(47.0 + index / 1000, 8.0) for index in range(count)]


class TestThin:
    def test_a_short_line_is_left_alone(self) -> None:
        assert thin(ROUTE) == ROUTE

    def test_a_long_line_is_cut_to_the_limit(self) -> None:
        assert len(thin(line(5000))) == MAX_PATH_POINTS

    def test_both_ends_survive(self) -> None:
        """Losing the last point would visibly shorten the route on the page."""
        points = line(5000)
        sampled = thin(points)
        assert sampled[0] == points[0]
        assert sampled[-1] == points[-1]

    def test_the_order_is_kept(self) -> None:
        sampled = thin(line(1000))
        assert sampled == sorted(sampled)


class TestUrl:
    def test_no_tileserver_means_no_url(self) -> None:
        assert static_map_url("", "basic-preview", ROUTE) is None

    def test_a_single_point_is_not_a_route(self) -> None:
        assert static_map_url(BASE, "basic-preview", ROUTE[:1]) is None

    def test_the_server_is_asked_to_fit_the_view(self) -> None:
        url = static_map_url(BASE, "basic-preview", ROUTE)
        assert url is not None
        assert "/styles/basic-preview/static/auto/" in url

    def test_the_path_carries_every_point_in_order(self) -> None:
        url = static_map_url(BASE, "basic-preview", ROUTE)
        assert url is not None
        path = parse_qs(urlparse(url).query)["path"][0]
        assert path.startswith("fill:none|stroke:#2f6f4f|width:4|")
        assert path.endswith("47.2400,7.9700|47.3000,8.1000|47.3800,8.5400")

    def test_a_recorded_trip_stays_within_what_a_url_can_carry(self) -> None:
        # Servers stop reading somewhere around 8 kB; an unthinned line of 5000
        # points is roughly ten times that.
        url = static_map_url(BASE, "basic-preview", line(5000))
        assert url is not None
        assert len(url) < 4000

    def test_a_style_name_is_escaped_rather_than_pasted(self) -> None:
        url = static_map_url(BASE, "my style", ROUTE)
        assert url is not None
        assert "/styles/my%20style/static/" in url

    @pytest.mark.parametrize("base", ["http://tiles:8080", "http://tiles:8080/"])
    def test_a_trailing_slash_does_not_double(self, base: str) -> None:
        url = static_map_url(base, "basic-preview", ROUTE)
        assert url is not None
        assert "8080//styles" not in url
