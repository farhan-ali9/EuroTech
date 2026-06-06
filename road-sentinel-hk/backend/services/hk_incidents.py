import re
import httpx
from datetime import datetime
from typing import List, Optional, Dict, Tuple

HKO_RHRREAD = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; RoadSentinelHK/1.0)",
    "Accept": "application/json, application/xml, */*",
}

# Real centre coordinates for all 18 HK districts
# HKO rainfall API returns data by district using the "place" field
DISTRICT_COORDS: Dict[str, Tuple[float, float]] = {
    "central & western district":  (22.2849, 114.1516),
    "central and western district":(22.2849, 114.1516),
    "eastern district":            (22.2838, 114.2245),
    "kwai tsing":                  (22.3568, 114.1322),
    "islands district":            (22.2559, 113.9422),
    "north district":              (22.4957, 114.1382),
    "sai kung":                    (22.3812, 114.2673),
    "sha tin":                     (22.3847, 114.1964),
    "southern district":           (22.2469, 114.1542),
    "tai po":                      (22.4490, 114.1742),
    "tsuen wan":                   (22.3700, 114.1171),
    "tuen mun":                    (22.3910, 113.9777),
    "wan chai":                    (22.2780, 114.1722),
    "yuen long":                   (22.4428, 114.0218),
    "yau tsim mong":               (22.3192, 114.1749),
    "sham shui po":                (22.3312, 114.1624),
    "kowloon city":                (22.3280, 114.1900),
    "wong tai sin":                (22.3360, 114.2030),
    "kwun tong":                   (22.3120, 114.2257),
}

# Temperature station coordinates (HKO uses "place" key here too)
TEMP_STATION_COORDS: Dict[str, Tuple[float, float]] = {
    "king's park":                 (22.3118, 114.1731),
    "hong kong observatory":       (22.3021, 114.1745),
    "wong chuk hang":              (22.2459, 114.1677),
    "ta kwu ling":                 (22.5312, 114.1542),
    "lau fau shan":                (22.4699, 113.9819),
    "tai po":                      (22.4490, 114.1742),
    "sha tin":                     (22.3847, 114.1964),
    "tuen mun":                    (22.3910, 113.9777),
    "tseung kwan o":               (22.3218, 114.2581),
    "sai kung":                    (22.3812, 114.2673),
    "cheung chau":                 (22.2094, 114.0275),
    "chek lap kok":                (22.3087, 113.9151),
    "tsing yi":                    (22.3430, 114.1063),
    "shek kong":                   (22.4358, 114.0800),
    "tsuen wan ho koon":           (22.3700, 114.1171),
    "tsuen wan shing mun valley":  (22.3730, 114.1171),
    "hong kong park":              (22.2793, 114.1601),
    "shau kei wan":                (22.2822, 114.2279),
    "kowloon city":                (22.3280, 114.1900),
    "happy valley":                (22.2713, 114.1841),
    "wong tai sin":                (22.3360, 114.2030),
    "stanley":                     (22.2179, 114.2148),
    "kwun tong":                   (22.3120, 114.2257),
    "sham shui po":                (22.3312, 114.1624),
    "kai tak runway park":         (22.3050, 114.2130),
    "yuen long park":              (22.4428, 114.0218),
    "tai mei tuk":                 (22.4753, 114.2361),
}


def _lookup_district(name: str) -> Optional[Tuple[float, float]]:
    key = name.lower().strip()
    if key in DISTRICT_COORDS:
        return DISTRICT_COORDS[key]
    for k, coords in DISTRICT_COORDS.items():
        if k in key or key in k:
            return coords
    return None


def _make_official_hazard(event_type: str, lat: float, lng: float,
                           severity: float, confidence: float,
                           weather_multiplier: float = 1.0,
                           road_name: str = "HK Road",
                           source: str = "official") -> dict:
    now = datetime.utcnow().isoformat()
    road_slug = re.sub(r"\W+", "_", road_name.lower())[:24]
    hid = f"official_{source}_{round(lat, 4)}_{round(lng, 4)}_{event_type}_{road_slug}"
    return {
        "id":                  hid,
        "lat":                 lat,
        "lng":                 lng,
        "event_type":          event_type,
        "severity":            round(severity, 1),
        "confidence":          round(confidence, 2),
        "report_count":        1,
        "first_reported":      now,
        "last_reported":       now,
        "weather_multiplier":  weather_multiplier,
        "confirmed":           True,
        "government_reported": True,
        "reported_at":         now,
        "district":            "",
        "road_name":           road_name,
        "full_address":        None,
        "source":              source,
    }


