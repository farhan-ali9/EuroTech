"""BumpLess backend — accelerometer road-defect aggregation.

The phone detects bumps and POSTs already-classified defects {lat, lng, severity}.
This service clusters reports across drivers, persists them to Postgres, and serves
the map data. No raw accelerometer data is received here.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime
import asyncio

from services.clustering import ClusteringService
from services.geocoding import reverse_geocode
import database as db

db.init_db()
clustering = ClusteringService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="BumpLess", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/report")
async def report(data: dict):
    """Record a detected road defect. Body: {lat, lng, severity (1-5)}."""
    lat = data.get("lat")
    lng = data.get("lng")
    severity = data.get("severity")

    if lat is None or lng is None or severity is None:
        return {"detected": False, "error": "lat, lng and severity are required"}

    defect_id, is_new = clustering.add_defect(float(lat), float(lng), float(severity))

    # Look up the road name once, in the background, for new defects.
    if is_new:
        asyncio.create_task(_enrich_road_name(defect_id, float(lat), float(lng)))

    d = clustering._defects.get(defect_id, {})
    return {
        "detected": True,
        "defect_id": defect_id,
        "severity": d.get("severity"),
        "report_count": d.get("report_count"),
        "is_new": is_new,
    }


async def _enrich_road_name(defect_id: str, lat: float, lng: float):
    geo = await reverse_geocode(lat, lng)
    clustering.set_road_name(defect_id, geo.get("road_name"))


@app.get("/hazards")
async def hazards():
    """All defects — for the government map."""
    return {
        "hazards": clustering.all_defects(),
        "stats": clustering.stats(),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/hazards/nearby")
async def hazards_nearby(lat: float, lng: float, radius: float = 1000):
    """Defects near a point — for the driver proximity warning."""
    found = clustering.defects_near(lat, lng, radius)
    return {"hazards": found, "count": len(found), "radius_m": radius}


@app.get("/health")
async def health():
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}


@app.get("/")
async def root():
    return {
        "name": "BumpLess",
        "status": "running",
        "endpoints": ["/report", "/hazards", "/hazards/nearby", "/health", "/docs"],
        "ts": datetime.utcnow().isoformat(),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
