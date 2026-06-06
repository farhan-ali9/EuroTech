"""Seed the database with plausible mock defects for the demo.

Hong Kong: a spread across districts with varied severity & report counts.
Munich:    a cluster around Garching (incl. the requested coordinate) + a couple
           in the city centre.

Run:  uv run python seed.py     (then restart the backend so it reloads from DB)
"""
from datetime import datetime, timedelta
import database as db

NOW = datetime.utcnow()


def ago(hours):
    return (NOW - timedelta(hours=hours)).isoformat()


# id, lat, lng, severity (1-5), report_count, road_name, first_seen_h, last_seen_h
MOCK = [
    # ── Hong Kong ──────────────────────────────────────────────────────────────
    ("hk-nathan",     22.2988, 114.1722, 4,  9, "Nathan Road",            120, 1),
    ("hk-argyle",     22.3193, 114.1694, 5, 14, "Argyle Street",          200, 0.5),
    ("hk-queens",     22.2825, 114.1577, 3,  6, "Queen's Road Central",    90, 3),
    ("hk-hennessy",   22.2801, 114.1840, 4,  8, "Hennessy Road",          150, 2),
    ("hk-gloucester", 22.2795, 114.1736, 2,  3, "Gloucester Road",         48, 6),
    ("hk-shatin",     22.3817, 114.1885, 3,  5, "Sha Tin Road",            72, 4),
    ("hk-kwuntong",   22.3119, 114.2256, 5, 11, "Kwun Tong Road",         180, 1),
    ("hk-castlepeak", 22.3710, 114.1140, 2,  4, "Castle Peak Road",        60, 8),
    ("hk-prince",     22.3290, 114.1880, 3,  7, "Prince Edward Road East", 96, 5),
    ("hk-csw",        22.3320, 114.1610, 1,  2, "Cheung Sha Wan Road",     30, 9),
    ("hk-kings",      22.2915, 114.2005, 4,  6, "King's Road",            110, 2),
    ("hk-aberdeen",   22.2475, 114.1545, 2,  3, "Aberdeen Praya Road",     54, 7),

    # ── Munich (single point, Garching) ─────────────────────────────────────────
    ("muc-garching",  48.26836627605025, 11.666547175506365, 4, 6, "Garching b. München", 120, 1),
]


def main():
    db.init_db()
    db.clear_all()
    for (did, lat, lng, sev, rc, road, first_h, last_h) in MOCK:
        db.upsert_defect({
            "id": did,
            "lat": lat,
            "lng": lng,
            "severity": sev,
            "report_count": rc,
            "first_reported": ago(first_h),
            "last_reported": ago(last_h),
            "road_name": road,
        })
    print(f"Seeded {len(MOCK)} mock defects (Hong Kong + Munich).")


if __name__ == "__main__":
    main()
