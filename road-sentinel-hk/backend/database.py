import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "hazards.db")


def _conn():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS hazards (
                id                  TEXT PRIMARY KEY,
                lat                 REAL NOT NULL,
                lng                 REAL NOT NULL,
                event_type          TEXT NOT NULL,
                severity            REAL NOT NULL,
                confidence          REAL NOT NULL,
                report_count        INTEGER NOT NULL DEFAULT 1,
                first_reported      TEXT NOT NULL,
                last_reported       TEXT NOT NULL,
                weather_multiplier  REAL NOT NULL DEFAULT 1.0,
                confirmed           INTEGER NOT NULL DEFAULT 1,
                government_reported INTEGER NOT NULL DEFAULT 0,
                reported_at         TEXT,
                district            TEXT,
                road_name           TEXT,
                full_address        TEXT
            )
        """)


def save_hazard(h: dict):
    with _conn() as con:
        con.execute("""
            INSERT INTO hazards VALUES (
                :id, :lat, :lng, :event_type, :severity, :confidence,
                :report_count, :first_reported, :last_reported,
                :weather_multiplier, :confirmed, :government_reported,
                :reported_at, :district, :road_name, :full_address
            )
            ON CONFLICT(id) DO UPDATE SET
                lat                 = excluded.lat,
                lng                 = excluded.lng,
                severity            = excluded.severity,
                confidence          = excluded.confidence,
                report_count        = excluded.report_count,
                last_reported       = excluded.last_reported,
                weather_multiplier  = excluded.weather_multiplier,
                confirmed           = excluded.confirmed,
                government_reported = excluded.government_reported,
                reported_at         = excluded.reported_at,
                district            = excluded.district,
                road_name           = excluded.road_name,
                full_address        = excluded.full_address
        """, {
            "id":                  h["id"],
            "lat":                 h["lat"],
            "lng":                 h["lng"],
            "event_type":          h["event_type"],
            "severity":            h["severity"],
            "confidence":          h["confidence"],
            "report_count":        h["report_count"],
            "first_reported":      h["first_reported"],
            "last_reported":       h["last_reported"],
            "weather_multiplier":  h["weather_multiplier"],
            "confirmed":           int(h["confirmed"]),
            "government_reported": int(h.get("government_reported", False)),
            "reported_at":         h.get("reported_at"),
            "district":            h.get("district"),
            "road_name":           h.get("road_name"),
            "full_address":        h.get("full_address"),
        })


def delete_hazard(hid: str):
    with _conn() as con:
        con.execute("DELETE FROM hazards WHERE id = ?", (hid,))


def delete_expired_hazards(cutoff_iso: str):
    with _conn() as con:
        con.execute("DELETE FROM hazards WHERE last_reported < ?", (cutoff_iso,))


def load_all_hazards() -> list[dict]:
    with _conn() as con:
        rows = con.execute("SELECT * FROM hazards").fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["confirmed"]           = bool(d["confirmed"])
        d["government_reported"] = bool(d["government_reported"])
        result.append(d)
    return result
