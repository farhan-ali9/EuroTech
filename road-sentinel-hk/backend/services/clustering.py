"""In-memory defect index backed by Postgres.

A "defect" is a road defect with a severity 1-5. Reports within CLUSTER_RADIUS_M
of an existing defect of are merged into it (report_count++, severity = max,
position averaged) so the same pothole reported by many drivers stays one marker.
"""
import math
import uuid
from datetime import datetime
from typing import List, Optional, Tuple

import database as db

CLUSTER_RADIUS_M = 50


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class ClusteringService:
    def __init__(self):
        # Defects persist in Postgres; load them into memory on startup.
        self._defects = {d["id"]: d for d in db.load_all_defects()}

    def add_defect(self, lat: float, lng: float, severity: float) -> Tuple[str, bool]:
        """Merge into the nearest defect within radius, or create a new one.

        Returns (defect_id, is_new).
        """
        severity = max(1, min(5, int(round(severity))))

        best_id, best_dist = None, float("inf")
        for did, d in self._defects.items():
            dist = haversine_m(lat, lng, d["lat"], d["lng"])
            if dist < CLUSTER_RADIUS_M and dist < best_dist:
                best_id, best_dist = did, dist

        now = datetime.utcnow().isoformat()

        if best_id is not None:
            d = self._defects[best_id]
            n = d["report_count"]
            d["lat"] = (d["lat"] * n + lat) / (n + 1)
            d["lng"] = (d["lng"] * n + lng) / (n + 1)
            d["severity"] = max(d["severity"], severity)
            d["report_count"] = n + 1
            d["last_reported"] = now
            db.upsert_defect(d)
            return best_id, False

        did = str(uuid.uuid4())
        self._defects[did] = {
            "id": did,
            "lat": lat,
            "lng": lng,
            "severity": severity,
            "report_count": 1,
            "first_reported": now,
            "last_reported": now,
            "road_name": None,
        }
        db.upsert_defect(self._defects[did])
        return did, True

    def set_road_name(self, did: str, road_name: Optional[str]) -> None:
        if did in self._defects:
            self._defects[did]["road_name"] = road_name
            db.upsert_defect(self._defects[did])

    def all_defects(self) -> List[dict]:
        return list(self._defects.values())

    def defects_near(self, lat: float, lng: float, radius_m: float = 1000) -> List[dict]:
        out = []
        for d in self._defects.values():
            dist = haversine_m(lat, lng, d["lat"], d["lng"])
            if dist <= radius_m:
                out.append({**d, "distance_m": round(dist, 1)})
        out.sort(key=lambda x: x["distance_m"])
        return out

    def stats(self) -> dict:
        return {"total": len(self._defects)}
