import asyncio
import re
import httpx
from datetime import datetime, timezone, timedelta

HKO_BASE = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

HKT = timezone(timedelta(hours=8))

# Beaufort force → km/h midpoint
BEAUFORT_KMH = {
    0: 0, 1: 3, 2: 8, 3: 15, 4: 24, 5: 34,
    6: 44, 7: 56, 8: 68, 9: 82, 10: 96, 11: 110, 12: 130,
}


async def _fetch(client: httpx.AsyncClient, data_type: str) -> dict:
    resp = await client.get(HKO_BASE, params={"dataType": data_type, "lang": "en"})
    resp.raise_for_status()
    return resp.json()


async def get_current_weather() -> dict:
    try:
        async with httpx.AsyncClient(timeout=12, headers=HEADERS) as client:
            rhrread, flw, fnd = await asyncio.gather(
                _fetch(client, "rhrread"),
                _fetch(client, "flw"),
                _fetch(client, "fnd"),
                return_exceptions=True,
            )

        if isinstance(rhrread, Exception):
            raise rhrread

        flw = flw if not isinstance(flw, Exception) else {}
        fnd = fnd if not isinstance(fnd, Exception) else {}

        # --- Real-time readings from rhrread ---
        temperature   = _extract_temp_observatory(rhrread)   # HKO Observatory (official)
        temp_stations = _extract_temp_all(rhrread)           # all station readings
        humidity      = _extract_humidity(rhrread)
        rainfall_mm   = _extract_rainfall(rhrread)
        rainfall_by_district = _extract_rainfall_districts(rhrread)
        warnings      = _extract_warnings(rhrread)
        uv_index      = _extract_uv(rhrread)
        hko_update    = rhrread.get("updateTime", "")        # actual HKO update time

        # --- Wind from fnd (today's forecast) ---
        today = (fnd.get("weatherForecast") or [{}])[0] if fnd else {}
        wind_text  = today.get("forecastWind", "")
        wind_dir, wind_kmh_low, wind_kmh_high, wind_force_low, wind_force_high = _parse_wind(wind_text)

        # --- Forecast text from flw ---
        condition         = flw.get("forecastDesc", "")
        general_situation = flw.get("generalSituation", "")
        tc_info           = flw.get("tcInfo", "")

        # --- Forecast max/min from fnd ---
        temp_max = (today.get("forecastMaxtemp") or {}).get("value")
        temp_min = (today.get("forecastMintemp") or {}).get("value")
        rh_max   = (today.get("forecastMaxrh")   or {}).get("value")
        rh_min   = (today.get("forecastMinrh")   or {}).get("value")

        # --- Road multiplier ---
        multiplier = _compute_road_multiplier(
            rainfall_mm, temperature, humidity, warnings, condition, general_situation,
        )

        # Convert HKO update time to HKT string for display
        hko_update_hkt = _format_hkt(hko_update)

        return {
            "temperature":           temperature,        # HKO Observatory (official HK temp)
            "temperature_stations":  temp_stations,      # dict: station → temp
            "humidity":              humidity,
            "rainfall_mm":           rainfall_mm,        # max across all districts this hour
            "rainfall_districts":    rainfall_by_district,
            "uv_index":              uv_index,
            "wind_direction":        wind_dir,
            "wind_speed_kmh":        wind_kmh_high,      # upper end of range
            "wind_speed_range":      f"{wind_kmh_low}-{wind_kmh_high}" if wind_kmh_low != wind_kmh_high else str(wind_kmh_high),
            "wind_force":            wind_force_high,
            "wind_force_range":      f"{wind_force_low}-{wind_force_high}" if wind_force_low != wind_force_high else str(wind_force_high),
            "condition":             condition,
            "general_situation":     general_situation,
            "tc_info":               tc_info,
            "temp_max":              temp_max,
            "temp_min":              temp_min,
            "rh_max":                rh_max,
            "rh_min":                rh_min,
            "warnings":              warnings,
            "road_multiplier":       round(multiplier, 2),
            "road_condition":        _road_condition_label(multiplier),
            "hko_update_time":       hko_update_hkt,    # actual HKO data timestamp
            "timestamp":             datetime.utcnow().isoformat(),
        }

    except Exception as e:
        return _fallback_weather(str(e))


