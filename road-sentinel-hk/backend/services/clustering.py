import math
import uuid
from datetime import datetime, timedelta
from typing import List, Optional
from collections import defaultdict
import database as db

CLUSTER_RADIUS_M        = 50
MIN_REPORTS             = 1    # 1 real report shows immediately on the map
HAZARD_EXPIRY_HRS       = 6
GOVT_SEVERITY_THRESHOLD = 5.0


def _get_district(lat: float, lng: float) -> str:
    if lat > 54.0:
        return "Schleswig-Holstein"
    if lat > 53.4 and 9.7 < lng < 10.4:
        return "Hamburg"
    if lat > 53.0 and lng < 9.1:
        return "Bremen"
    if lat > 53.0 and lng > 11.5:
        return "Mecklenburg-Vorpommern"
    if 52.3 < lat < 52.7 and 13.1 < lng < 13.8:
        return "Berlin"
    if lat > 51.3 and lng < 11.7:
        return "Niedersachsen"
    if lat > 51.3 and lng > 11.7:
        return "Brandenburg"
    if 51.0 < lat < 53.1 and 10.6 < lng < 13.2:
        return "Sachsen-Anhalt"
    if lat > 50.3 and lng < 9.5:
        return "Nordrhein-Westfalen"
    if lat > 50.2 and lng > 11.9:
        return "Sachsen"
    if 50.2 < lat < 51.7 and 9.9 < lng < 12.7:
        return "Thüringen"
    if 50.0 < lat < 51.7 and 7.8 < lng < 10.3:
        return "Hessen"
    if 49.1 < lat < 50.9 and lng < 8.5:
        return "Rheinland-Pfalz"
    if lat < 49.7 and lng < 7.4:
        return "Saarland"
    if lat < 49.8 and lng < 10.5:
        return "Baden-Württemberg"
    if lat < 50.6:
        return "Bayern"
    return "Germany"

