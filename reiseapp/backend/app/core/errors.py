"""Domain errors.

The service layer raises these; a single handler in main.py turns them into the
error envelope. That keeps services free of FastAPI imports.
"""

from __future__ import annotations


class AppError(Exception):
    status_code = 400
    type = "bad_request"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class AuthenticationError(AppError):
    status_code = 401
    type = "unauthenticated"


class PermissionDeniedError(AppError):
    status_code = 403
    type = "forbidden"


class NotFoundError(AppError):
    status_code = 404
    type = "not_found"


class ConflictError(AppError):
    status_code = 409
    type = "conflict"


class RegistrationClosedError(AppError):
    status_code = 403
    type = "registration_closed"