def _format_hkt(iso_str: str) -> str:
    """Convert HKO ISO timestamp to readable HKT string."""
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        hkt = dt.astimezone(HKT)
        return hkt.strftime("%d %b %Y %H:%M HKT")
    except Exception:
        return iso_str


def _extract_temp_observatory(data: dict) -> float:
    """Return HKO Observatory temperature — the official published figure."""
    try:
        readings = data.get("temperature", {}).get("data", [])
        for r in readings:
            if "observatory" in r.get("place", "").lower():
                v = r.get("value")
                if v not in (None, "", "N/A"):
                    return float(v)
        # Fallback: King's Park (second most official station)
        for r in readings:
            if "king" in r.get("place", "").lower():
                v = r.get("value")
                if v not in (None, "", "N/A"):
                    return float(v)
        # Last resort: average
        valid = [float(r["value"]) for r in readings if r.get("value") not in (None, "", "N/A")]
        return round(sum(valid) / len(valid), 1) if valid else 25.0
    except Exception:
        return 25.0


def _extract_temp_all(data: dict) -> dict:
    """Return all station temperatures as a dict."""
    try:
        readings = data.get("temperature", {}).get("data", [])
        return {
            r["place"]: float(r["value"])
            for r in readings
            if r.get("place") and r.get("value") not in (None, "", "N/A")
        }
    except Exception:
        return {}


def _extract_humidity(data: dict) -> float:
    try:
        readings = data.get("humidity", {}).get("data", [])
        valid = [float(r["value"]) for r in readings if r.get("value") not in (None, "", "N/A")]
        return round(sum(valid) / len(valid), 1) if valid else 70.0
    except Exception:
        return 70.0


def _extract_rainfall(data: dict) -> float:
    """Max rainfall across all districts in the current hour."""
    try:
        stations = data.get("rainfall", {}).get("data", [])
        totals = []
        for s in stations:
            v = s.get("max", 0)
            if v in (None, "N/A", "", "---"):
                continue
            try:
                totals.append(float(v))
            except (ValueError, TypeError):
                pass
        return round(max(totals), 1) if totals else 0.0
    except Exception:
        return 0.0


def _extract_rainfall_districts(data: dict) -> list:
    """Return per-district rainfall list."""
    try:
        return [
            {"place": s.get("place", ""), "max": s.get("max", 0), "min": s.get("min", 0)}
            for s in data.get("rainfall", {}).get("data", [])
        ]
    except Exception:
        return []


def _extract_uv(data: dict) -> str:
    try:
        uv = data.get("uvindex", "")
        if isinstance(uv, dict):
            return str(uv.get("value", ""))
        return str(uv) if uv else ""
    except Exception:
        return ""


def _extract_warnings(data: dict) -> list:
    msgs = data.get("warningMessage", [])
    if isinstance(msgs, str):
        msgs = [msgs] if msgs else []
    found = []
    checks = {
        "Black Rainstorm": ["Black Rainstorm", "Black Rain"],
        "Red Rainstorm":   ["Red Rainstorm",   "Red Rain"],
        "Amber Rainstorm": ["Amber Rainstorm",  "Amber Rain"],
        "Thunderstorm":    ["Thunderstorm", "Thunder"],
        "Typhoon":         ["Tropical Cyclone", "Typhoon", "Signal No."],
        "Very Hot":        ["Very Hot Weather"],
        "Cold":            ["Cold Weather"],
    }
    for label, keywords in checks.items():
        for msg in msgs:
            if any(kw.lower() in msg.lower() for kw in keywords):
                if label not in found:
                    found.append(label)
                break
    return found


