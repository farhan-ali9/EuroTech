from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime
import asyncio
import uuid

from models.accelerometer import classify_road_event
from models.sound import classify_road_sound, estimate_features_from_amplitude
from models.fusion import fuse_signals
from models.vision import analyse_frame
from services.hko import get_current_weather
from services.clustering import ClusteringService
from services.geocoding import reverse_geocode

clustering = ClusteringService()
_weather_cache = {"data": None, "last_fetch": None}
_ws_clients: list[WebSocket] = []


async def refresh_weather():
    while True:
        data = await get_current_weather()
        _weather_cache["data"] = data
        _weather_cache["last_fetch"] = datetime.utcnow().isoformat()
        await asyncio.sleep(60)


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(refresh_weather())
    asyncio.create_task(broadcast_loop())
    yield


app = FastAPI(title="Road Sentinel HK", lifespan=lifespan)

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

    if lat is None or lng is None:
        return {"status": "error", "message": "lat/lng required"}

    # Ignore reports when nearly stationary — eliminates false positives from handling
    if speed < 8:
        return {"status": "ok", "hazard_detected": False, "reason": "speed_too_low"}

    # Accelerometer analysis
    accel_raw  = data.get("accelerometer", {})
    accel_event = classify_road_event(
        z=accel_raw.get("z", -9.81),
        x=accel_raw.get("x", 0),
        y=accel_raw.get("y", 0),
        speed_kmh=speed,
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

    was_confirmed_before = any(
        h["id"] == hid and h["confirmed"]
        for hid, h in clustering._hazards.items()
        for _ in [None]
    ) if False else False

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


@app.get("/")
async def root():
    return {
        "name":      "Road Sentinel HK",
        "status":    "running",
        "endpoints": ["/hazards", "/hazards/nearby", "/weather", "/stats", "/health", "/ws", "/docs"],
        "ts":        datetime.utcnow().isoformat(),
    }

@app.get("/government/alerts")
async def government_alerts():
    all_hazards = clustering.get_confirmed_hazards()
    reported    = [h for h in all_hazards if h.get("government_reported")]
    return {
        "alerts":    reported,
        "count":     len(reported),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/health")
async def health():
    return {"status": "ok", "clients": len(_ws_clients), "ts": datetime.utcnow().isoformat()}
