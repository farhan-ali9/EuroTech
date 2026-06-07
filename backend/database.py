"""Postgres persistence for BumpLess defects.

Runs against the Postgres container defined in ../docker-compose.yml.
Connection is read from DATABASE_URL; the default matches the compose file so
local development needs no configuration.
"""
import os
import time

from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://bumpless:bumpless@localhost:5432/bumpless",
)

# open=False → we open explicitly in init_db() with a retry loop, so the backend
# can start slightly before Postgres finishes booting.
_pool = ConnectionPool(
    DATABASE_URL,
    min_size=1,
    max_size=5,
    open=False,
    kwargs={"row_factory": dict_row},
)


def init_db(retries: int = 15, delay: float = 1.5) -> None:
    """Open the pool (waiting for Postgres) and create the defects table."""
    last_err = None
    for _ in range(retries):
        try:
            if _pool.closed:
                _pool.open(wait=True, timeout=5)
            with _pool.connection() as con:
                con.execute(
                    """
                    CREATE TABLE IF NOT EXISTS defects (
                        id             TEXT PRIMARY KEY,
                        lat            DOUBLE PRECISION NOT NULL,
                        lng            DOUBLE PRECISION NOT NULL,
                        severity       INTEGER NOT NULL,
                        report_count   INTEGER NOT NULL DEFAULT 1,
                        first_reported TEXT NOT NULL,
                        last_reported  TEXT NOT NULL,
                        road_name      TEXT
                    )
                    """
                )
            return
        except Exception as e:  # noqa: BLE001 — retry on any connection error
            last_err = e
            time.sleep(delay)
    raise RuntimeError(f"Could not connect to Postgres at {DATABASE_URL}: {last_err}")


def upsert_defect(d: dict) -> None:
    with _pool.connection() as con:
        con.execute(
            """
            INSERT INTO defects
                (id, lat, lng, severity, report_count, first_reported, last_reported, road_name)
            VALUES
                (%(id)s, %(lat)s, %(lng)s, %(severity)s, %(report_count)s,
                 %(first_reported)s, %(last_reported)s, %(road_name)s)
            ON CONFLICT (id) DO UPDATE SET
                lat           = EXCLUDED.lat,
                lng           = EXCLUDED.lng,
                severity      = EXCLUDED.severity,
                report_count  = EXCLUDED.report_count,
                last_reported = EXCLUDED.last_reported,
                road_name     = EXCLUDED.road_name
            """,
            {
                "id":             d["id"],
                "lat":            d["lat"],
                "lng":            d["lng"],
                "severity":       int(d["severity"]),
                "report_count":   int(d["report_count"]),
                "first_reported": d["first_reported"],
                "last_reported":  d["last_reported"],
                "road_name":      d.get("road_name"),
            },
        )


def load_all_defects() -> list[dict]:
    with _pool.connection() as con:
        rows = con.execute("SELECT * FROM defects").fetchall()
    return [dict(r) for r in rows]


def clear_all() -> None:
    with _pool.connection() as con:
        con.execute("DELETE FROM defects")


def delete_defect(did: str) -> None:
    with _pool.connection() as con:
        con.execute("DELETE FROM defects WHERE id = %s", (did,))
