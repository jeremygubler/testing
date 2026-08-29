.PHONY: up down logs migrate shell test lint typecheck check

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

lint:
	cd backend && ruff check app tests alembic

typecheck:
	cd backend && mypy app

test:
	cd backend && pytest -q -m "not integration"

check: lint typecheck test
