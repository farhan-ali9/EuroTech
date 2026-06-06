import httpx
from datetime import datetime

# BrightSky — free DWD (Deutscher Wetterdienst) wrapper, no API key needed
BRIGHTSKY = "https://api.brightsky.dev/current_weather"

# Default location: Frankfurt am Main (central Germany)
DEFAULT_LAT = 50.1109
DEFAULT_LON = 8.6821

HEADERS = {"User-Agent": "RoadSentinel/1.0"}


async def get_current_weather(lat: float = DEFAULT_LAT, lon: float = DEFAULT_LON) -> dict:
    try:
        async with httpx.AsyncClient(timeout=12, headers=HEADERS) as client:
            resp = await client.get(BRIGHTSKY, params={"lat": lat, "lon": lon})
            resp.raise_for_status()
            data = resp.json()

        w = data.get("weather", {})

        temperature  = w.get("temperature")       # °C
        humidity     = w.get("relative_humidity")  # %
        rainfall_mm  = w.get("precipitation", 0.0) or 0.0
        wind_speed   = w.get("wind_speed") or 0    # km/h
        wind_dir_deg = w.get("wind_direction") or 0
        condition    = w.get("condition", "dry")   # dry/fog/rain/sleet/snow/hail/thunderstorm

        wind_dir = _deg_to_compass(wind_dir_deg)
        multiplier = _compute_road_multiplier(rainfall_mm, temperature, humidity, condition)

        # Pick nearest DWD station name for display
        sources  = data.get("sources", [])
        station  = sources[0].get("station_name", "Germany") if sources else "Germany"
        obs_time = w.get("timestamp", datetime.utcnow().isoformat())

        return {
            "temperature":          temperature,
            "temperature_stations": {station: temperature} if temperature else {},
            "humidity":             humidity,
            "rainfall_mm":          rainfall_mm,
            "rainfall_districts":   [],
            "uv_index":             "",
            "wind_direction":       wind_dir,
            "wind_speed_kmh":       wind_speed,
            "wind_speed_range":     str(wind_speed),
            "wind_force":           0,
            "wind_force_range":     "0",
            "condition":            _condition_text(condition),
            "general_situation":    "",
            "tc_info":              "",
            "temp_max":             None,
            "temp_min":             None,
            "rh_max":               None,
            "rh_min":               None,
            "warnings":             _warnings(condition),
            "road_multiplier":      round(multiplier, 2),
            "road_condition":       _road_condition_label(multiplier),
            "hko_update_time":      obs_time[:16].replace("T", " ") + " CET",
            "timestamp":            datetime.utcnow().isoformat(),
        }

    except Exception as e:
        return _fallback(str(e))


def _deg_to_compass(deg: int) -> str:
    dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"]
    return dirs[round(deg / 22.5) % 16]


def _condition_text(c: str) -> str:
    return {
        "dry":          "Clear / dry conditions",
        "fog":          "Fog — reduced visibility",
        "rain":         "Rain — wet roads",
        "sleet":        "Sleet — icy roads possible",
        "snow":         "Snow — roads may be slippery",
        "hail":         "Hail — drive carefully",
        "thunderstorm": "Thunderstorm — heavy rain",
    }.get(c, c.capitalize())


def _warnings(c: str) -> list:
    return {
        "thunderstorm": ["Thunderstorm"],
        "snow":         ["Snow"],
        "sleet":        ["Sleet"],
        "hail":         ["Hail"],
        "fog":          ["Fog"],
    }.get(c, [])


def _compute_road_multiplier(rainfall: float, temp, humidity, condition: str) -> float:
    m = 1.0
    if condition == "thunderstorm": m += 0.8
    elif condition == "snow":       m += 1.2
    elif condition == "sleet":      m += 1.0
    elif condition == "hail":       m += 0.6
    elif condition == "rain":       m += 0.3
    elif condition == "fog":        m += 0.2

    if rainfall > 10:  m += 0.4
    elif rainfall > 2: m += 0.2

    if humidity and humidity > 90: m += 0.1
    if temp is not None and temp < 2: m += 0.3  # near-freezing

    return min(3.0, m)


def _road_condition_label(m: float) -> str:
    if m >= 2.5: return "CRITICAL - Roads extremely dangerous"
    if m >= 2.0: return "SEVERE - Reduce speed significantly"
    if m >= 1.5: return "POOR - Drive with caution"
    if m >= 1.2: return "WET - Slippery surfaces likely"
    return "NORMAL"


def _fallback(error: str) -> dict:
    return {
        "temperature": None, "temperature_stations": {}, "humidity": None,
        "rainfall_mm": 0.0, "rainfall_districts": [], "uv_index": "",
        "wind_direction": "--", "wind_speed_kmh": 0, "wind_speed_range": "0",
        "wind_force": 0, "wind_force_range": "0",
        "condition": "", "general_situation": "", "tc_info": "",
        "temp_max": None, "temp_min": None, "rh_max": None, "rh_min": None,
        "warnings": [], "road_multiplier": 1.0, "road_condition": "NORMAL",
        "hko_update_time": "", "timestamp": datetime.utcnow().isoformat(),
        "error": error,
    }
