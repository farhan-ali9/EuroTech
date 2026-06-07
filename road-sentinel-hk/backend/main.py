from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import asyncio
import uuid
import os

from models.accelerometer import classify_road_event
from models.sound import classify_road_sound, estimate_features_from_amplitude
from models.fusion import fuse_signals
from models.vision import analyse_frame
from services.dwd import get_current_weather
from services.typhoon import get_typhoon_signal
from services.clustering import ClusteringService
from services.geocoding import reverse_geocode
import database as db

db.init_db()
clustering = ClusteringService()
_weather_cache  = {"data": None, "last_fetch": None}
_typhoon_cache  = {"data": {"signal": 0, "active": False, "label": "No Signal", "name": ""}, "last_fetch": None}
_ws_clients: list[WebSocket] = []
# device_id → last seen timestamp for fleet tracking
_active_devices: dict[str, datetime] = {}
DEVICE_TIMEOUT_SECS = 30


async def refresh_weather():
    while True:
        data = await get_current_weather()
        _weather_cache["data"] = data
        _weather_cache["last_fetch"] = datetime.utcnow().isoformat()
        await asyncio.sleep(60)


async def refresh_incidents():
    await asyncio.sleep(86400)


async def refresh_typhoon():
    """Poll HKO typhoon signal every 10 minutes."""
    while True:
        data = await get_typhoon_signal()
        _typhoon_cache["data"]       = data
        _typhoon_cache["last_fetch"] = datetime.utcnow().isoformat()
        await asyncio.sleep(600)


async def broadcast_loop():
    while True:
        if _ws_clients:
            cutoff = datetime.utcnow() - timedelta(seconds=DEVICE_TIMEOUT_SECS)
            active_drivers = sum(1 for t in _active_devices.values() if t >= cutoff)
            payload = {
                "hazards":        clustering.get_confirmed_hazards(),
                "weather":        _weather_cache.get("data"),
                "stats":          clustering.stats(),
                "typhoon":        _typhoon_cache.get("data"),
                "active_drivers": active_drivers,
                "ts":             datetime.utcnow().isoformat(),
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(refresh_weather())
    asyncio.create_task(refresh_incidents())
    asyncio.create_task(refresh_typhoon())
    asyncio.create_task(broadcast_loop())
    asyncio.create_task(escalation_loop())
    yield


app = FastAPI(title="RoadSense", lifespan=lifespan)

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

    device_id = data.get("device_id")
    if device_id:
        _active_devices[device_id] = datetime.utcnow()

    # lat/lng optional — fall back to Berlin centre when GPS not available
    if lat is None or lat == 0.0: lat = 52.5200
    if lng is None or lng == 0.0: lng = 13.4050

    # During typhoon (T8+) lower threshold to catch post-storm road damage
    typhoon_active = _typhoon_cache["data"].get("active", False)
    typhoon_threshold_override = 1.2 if typhoon_active else None

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
        threshold_override=typhoon_threshold_override,
    )

    # Sound and vision only activate when vehicle is moving
    sound_event  = None
    vision_event = None

    if speed >= 5:
        audio_raw = data.get("audio_amplitude", [])
        if audio_raw:
            features    = estimate_features_from_amplitude(audio_raw)
            sound_event = classify_road_sound(features)
        elif data.get("audio_features"):
            sound_event = classify_road_sound(data["audio_features"])

        if data.get("frame"):
            vision_event = analyse_frame(data["frame"])

    # Weather multiplier
    weather    = _weather_cache.get("data") or {}
    multiplier = weather.get("road_multiplier", 1.0)

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
        typhoon_damage=typhoon_active,
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
        "hazards":  clustering.get_confirmed_hazards(),
        "weather":  _weather_cache.get("data"),
        "stats":    clustering.stats(),
        "typhoon":  _typhoon_cache.get("data"),
        "ts":       datetime.utcnow().isoformat(),
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
    return {
        "alerts":    sorted(all_hazards, key=lambda h: h["severity"], reverse=True),
        "count":     len(real),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.delete("/hazards/all")
async def clear_all_hazards():
    clustering._hazards.clear()
    db.clear_all_hazards()
    return {"status": "ok", "cleared": True}


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


@app.get("/typhoon/status")
async def typhoon_status():
    return _typhoon_cache.get("data")


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
