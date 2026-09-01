# Targets mirror .github/workflows/*.yml. `make check` is what CI runs, so a
# green run here means the same thing as a green pipeline — the point being not
# to re-type the path lists by hand and quietly skip one.

BACKEND := backend
VENV := $(BACKEND)/.venv/bin
MOBILE := mobile

.PHONY: up down logs migrate shell \
        lint typecheck test test-integration drift downgrade check \
        mobile-check mobile-bundle check-all

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

# CI tears the schema down at the end of the job and throws the database away.
# Locally the same database is reused, so upgrade again afterwards.
downgrade:
	cd $(BACKEND) && .venv/bin/alembic downgrade base && .venv/bin/alembic upgrade head

# Catches what the test suite structurally cannot: production code importing a
# package that is only a dev dependency. The image installs `pip install .`
# without the dev extra, while every venv that runs the tests has it — so the
# suite passes and the container dies on startup with ModuleNotFoundError.
runtime-import:
	cd $(BACKEND) && rm -rf .venv-runtime \
	  && .venv/bin/python -m venv .venv-runtime \
	  && .venv-runtime/bin/pip -q install . \
	  && .venv-runtime/bin/python -c "import app.main" \
	  && rm -rf .venv-runtime

check: lint typecheck test drift test-integration downgrade runtime-import

# --- mobile ---

mobile-check:
	cd $(MOBILE) && npm run typecheck && npm run lint && npm test

# Catches what tsc cannot: a module that resolves for the type checker but blows
# up in the Metro bundler.
mobile-bundle:
	cd $(MOBILE) && npx expo export --platform android --output-dir /tmp/expo-export

check-all: check mobile-check mobile-bundle
