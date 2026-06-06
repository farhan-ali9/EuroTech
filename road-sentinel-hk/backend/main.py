from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from datetime import datetime
import asyncio
import uuid
import os

from models.accelerometer import classify_road_event
from models.sound import classify_road_sound, estimate_features_from_amplitude
from models.fusion import fuse_signals
from models.vision import analyse_frame
from services.dwd import get_current_weather
from services.clustering import ClusteringService
from services.geocoding import reverse_geocode
import database as db

db.init_db()
clustering = ClusteringService()
_weather_cache = {"data": None, "last_fetch": None}
_ws_clients: list[WebSocket] = []


async def refresh_weather():
    while True:
        data = await get_current_weather()
        _weather_cache["data"] = data
        _weather_cache["last_fetch"] = datetime.utcnow().isoformat()
        await asyncio.sleep(60)


async def refresh_incidents():
    await asyncio.sleep(86400)


async def broadcast_loop():
    while True:
        if _ws_clients:
            payload = {
                "hazards": clustering.get_confirmed_hazards(),
                "weather": _weather_cache.get("data"),
                "stats":   clustering.stats(),
                "ts":      datetime.utcnow().isoformat(),
            }
            dead = []
            for ws in _ws_clients:
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                _ws_clients.remove(ws)
        await asyncio.sleep(5)


async def escalation_loop():
    """Bump severity +1 for any hazard unresolved after 48 hours, every hour."""
    while True:
        await asyncio.sleep(3600)
        cutoff = datetime.utcnow() - timedelta(hours=48)
        for h in clustering._hazards.values():
            if not h.get("source") and h["confirmed"]:
                first = datetime.fromisoformat(h["first_reported"])
                if first < cutoff and h["severity"] < 10.0:
                    h["severity"] = round(min(10.0, h["severity"] + 1.0), 1)
                    h["escalated"] = True
                    db.save_hazard(h)


DEMO_POTHOLES = [
    # Kowloon
    {"lat": 22.3193, "lng": 114.1694, "road": "Nathan Road, Mong Kok",              "severity": 8.2, "confidence": 0.91},
    {"lat": 22.3158, "lng": 114.1688, "road": "Argyle Street, Mong Kok",            "severity": 6.1, "confidence": 0.80},
    {"lat": 22.3210, "lng": 114.1720, "road": "Prince Edward Road, Mong Kok",       "severity": 7.4, "confidence": 0.85},
    {"lat": 22.2988, "lng": 114.1722, "road": "Chatham Road, Tsim Sha Tsui",        "severity": 9.1, "confidence": 0.95},
    {"lat": 22.2963, "lng": 114.1698, "road": "Canton Road, Tsim Sha Tsui",         "severity": 5.8, "confidence": 0.74},
    {"lat": 22.3048, "lng": 114.1815, "road": "Ma Tau Wai Road, Kowloon City",      "severity": 7.9, "confidence": 0.89},
    {"lat": 22.3082, "lng": 114.2259, "road": "Kwun Tong Road, Kwun Tong",          "severity": 4.1, "confidence": 0.65},
    {"lat": 22.3120, "lng": 114.2240, "road": "Hoi Yuen Road, Kwun Tong",           "severity": 8.7, "confidence": 0.93},
    {"lat": 22.3368, "lng": 114.1755, "road": "Waterloo Road, Kowloon Tong",        "severity": 7.8, "confidence": 0.88},
    {"lat": 22.3302, "lng": 114.1624, "road": "Cheung Sha Wan Road, Sham Shui Po",  "severity": 6.3, "confidence": 0.77},
    {"lat": 22.3330, "lng": 114.1700, "road": "Tai Po Road, Sham Shui Po",          "severity": 5.0, "confidence": 0.70},
    {"lat": 22.3260, "lng": 114.2100, "road": "Choi Hung Road, Wong Tai Sin",       "severity": 6.9, "confidence": 0.82},
    {"lat": 22.3350, "lng": 114.2030, "road": "Junction Road, Wong Tai Sin",        "severity": 4.5, "confidence": 0.68},
    {"lat": 22.3090, "lng": 114.1910, "road": "To Kwa Wan Road, Kowloon City",      "severity": 8.4, "confidence": 0.92},
    {"lat": 22.3180, "lng": 114.1900, "road": "Lung Cheung Road, Kowloon",          "severity": 3.8, "confidence": 0.61},
    # HK Island
    {"lat": 22.2796, "lng": 114.1831, "road": "Yee Wo Street, Causeway Bay",        "severity": 6.5, "confidence": 0.78},
    {"lat": 22.2784, "lng": 114.1724, "road": "Hennessy Road, Wan Chai",            "severity": 5.3, "confidence": 0.72},
    {"lat": 22.2820, "lng": 114.1580, "road": "Queen's Road Central",               "severity": 7.2, "confidence": 0.86},
    {"lat": 22.2760, "lng": 114.1450, "road": "Kennedy Road, Admiralty",            "severity": 4.8, "confidence": 0.69},
    {"lat": 22.2830, "lng": 114.1760, "road": "Johnston Road, Wan Chai",            "severity": 6.0, "confidence": 0.75},
    {"lat": 22.2700, "lng": 114.2290, "road": "Shau Kei Wan Road, Eastern",         "severity": 8.9, "confidence": 0.94},
    {"lat": 22.2840, "lng": 114.2200, "road": "King's Road, North Point",           "severity": 5.6, "confidence": 0.73},
    {"lat": 22.2770, "lng": 114.1320, "road": "Des Voeux Road West, Sai Wan",       "severity": 7.1, "confidence": 0.84},
    {"lat": 22.2640, "lng": 114.1480, "road": "Aberdeen Street, Central",           "severity": 3.5, "confidence": 0.60},
    {"lat": 22.2480, "lng": 114.1700, "road": "Repulse Bay Road, Southern",         "severity": 6.7, "confidence": 0.79},
    {"lat": 22.2520, "lng": 114.2120, "road": "Chai Wan Road, Chai Wan",            "severity": 9.3, "confidence": 0.96},
    # New Territories
    {"lat": 22.3847, "lng": 114.1964, "road": "Tai Po Road, Sha Tin",               "severity": 5.4, "confidence": 0.71},
    {"lat": 22.3750, "lng": 114.1980, "road": "Che Kung Miu Road, Sha Tin",         "severity": 7.0, "confidence": 0.83},
    {"lat": 22.3910, "lng": 113.9777, "road": "Castle Peak Road, Tuen Mun",         "severity": 8.5, "confidence": 0.92},
    {"lat": 22.4458, "lng": 114.0218, "road": "Yuen Long Kau Hui Road, Yuen Long",  "severity": 6.2, "confidence": 0.76},
    {"lat": 22.4490, "lng": 114.1742, "road": "Tai Po Road, Tai Po",                "severity": 4.7, "confidence": 0.67},
    {"lat": 22.3812, "lng": 114.2673, "road": "Hiram's Highway, Sai Kung",          "severity": 7.6, "confidence": 0.87},
    {"lat": 22.3700, "lng": 114.1171, "road": "Texaco Road, Tsuen Wan",             "severity": 5.9, "confidence": 0.75},
    {"lat": 22.4350, "lng": 114.0800, "road": "Kam Tin Road, Yuen Long",            "severity": 6.8, "confidence": 0.81},
    {"lat": 22.5000, "lng": 114.1200, "road": "Fanling Highway, North NT",          "severity": 4.3, "confidence": 0.64},
    {"lat": 22.4950, "lng": 114.1380, "road": "San Wan Road, Sheung Shui",          "severity": 7.3, "confidence": 0.86},
]

