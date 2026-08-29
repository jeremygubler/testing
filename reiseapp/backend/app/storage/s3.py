from __future__ import annotations

from functools import lru_cache
from typing import Any

import boto3
from botocore.client import Config

from app.core.config import get_settings


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


def bucket_reachable() -> bool:
    settings = get_settings()
    try:
        get_s3_client().head_bucket(Bucket=settings.s3_bucket)
    except Exception:
        return False
    return True
