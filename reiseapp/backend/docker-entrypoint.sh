#!/bin/sh
set -e

# Migrations run here rather than in the app process so that scaling the
# backend to >1 replica does not race on the alembic version table.
if [ "${REISEAPP_RUN_MIGRATIONS_ON_STARTUP:-true}" = "true" ]; then
    echo "[entrypoint] applying alembic migrations..."
    alembic upgrade head
fi

exec "$@"
