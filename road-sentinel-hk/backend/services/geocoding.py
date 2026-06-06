import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
HEADERS = {
    "User-Agent": "RoadSentinelHK/1.0 (hackathon@eurotech.hk)",
    "Accept-Language": "en",
}


async def reverse_geocode(lat: float, lng: float) -> dict:
    try:
        params = {
            "lat":    lat,
            "lon":    lng,
            "format": "json",
            "zoom":   17,       # street-level detail
            "addressdetails": 1,
        }
        async with httpx.AsyncClient(timeout=6, headers=HEADERS) as client:
            resp = await client.get(NOMINATIM_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        addr  = data.get("address", {})
        road  = (
            addr.get("road") or
            addr.get("pedestrian") or
            addr.get("path") or
            addr.get("footway") or
            "Unknown Road"
        )
        suburb = (
            addr.get("suburb") or
            addr.get("neighbourhood") or
            addr.get("quarter") or
            addr.get("village") or
            ""
        )
        city   = addr.get("city") or addr.get("town") or "Hong Kong"
        label  = f"{road}, {suburb}" if suburb else f"{road}, {city}"

        return {
            "road_name":   road,
            "suburb":      suburb,
            "full_address": label,
        }

    except Exception:
        return {
            "road_name":    "Unknown Road",
            "suburb":       "",
            "full_address": f"{lat:.4f}, {lng:.4f}",
        }
