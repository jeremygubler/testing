from __future__ import annotations

from functools import lru_cache
from typing import Any

import anyio
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.core.config import get_settings
from app.storage.base import ObjectNotFoundError


@lru_cache
def get_s3_client() -> Any:
    """boto3 client against MinIO. Path-style addressing – MinIO has no vhost DNS."""
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key.get_secret_value(),
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


class S3Store:
    """boto3 is blocking, so every call goes through a worker thread."""

    def __init__(self, bucket: str) -> None:
        self.bucket = bucket

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        await anyio.to_thread.run_sync(
            lambda: get_s3_client().put_object(
                Bucket=self.bucket, Key=key, Body=data, ContentType=content_type
            )
        )

    async def get(self, key: str) -> bytes:
        def _get() -> bytes:
            try:
                response = get_s3_client().get_object(Bucket=self.bucket, Key=key)
            except ClientError as exc:
                if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                    raise ObjectNotFoundError(key) from exc
                raise
            body: bytes = response["Body"].read()
            return body

        return await anyio.to_thread.run_sync(_get)

    async def delete(self, key: str) -> None:
        await anyio.to_thread.run_sync(
            lambda: get_s3_client().delete_object(Bucket=self.bucket, Key=key)
        )

    async def exists(self, key: str) -> bool:
        def _head() -> bool:
            try:
                get_s3_client().head_object(Bucket=self.bucket, Key=key)
            except ClientError:
                return False
            return True

        return await anyio.to_thread.run_sync(_head)

    async def healthy(self) -> bool:
        def _head_bucket() -> bool:
            try:
                get_s3_client().head_bucket(Bucket=self.bucket)
            except Exception:
                return False
            return True

        return await anyio.to_thread.run_sync(_head_bucket)
