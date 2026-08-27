#!/bin/sh
set -e

alembic upgrade head

# Beispieldaten nur auf ausdruecklichen Wunsch. Ohne sie zeigt die App beim ersten
# Start ihre Erstinbetriebnahme -- das ist fuer einen echten Haushalt das Richtige.
if [ "${BUDGET_SEED_DEMO:-0}" = "1" ]; then
  python seed.py
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
