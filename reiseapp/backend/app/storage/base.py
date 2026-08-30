"""Object storage behind one small interface.

Two backends: S3/MinIO for the normal self-hosted stack, and a plain directory
for people who would rather not run MinIO at all (and for the tests, which then
need no object store to exercise the photo pipeline).
"""

from __future__ import annotations

from typing import Protocol


class ObjectStore(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...

    async def get(self, key: str) -> bytes: ...

    async def delete(self, key: str) -> None: ...

    async def exists(self, key: str) -> bool: ...

    async def healthy(self) -> bool: ...


class ObjectNotFoundError(Exception):
    def __init__(self, key: str) -> None:
        super().__init__(f"No object stored under {key!r}")
        self.key = key
