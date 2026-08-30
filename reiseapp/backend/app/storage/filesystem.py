from __future__ import annotations

from pathlib import Path

import anyio

from app.storage.base import ObjectNotFoundError


class FilesystemStore:
    """Stores objects as files under a root directory."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)

    def _path(self, key: str) -> Path:
        # Keys are built by us, never by the client, but a traversal here would
        # write anywhere on the volume – so make it structurally impossible.
        candidate = (self.root / key).resolve()
        root = self.root.resolve()
        if not candidate.is_relative_to(root):
            raise ValueError(f"Refusing to escape the storage root: {key!r}")
        return candidate

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        await anyio.to_thread.run_sync(lambda: path.parent.mkdir(parents=True, exist_ok=True))
        await anyio.Path(path).write_bytes(data)

    async def get(self, key: str) -> bytes:
        path = anyio.Path(self._path(key))
        if not await path.exists():
            raise ObjectNotFoundError(key)
        return await path.read_bytes()

    async def delete(self, key: str) -> None:
        path = anyio.Path(self._path(key))
        if await path.exists():
            await path.unlink()

    async def exists(self, key: str) -> bool:
        return await anyio.Path(self._path(key)).exists()

    async def healthy(self) -> bool:
        try:
            await anyio.to_thread.run_sync(
                lambda: self.root.mkdir(parents=True, exist_ok=True)
            )
        except OSError:
            return False
        return True