def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi       = math.radians(lat2 - lat1)
    dlambda    = math.radians(lng2 - lng1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


class ClusteringService:
    def __init__(self):
        self._reports  = []
        self._hazards  = {}
        # Load persisted driver-reported hazards from SQLite on startup
        for h in db.load_all_hazards():
            self._hazards[h["id"]] = h

    def add_report(self, lat: float, lng: float, event_type: str,
                   severity: float, confidence: float, weather_multiplier: float) -> Optional[str]:
        now = datetime.utcnow()

        report = {
            "id":                 str(uuid.uuid4()),
            "lat":                lat,
            "lng":                lng,
            "event_type":         event_type,
            "severity":           severity,
            "confidence":         confidence,
            "weather_multiplier": weather_multiplier,
            "timestamp":          now,
        }
        self._reports.append(report)
        self._purge_old_reports()

        return self._cluster_into_hazard(report)

    def _cluster_into_hazard(self, report: dict) -> Optional[str]:
        best_hazard_id = None
        best_distance  = float("inf")

        for hid, hazard in self._hazards.items():
            if hazard["event_type"] != report["event_type"]:
                continue
            dist = haversine_m(report["lat"], report["lng"], hazard["lat"], hazard["lng"])
            if dist < CLUSTER_RADIUS_M and dist < best_distance:
                best_distance  = dist
                best_hazard_id = hid

        if best_hazard_id:
            self._update_hazard(best_hazard_id, report)
            return best_hazard_id
        else:
            return self._create_pending(report)

    def _create_pending(self, report: dict) -> str:
        hid = str(uuid.uuid4())
        confirmed = (1 >= MIN_REPORTS)
        govt = confirmed and report["severity"] >= GOVT_SEVERITY_THRESHOLD
        self._hazards[hid] = {
            "id":                  hid,
            "lat":                 report["lat"],
            "lng":                 report["lng"],
            "event_type":          report["event_type"],
            "severity":            report["severity"],
            "confidence":          report["confidence"],
            "report_count":        1,
            "first_reported":      report["timestamp"].isoformat(),
            "last_reported":       report["timestamp"].isoformat(),
            "weather_multiplier":  report["weather_multiplier"],
            "confirmed":           confirmed,
            "government_reported": govt,
            "reported_at":         datetime.utcnow().isoformat() if govt else None,
            "district":            _get_district(report["lat"], report["lng"]),
            "road_name":           None,
            "full_address":        None,
        }
        db.save_hazard(self._hazards[hid])
        return hid

    def set_road_name(self, hid: str, road_name: str, full_address: str):
        if hid in self._hazards:
            self._hazards[hid]["road_name"]    = road_name
            self._hazards[hid]["full_address"] = full_address
            if not self._hazards[hid].get("source"):
                db.save_hazard(self._hazards[hid])

    def _update_hazard(self, hid: str, report: dict):
        h = self._hazards[hid]
        n = h["report_count"]

        h["lat"]               = (h["lat"] * n + report["lat"]) / (n + 1)
        h["lng"]               = (h["lng"] * n + report["lng"]) / (n + 1)
        h["severity"]          = max(h["severity"], report["severity"])
        h["confidence"]        = min(1.0, (h["confidence"] * n + report["confidence"]) / (n + 1))
        h["report_count"]      = n + 1
        h["last_reported"]     = report["timestamp"].isoformat()
        h["weather_multiplier"]= report["weather_multiplier"]
        h["district"]          = _get_district(h["lat"], h["lng"])

        if h["report_count"] >= MIN_REPORTS:
            h["confirmed"] = True

        # Auto-report to government when confirmed + severe enough
        if h["confirmed"] and not h["government_reported"] and h["severity"] >= GOVT_SEVERITY_THRESHOLD:
            h["government_reported"] = True
            h["reported_at"]         = datetime.utcnow().isoformat()

        if not h.get("source"):
            db.save_hazard(h)

    def _purge_old_reports(self):
        cutoff = datetime.utcnow() - timedelta(hours=HAZARD_EXPIRY_HRS)
        self._reports = [r for r in self._reports if r["timestamp"] > cutoff]

        expired = [
            hid for hid, h in self._hazards.items()
            if datetime.fromisoformat(h["last_reported"]) < cutoff
        ]
        for hid in expired:
            del self._hazards[hid]
        db.delete_expired_hazards(cutoff.isoformat())

    def inject_official_hazard(self, hazard: dict):
        """Add a pre-confirmed official hazard (HKO/TD data) bypassing report threshold."""
        hid = hazard["id"]
        hazard["district"] = _get_district(hazard["lat"], hazard["lng"])
        self._hazards[hid] = hazard

    def clear_official_hazards(self):
        """Remove all hazards that came from official data sources (safe to re-inject)."""
        to_remove = [hid for hid, h in self._hazards.items() if h.get("source")]
        for hid in to_remove:
            del self._hazards[hid]

    def get_confirmed_hazards(self) -> List[dict]:
        self._purge_old_reports()
        return [h for h in self._hazards.values() if h["confirmed"]]

    def get_all_hazards(self) -> List[dict]:
        self._purge_old_reports()
        return list(self._hazards.values())

    def get_hazards_near(self, lat: float, lng: float, radius_m: float = 300) -> List[dict]:
        confirmed = self.get_confirmed_hazards()
        return [
            h for h in confirmed
            if haversine_m(lat, lng, h["lat"], h["lng"]) <= radius_m
        ]

    def resolve_hazard(self, hid: str) -> bool:
        if hid not in self._hazards:
            return False
        del self._hazards[hid]
        db.delete_hazard(hid)
        return True

    def mark_government_reported(self, hid: str) -> bool:
        if hid not in self._hazards:
            return False
        h = self._hazards[hid]
        h["government_reported"] = True
        h["reported_at"] = datetime.utcnow().isoformat()
        if not h.get("source"):
            db.save_hazard(h)
        return True

    def stats(self) -> dict:
        confirmed = self.get_confirmed_hazards()
        by_type   = defaultdict(int)
        for h in confirmed:
            by_type[h["event_type"]] += 1
        return {
            "total_confirmed":  len(confirmed),
            "total_pending":    len(self._hazards) - len(confirmed),
            "by_type":          dict(by_type),
            "total_reports":    len(self._reports),
        }