def _parse_wind(wind_text: str) -> tuple:
    """
    Parse HKO forecastWind like 'Southwest force 3 to 4.' or 'North force 5.'
    Returns (direction, kmh_low, kmh_high, force_low, force_high).
    """
    if not wind_text:
        return ("--", 0, 0, 0, 0)

    dir_map = {
        "north-northeast": "NNE", "north-northwest": "NNW",
        "south-southeast": "SSE", "south-southwest": "SSW",
        "east-northeast":  "ENE", "east-southeast":  "ESE",
        "west-northwest":  "WNW", "west-southwest":  "WSW",
        "northeast": "NE", "northwest": "NW",
        "southeast": "SE", "southwest": "SW",
        "north": "N",  "south": "S",
        "east":  "E",  "west":  "W",
    }

    lower = wind_text.lower()
    direction = "--"
    for name, abbr in dir_map.items():
        if name in lower:
            direction = abbr
            break

    # "force 3 to 4" or "force 4"
    m_range = re.search(r"force\s+(\d+)\s+to\s+(\d+)", lower)
    m_single = re.search(r"force\s+(\d+)", lower)

    if m_range:
        f_low, f_high = int(m_range.group(1)), int(m_range.group(2))
    elif m_single:
        f_low = f_high = int(m_single.group(1))
    else:
        f_low = f_high = 0

    return (
        direction,
        BEAUFORT_KMH.get(f_low, 0),
        BEAUFORT_KMH.get(f_high, 0),
        f_low,
        f_high,
    )


def _compute_road_multiplier(rainfall: float, temp: float, humidity: float,
                              warnings: list, condition: str = "",
                              general_situation: str = "") -> float:
    multiplier = 1.0

    if "Black Rainstorm" in warnings: multiplier += 1.5
    elif "Red Rainstorm"  in warnings: multiplier += 1.0
    elif "Amber Rainstorm" in warnings: multiplier += 0.5
    if "Thunderstorm" in warnings:    multiplier += 0.3
    if "Typhoon"      in warnings:    multiplier += 1.0

    if rainfall > 50:   multiplier += 0.6
    elif rainfall > 20: multiplier += 0.3
    elif rainfall > 5:  multiplier += 0.15

    if humidity > 90:  multiplier += 0.1
    if temp > 35:      multiplier += 0.1

    combined = (condition + " " + general_situation).lower()
    if "squally thunderstorm" in combined or "heavy showers" in combined:
        multiplier += 0.5
    elif "thunderstorm" in combined or "heavy rain" in combined:
        multiplier += 0.35
    elif "shower" in combined:
        multiplier += 0.15
    if "landslip" in combined or "flooding" in combined or "flood" in combined:
        multiplier += 0.4

    return min(3.0, multiplier)


def _road_condition_label(m: float) -> str:
    # Use plain ASCII dash to avoid Unicode encoding issues
    if m >= 2.5: return "CRITICAL - Roads extremely dangerous"
    if m >= 2.0: return "SEVERE - Reduce speed significantly"
    if m >= 1.5: return "POOR - Drive with caution"
    if m >= 1.2: return "WET - Slippery surfaces likely"
    return "NORMAL"


def _fallback_weather(error: str) -> dict:
    return {
        "temperature":           25.0,
        "temperature_stations":  {},
        "humidity":              70.0,
        "rainfall_mm":           0.0,
        "rainfall_districts":    [],
        "uv_index":              "",
        "wind_direction":        "--",
        "wind_speed_kmh":        0,
        "wind_speed_range":      "0",
        "wind_force":            0,
        "wind_force_range":      "0",
        "condition":             "",
        "general_situation":     "",
        "tc_info":               "",
        "temp_max":              None,
        "temp_min":              None,
        "rh_max":                None,
        "rh_min":                None,
        "warnings":              [],
        "road_multiplier":       1.0,
        "road_condition":        "NORMAL",
        "hko_update_time":       "",
        "timestamp":             datetime.utcnow().isoformat(),
        "error":                 error,
    }
