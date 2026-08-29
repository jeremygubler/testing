from __future__ import annotations

import pytest
from httpx import AsyncClient

from app import __version__


async def test_liveness_unprefixed(client: AsyncClient) -> None:
    response = await client.get("/health/live")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == __version__
    assert body["env"] == "test"


async def test_liveness_under_api_prefix(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.integration
async def test_readiness_reports_postgis(client: AsyncClient) -> None:
    """Needs a live database (`docker compose up -d db`)."""
    response = await client.get("/health/ready")
    body = response.json()
    assert body["database"] is True
    assert body["postgis"] is not None
    # Object storage is checked separately – it may legitimately be down here.
