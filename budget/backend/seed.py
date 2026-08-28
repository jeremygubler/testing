"""CLI: Beispieldaten anlegen.  Aufruf:  python seed.py [--reset]"""

import sys

from app.db import SessionLocal, engine
from app.services.seed import seed_demo


def main() -> int:
    if "--reset" in sys.argv:
        import app.ddl  # noqa: F401
        from app.db import Base as MetaBase
        from app.models import Base  # noqa: F401

        MetaBase.metadata.drop_all(engine)
        MetaBase.metadata.create_all(engine)
    with SessionLocal() as db:
        household = seed_demo(db)
        print(f"Haushalt bereit: #{household.id} {household.name} ({household.currency})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
