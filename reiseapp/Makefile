# Targets mirror .github/workflows/*.yml. `make check` is what CI runs, so a
# green run here means the same thing as a green pipeline — the point being not
# to re-type the path lists by hand and quietly skip one.

BACKEND := backend
VENV := $(BACKEND)/.venv/bin
MOBILE := mobile

.PHONY: up down logs migrate shell \
        lint typecheck test test-integration drift check \
        mobile-check check-all

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f backend

migrate:
	docker compose exec backend alembic upgrade head

shell:
	docker compose exec db psql -U $${POSTGRES_USER:-reiseapp} -d $${POSTGRES_DB:-reiseapp}

# --- backend (needs REISEAPP_DATABASE_URL for the DB-backed targets) ---

lint:
	cd $(BACKEND) && .venv/bin/ruff check app tests alembic

typecheck:
	cd $(BACKEND) && .venv/bin/mypy app

test:
	cd $(BACKEND) && .venv/bin/pytest -q -m "not integration"

test-integration:
	cd $(BACKEND) && .venv/bin/pytest -q -m integration

drift:
	cd $(BACKEND) && .venv/bin/alembic upgrade head && .venv/bin/alembic check

check: lint typecheck test drift test-integration

# --- mobile ---

mobile-check:
	cd $(MOBILE) && npm run typecheck && npm run lint && npm test

check-all: check mobile-check
