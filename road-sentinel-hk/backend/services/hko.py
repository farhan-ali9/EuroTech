import httpx
from datetime import datetime

HKO_RHRREAD = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

async def get_current_weather() -> dict:
    try:
        async with httpx.AsyncClient(timeout=10, headers=HEADERS) as client:
            resp = await client.get(HKO_RHRREAD, params={"dataType": "rhrread", "lang": "en"})
            resp.raise_for_status()
            data = resp.json()

        temperature = _extract_temp(data)
        humidity    = _extract_humidity(data)
        rainfall    = _extract_rainfall(data)
        warnings    = _extract_warnings(data)
        multiplier  = _compute_road_multiplier(rainfall, temperature, humidity, warnings)

        return {
            "temperature":     temperature,
            "humidity":        humidity,
            "rainfall_mm":     rainfall,
            "warnings":        warnings,
            "road_multiplier": round(multiplier, 2),
            "road_condition":  _road_condition_label(multiplier),
            "timestamp":       datetime.utcnow().isoformat(),
        }

    except Exception as e:
        return _fallback_weather(str(e))


def _extract_temp(data: dict) -> float:
    try:
        readings = data.get("temperature", {}).get("data", [])
        valid = [float(r["value"]) for r in readings if r.get("value") not in [None, "", "N/A"]]
        return round(sum(valid) / len(valid), 1) if valid else 25.0
    except:
        return 25.0


def _extract_humidity(data: dict) -> float:
    try:
        readings = data.get("humidity", {}).get("data", [])
        valid = [float(r["value"]) for r in readings if r.get("value") not in [None, "", "N/A"]]
        return round(sum(valid) / len(valid), 1) if valid else 70.0
    except:
        return 70.0


def _extract_rainfall(data: dict) -> float:
    try:
        stations = data.get("rainfall", {}).get("data", [])
        totals = [float(s["max"]) for s in stations if s.get("max") not in [None, "N/A", ""] and s["max"] != 0]
        return round(max(totals), 1) if totals else 0.0
    except:
        return 0.0


def _extract_warnings(data: dict) -> list:
    # Warnings come as plain text in warningMessage array
    msgs = data.get("warningMessage", [])
    if isinstance(msgs, str):
        msgs = [msgs]

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


def _compute_road_multiplier(rainfall: float, temp: float, humidity: float, warnings: list) -> float:
    multiplier = 1.0

    if "Black Rainstorm" in warnings:  multiplier += 1.5
    elif "Red Rainstorm" in warnings:  multiplier += 1.0
    elif "Amber Rainstorm" in warnings: multiplier += 0.5
    if "Thunderstorm" in warnings:     multiplier += 0.3
    if "Typhoon" in warnings:          multiplier += 1.0

    if rainfall > 50:   multiplier += 0.6
    elif rainfall > 20: multiplier += 0.3
    elif rainfall > 5:  multiplier += 0.15

    if humidity > 90:   multiplier += 0.1
    if temp > 35:       multiplier += 0.1

    return min(3.0, multiplier)


def _road_condition_label(m: float) -> str:
    if m >= 2.5: return "CRITICAL — Roads extremely dangerous"
    if m >= 2.0: return "SEVERE — Reduce speed significantly"
    if m >= 1.5: return "POOR — Drive with caution"
    if m >= 1.2: return "WET — Slippery surfaces likely"
    return "NORMAL"


def _fallback_weather(error: str) -> dict:
    return {
        "temperature":     25.0,
        "humidity":        70.0,
        "rainfall_mm":     0.0,
        "warnings":        [],
        "road_multiplier": 1.0,
        "road_condition":  "NORMAL",
        "timestamp":       datetime.utcnow().isoformat(),
        "error":           error,
    }