def _seed_demo():
    now = datetime.utcnow().isoformat()
    for i, p in enumerate(DEMO_POTHOLES):
        hid = f"demo_{i}"
        if hid not in clustering._hazards:
            clustering._hazards[hid] = {
                "id": hid, "lat": p["lat"], "lng": p["lng"],
                "event_type": "pothole", "severity": p["severity"],
                "confidence": p["confidence"], "report_count": 1,
                "first_reported": now, "last_reported": now,
                "weather_multiplier": 1.0, "confirmed": True, "government_reported": False,
                "reported_at": None, "district": "Hong Kong",
                "road_name": p["road"], "full_address": None, "source": "demo",
            }


@asynccontextmanager
async def lifespan(app: FastAPI):
    # _seed_demo()  # commented out — only real driver detections
    asyncio.create_task(refresh_weather())
    asyncio.create_task(refresh_incidents())
    asyncio.create_task(broadcast_loop())
    asyncio.create_task(escalation_loop())
    yield


app = FastAPI(title="Road Sentinel DE", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/report")
async def receive_report(data: dict):
    lat   = data.get("lat")
    lng   = data.get("lng")
    speed = data.get("speed_kmh", 0)

    # lat/lng optional — fall back to Berlin centre when GPS not available
    if lat is None or lat == 0.0: lat = 52.5200
    if lng is None or lng == 0.0: lng = 13.4050

    # Accelerometer analysis
    accel_raw  = data.get("accelerometer", {})
    accel_event = classify_road_event(
        z=accel_raw.get("z", -9.81),
        x=accel_raw.get("x", 0),
        y=accel_raw.get("y", 0),
        speed_kmh=speed,
        lx=accel_raw.get("lx", 0.0),
        ly=accel_raw.get("ly", 0.0),
        lz=accel_raw.get("lz", 0.0),
    )

    # Sound analysis
    sound_event = None
    audio_raw = data.get("audio_amplitude", [])
    if audio_raw:
        features   = estimate_features_from_amplitude(audio_raw)
        sound_event = classify_road_sound(features)
    elif data.get("audio_features"):
        sound_event = classify_road_sound(data["audio_features"])

    # Weather multiplier
    weather     = _weather_cache.get("data") or {}
    multiplier  = weather.get("road_multiplier", 1.0)

    # Vision / camera analysis
    vision_event = None
    if data.get("frame"):
        vision_event = analyse_frame(data["frame"])

    # Fuse all signals
    result = fuse_signals(accel_event, sound_event, multiplier, vision_event)

    if result is None:
        return {"status": "ok", "hazard_detected": False}

    hazard_id = clustering.add_report(
        lat=lat,
        lng=lng,
        event_type=result["event_type"],
        severity=result["severity"],
        confidence=result["confidence"],
        weather_multiplier=multiplier,
    )

    # Enrich newly confirmed hazards with road name via OpenStreetMap
    if hazard_id and hazard_id in clustering._hazards:
        h = clustering._hazards[hazard_id]
        if h["confirmed"] and h.get("road_name") is None:
            asyncio.create_task(_enrich_road_name(hazard_id, lat, lng))

    return {
        "status":          "ok",
        "hazard_detected": True,
        "hazard_id":       hazard_id,
        "event_type":      result["event_type"],
        "severity":        result["severity"],
        "severity_level":  result["severity_level"],
        "speed_rec_kmh":   result["speed_kmh"],
        "weather_boost":   result["weather_boost"],
        "vision_detected": vision_event is not None,
        "vision_details":  vision_event.details if vision_event else None,
        "signals_used":    _signals_used(accel_event, sound_event, vision_event),
    }


async def _enrich_road_name(hazard_id: str, lat: float, lng: float):
    geo = await reverse_geocode(lat, lng)
    clustering.set_road_name(hazard_id, geo["road_name"], geo["full_address"])


def _signals_used(accel, sound, vision) -> list:
    used = []
    if accel:  used.append("accelerometer")
    if sound:  used.append("audio")
    if vision: used.append("camera")
    return used


@app.get("/hazards")
async def get_hazards():
    return {
        "hazards":   clustering.get_confirmed_hazards(),
        "stats":     clustering.stats(),
        "weather":   _weather_cache.get("data"),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/hazards/nearby")
async def get_nearby(lat: float, lng: float, radius: float = 300):
    nearby = clustering.get_hazards_near(lat, lng, radius)
    return {
        "hazards":  nearby,
        "count":    len(nearby),
        "lat":      lat,
        "lng":      lng,
        "radius_m": radius,
    }


@app.get("/weather")
async def get_weather():
    return _weather_cache.get("data") or await get_current_weather()


@app.get("/stats")
async def get_stats():
    return clustering.stats()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    _ws_clients.append(websocket)

    # Send immediate snapshot
    await websocket.send_json({
        "hazards": clustering.get_confirmed_hazards(),
        "weather": _weather_cache.get("data"),
        "stats":   clustering.stats(),
        "ts":      datetime.utcnow().isoformat(),
    })

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)



@app.get("/government/alerts")
async def government_alerts():
    all_hazards = clustering.get_confirmed_hazards()
    # Exclude demo data from government view — only show real driver detections
    real = [h for h in all_hazards if h.get("source") != "demo"]
    return {
        "alerts":    sorted(real, key=lambda h: h["severity"], reverse=True),
        "count":     len(real),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/hazards/{hazard_id}/resolve")
async def resolve_hazard(hazard_id: str):
    ok = clustering.resolve_hazard(hazard_id)
    if not ok:
        return {"status": "error", "message": "Hazard not found"}
    # Broadcast updated list to all dashboard clients immediately
    payload = {
        "hazards": clustering.get_confirmed_hazards(),
        "weather": _weather_cache.get("data"),
        "stats":   clustering.stats(),
        "ts":      datetime.utcnow().isoformat(),
    }
    dead = []
    for ws in _ws_clients:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients.remove(ws)
    return {"status": "ok", "hazard_id": hazard_id, "removed": True}


@app.post("/hazards/{hazard_id}/report-government")
async def report_to_government(hazard_id: str):
    ok = clustering.mark_government_reported(hazard_id)
    if not ok:
        return {"status": "error", "message": "Hazard not found"}
    return {"status": "ok", "hazard_id": hazard_id, "government_reported": True}


@app.get("/health")
async def health():
    return {"status": "ok", "clients": len(_ws_clients), "ts": datetime.utcnow().isoformat()}


# ── Serve built React frontend (production) ──────────────────────────────────
_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.isdir(_DIST):
    # Serve static assets (JS/CSS/images) directly
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")

    # SPA fallback — all other paths return index.html so React Router works
    @app.get("/", include_in_schema=False)
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str = ""):
        return FileResponse(os.path.join(_DIST, "index.html"))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
