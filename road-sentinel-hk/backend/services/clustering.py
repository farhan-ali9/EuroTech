import math
import uuid
from datetime import datetime, timedelta
from typing import List, Optional
from collections import defaultdict

CLUSTER_RADIUS_M        = 50
MIN_REPORTS             = 1    # 1 real report shows immediately on the map
HAZARD_EXPIRY_HRS       = 6
GOVT_SEVERITY_THRESHOLD = 5.0


def _get_district(lat: float, lng: float) -> str:
    if lng < 114.05:
        return "Lantau Island"
    # HK Island — south of harbour
    if lat < 22.30:
        if lng < 114.13:
            return "Kennedy Town"
        elif lng < 114.17:
            return "Wan Chai"
        else:
            return "Eastern District"
    # Kowloon Peninsula
    if lat < 22.34:
        if lng < 114.16:
            return "Sham Shui Po"
        elif lng < 114.19:
            return "Kowloon City"
        else:
            return "Wong Tai Sin"
    # New Territories
    if lat < 22.42:
        if lng < 114.10:
            return "Tsuen Wan"
        elif lng < 114.22:
            return "Sha Tin"
        else:
            return "Sai Kung"
    return "North New Territories"

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
        return hid

    def set_road_name(self, hid: str, road_name: str, full_address: str):
        if hid in self._hazards:
            self._hazards[hid]["road_name"]    = road_name
            self._hazards[hid]["full_address"] = full_address

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

    def _purge_old_reports(self):
        cutoff = datetime.utcnow() - timedelta(hours=HAZARD_EXPIRY_HRS)
        self._reports = [r for r in self._reports if r["timestamp"] > cutoff]

        expired = [
            hid for hid, h in self._hazards.items()
            if datetime.fromisoformat(h["last_reported"]) < cutoff
        ]
        for hid in expired:
            del self._hazards[hid]

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