def _extract_warnings(data: dict) -> list:
    msgs = data.get("warningMessage", [])
    if isinstance(msgs, str):
        msgs = [msgs] if msgs else []
    found = []
    checks = {
        "Black Rainstorm": ["Black Rainstorm", "Black Rain"],
        "Red Rainstorm":   ["Red Rainstorm",   "Red Rain"],
        "Amber Rainstorm": ["Amber Rainstorm",  "Amber Rain"],
        "Thunderstorm":    ["Thunderstorm"],
        "Typhoon":         ["Tropical Cyclone", "Typhoon", "Signal No."],
    }
    for label, keywords in checks.items():
        for msg in msgs:
            if any(kw.lower() in msg.lower() for kw in keywords):
                if label not in found:
                    found.append(label)
                break
    return found


async def get_rainfall_hazards() -> List[dict]:
    """
    Fetch live HKO per-district rainfall and generate real road hazards.
    Thresholds (real tropical HK conditions):
      >= 1 mm  → wet_road (roads are damp)
      >= 10 mm → slippery + wet_road
      >= 30 mm → heavy: slippery (higher severity) + wet_road
    Also generates slippery hazards when humidity >= 88% (monsoon condensation).
    """
    hazards = []
    try:
        async with httpx.AsyncClient(timeout=10, headers=HEADERS) as client:
            resp = await client.get(HKO_RHRREAD, params={"dataType": "rhrread", "lang": "en"})
            resp.raise_for_status()
            data = resp.json()

        warnings = _extract_warnings(data)
        base_mult = (1.5 if "Black Rainstorm" in warnings else
                     1.3 if "Red Rainstorm"   in warnings else
                     1.15 if "Amber Rainstorm" in warnings else 1.0)

        # --- Rainfall-based hazards ---
        districts = data.get("rainfall", {}).get("data", [])
        for entry in districts:
            place = entry.get("place", "")
            coords = _lookup_district(place)
            if not coords:
                continue

            raw = entry.get("max", 0)
            if raw in (None, "N/A", "", "---"):
                raw = 0
            try:
                mm = float(raw)
            except (ValueError, TypeError):
                continue

            lat, lng = coords
            area = f"{place}, HK"

            if mm >= 30:
                sev = min(9.5, 6.0 + mm / 30)
                hazards.append(_make_official_hazard(
                    "slippery", lat, lng, sev, 0.92, base_mult * 1.5,
                    road_name=area, source="hko_rain"))
                hazards.append(_make_official_hazard(
                    "wet_road", lat + 0.002, lng + 0.002, sev - 0.5, 0.95,
                    base_mult * 1.4, road_name=area, source="hko_rain"))

            elif mm >= 10:
                sev = min(7.5, 4.0 + mm / 15)
                hazards.append(_make_official_hazard(
                    "slippery", lat, lng, sev, 0.88, base_mult * 1.3,
                    road_name=area, source="hko_rain"))
                hazards.append(_make_official_hazard(
                    "wet_road", lat + 0.0015, lng + 0.0015, sev - 1.0, 0.90,
                    base_mult * 1.2, road_name=area, source="hko_rain"))

            elif mm >= 1:
                # Light rain: roads are genuinely damp
                sev = min(4.5, 2.0 + mm * 0.5)
                hazards.append(_make_official_hazard(
                    "wet_road", lat, lng, sev, 0.80, base_mult * 1.05,
                    road_name=area, source="hko_rain"))

        # --- Humidity-based slippery hazard (monsoon season condensation) ---
        humidity_readings = data.get("humidity", {}).get("data", [])
        for hentry in humidity_readings:
            hval = hentry.get("value", 0)
            try:
                hval = float(hval)
            except (ValueError, TypeError):
                hval = 0

            if hval >= 88:
                # Very high humidity = condensation on road surfaces all over HK
                # Generate slippery markers at temperature station locations
                temp_readings = data.get("temperature", {}).get("data", [])
                placed = set()
                for t in temp_readings:
                    tplace = t.get("place", "").lower().strip()
                    tcoords = TEMP_STATION_COORDS.get(tplace)
                    if not tcoords or tplace in placed:
                        continue
                    placed.add(tplace)
                    lat2, lng2 = tcoords
                    sev = min(5.5, 2.5 + (hval - 88) * 0.1)
                    hazards.append(_make_official_hazard(
                        "slippery", lat2, lng2, sev, 0.75, 1.0,
                        road_name=f"{t.get('place', 'HK')} area (humid)",
                        source="hko_humidity"))
                break  # one humidity reading is enough

        print(f"[HK Incidents] {len(hazards)} rainfall/humidity hazards from HKO "
              f"(warnings={warnings})")

    except Exception as e:
        print(f"[HK Incidents] HKO rainfall fetch failed: {e}")

    return hazards


TD_SPECIAL_NEWS_URL = "https://www.td.gov.hk/en/special_news/spnews.htm"
NOM_SEARCH = "https://nominatim.openstreetmap.org/search"
NOM_HEADERS = {"User-Agent": "RoadSentinelHK/1.0 (road hazard monitoring)"}

