import httpx
from datetime import datetime

# HKO real-time warning summary — no API key needed
HKO_WARN_URL = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php"

SIGNAL_LABELS = {
    0:  "No Signal",
    1:  "Standby Signal No.1",
    3:  "Signal No.3",
    8:  "Signal No.8",
    10: "Signal No.10",
}


def _parse_signal(code: str) -> int:
    """
    HKO tropical cyclone codes:
      STANDBY          → Signal 1
      TC3              → Signal 3
      TC8NE / TC8SE / TC8NW / TC8SW → Signal 8
      TC10             → Signal 10
    """
    code = code.upper()
    if "10" in code:   return 10
    if "8"  in code:   return 8
    if "3"  in code:   return 3
    if "STANDBY" in code or "1" in code: return 1
    return 0


async def get_typhoon_signal() -> dict:
    """Returns current HKO tropical cyclone warning signal level."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                HKO_WARN_URL,
                params={"dataType": "warnsum", "lang": "en"},
                headers={"User-Agent": "RoadSense/1.0"},
            )
            resp.raise_for_status()
            data = resp.json()

        # No warnings at all
        if not data:
            return _result(0, "", "")

        # HKO uses key "WTCSGNL" for tropical cyclone warning signal
        tc = data.get("WTCSGNL")
        if not tc or not isinstance(tc, dict):
            return _result(0, "", "")

        code   = tc.get("code", "")
        name   = tc.get("name", "")
        signal = _parse_signal(code)

        return _result(signal, name, code)

    except Exception as e:
        return {**_result(0, "", ""), "error": str(e)}


def _result(signal: int, name: str, code: str) -> dict:
    return {
        "signal":      signal,
        "label":       SIGNAL_LABELS.get(signal, f"Signal {signal}"),
        "name":        name,
        "code":        code,
        "active":      signal >= 8,
        "timestamp":   datetime.utcnow().isoformat(),
    }
