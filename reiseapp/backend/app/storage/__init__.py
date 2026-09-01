from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.storage.base import ObjectNotFoundError, ObjectStore


@lru_cache
def get_store() -> ObjectStore:
    settings = get_settings()
    if settings.storage_backend == "filesystem":
        from app.storage.filesystem import FilesystemStore

        return FilesystemStore(settings.storage_path)

    from app.storage.s3 import S3Store

    return S3Store(settings.s3_bucket)


__all__ = ["ObjectNotFoundError", "ObjectStore", "get_store"]