# Match proper-noun road names: "Tuen Mun Road", "Wai Wah Street", etc.
_ROAD_RE = re.compile(
    r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}'
    r'\s+(?:Road|Street|Avenue|Drive|Close|Crescent|Lane|Path|Way|Place|'
    r'Terrace|Rise|Hill|Pass|Highway|Expressway|Tunnel|Bridge|Flyover|Bypass))\b',
)
# "near Sham Tseng" — stop before "which", "that", "are", "is", "was"
_NEAR_RE = re.compile(
    r'\bnear\s+([A-Z][A-Za-z\s\-\']{2,35}?)(?=\s+(?:which|that|where|are|is|was|have|to|at\b|,|\.))',
    re.IGNORECASE,
)


def _strip_html(html: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html)).strip()


def _parse_td_items(html: str) -> list[str]:
    """Extract `<li>` text items from TD special news HTML."""
    items = re.findall(r'<li[^>]*>(.*?)</li>', html, re.DOTALL | re.IGNORECASE)
    return [t for t in (_strip_html(i) for i in items) if len(t) > 30]


def _classify_td_text(text: str) -> tuple:
    lower = text.lower()
    if any(k in lower for k in ("landslip", "rockfall", "slope")):
        return ("rough_road", 8.5)
    if any(k in lower for k in ("flooding", "flood", "waterlog", "submerged")):
        return ("wet_road", 8.0)
    if any(k in lower for k in ("accident", "collision", "crash")):
        return ("slippery", 6.5)
    if any(k in lower for k in ("pothole", "road damage", "road surface")):
        return ("pothole", 7.0)
    if any(k in lower for k in ("watermain", "emergency work", "road work",
                                  "roadwork", "maintenance", "construction", "trench")):
        return ("rough_road", 5.5)
    if any(k in lower for k in ("obstruction", "debris", "fallen")):
        return ("rough_road", 6.5)
    return ("rough_road", 5.0)


async def _geocode_hk(query: str) -> Optional[Tuple[float, float]]:
    """Forward-geocode a HK road name via OSM Nominatim."""
    HK_VIEWBOX = "113.80,22.55,114.45,22.15"
    attempts = [
        {"q": query,                      "viewbox": HK_VIEWBOX, "bounded": 0},
        {"q": query + " Hong Kong",       "viewbox": HK_VIEWBOX, "bounded": 0},
    ]
    try:
        async with httpx.AsyncClient(timeout=10, headers=NOM_HEADERS) as client:
            for params in attempts:
                params.update({"format": "json", "limit": 1})
                resp = await client.get(NOM_SEARCH, params=params)
                resp.raise_for_status()
                results = resp.json()
                if results:
                    lat, lng = float(results[0]["lat"]), float(results[0]["lon"])
                    if 22.15 <= lat <= 22.55 and 113.80 <= lng <= 114.45:
                        return lat, lng
    except Exception:
        pass
    return None


async def get_td_incidents() -> List[dict]:
    """
    Scrape real live incidents from HK Transport Department Special Traffic News.
    URL: https://www.td.gov.hk/en/special_news/spnews.htm  (refreshes every 60s)
    """
    hazards = []
    try:
        async with httpx.AsyncClient(timeout=15, headers=HEADERS) as client:
            resp = await client.get(TD_SPECIAL_NEWS_URL)
            resp.raise_for_status()

        items = _parse_td_items(resp.text)
        print(f"[HK Incidents] TD page: {len(items)} incident(s) found")

        for description in items:
            roads = _ROAD_RE.findall(description)
            nears = _NEAR_RE.findall(description)
            if not roads:
                continue

            road = roads[0].strip()
            area = nears[0].strip() if nears else ""
            query = f"{road}{', ' + area if area else ''}, Hong Kong"

            coords = await _geocode_hk(road)
            if not coords:
                coords = await _geocode_hk(query)
            if not coords:
                print(f"[HK Incidents] Could not geocode: {query}")
                continue

            lat, lng = coords
            hazard_type, severity = _classify_td_text(description)
            road_label = f"{road}{', ' + area if area else ''}"

            print(f"[HK Incidents] TD: {hazard_type} at {road_label} ({lat:.4f},{lng:.4f})")
            hazards.append(_make_official_hazard(
                hazard_type, lat, lng, severity, 0.90,
                road_name=road_label, source="td_traffic_news"))

        print(f"[HK Incidents] {len(hazards)} TD incidents geocoded and loaded")

    except Exception as e:
        print(f"[HK Incidents] TD scrape failed: {e}")

    return hazards


async def get_live_hazards() -> List[dict]:
    """Combine HKO rainfall/humidity hazards and TD incidents."""
    rainfall = await get_rainfall_hazards()
    td       = await get_td_incidents()
    return rainfall + td
