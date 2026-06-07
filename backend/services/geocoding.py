import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
HEADERS = {
    "User-Agent": "BumpLess/1.0 (hackathon@bump-less.club)",
    "Accept-Language": "en",
}


async def reverse_geocode(lat: float, lng: float) -> str:
    """Best-effort road name for a coordinate (falls back to 'Unknown Road')."""
    try:
        params = {"lat": lat, "lon": lng, "format": "json", "zoom": 17, "addressdetails": 1}
        async with httpx.AsyncClient(timeout=6, headers=HEADERS) as client:
            resp = await client.get(NOMINATIM_URL, params=params)
            resp.raise_for_status()
            addr = resp.json().get("address", {})

        return (
            addr.get("road")
            or addr.get("pedestrian")
            or addr.get("path")
            or addr.get("footway")
            or "Unknown Road"
        )
    except Exception:
        return "Unknown Road"
