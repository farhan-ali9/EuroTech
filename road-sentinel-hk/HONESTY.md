# HONESTY.md

> Mandatory disclosure for the hackathon judges.
> Disclosed shortcuts are **not** penalised — hidden ones are.

---

## 1. Team — who did what

| Member | GitHub handle | Main contributions |
|--------|--------------|-------------------|
| Farhan Ghulam | @farhan-ali9 | **Full-stack web app** — designed and built the entire RoadSense web application from scratch: FastAPI REST + WebSocket backend (`main.py`, `database.py`), three-sensor detection models (`accelerometer.py`, `sound.py`, `vision.py`, `fusion.py`), hazard clustering service, SQLite persistence, auto-escalation loop, DWD/BrightSky weather integration, Nominatim reverse geocoding, React 18 frontend (Driver Mode, Dashboard, Government Portal), glassmorphism UI redesign, voice alerts via Web Speech API (Meta glasses compatible), distance countdown + speed warnings, speed gate (frontend + backend), HTTPS via Vite dev SSL, Docker single-container deployment on Render |
| Aleksandr Gorbunov | @adrks10-aleksandr *(aleksandr.gorbunov@outlook.de)* | **Repo hygiene + live incident data** — added `.gitignore` and removed committed `node_modules` / `__pycache__` files from history; built `hk_incidents.py` service that pulls live road-event data from HKO + Transport Department APIs every 5 minutes and injects them into the clustering engine as official hazards; added `/incidents/refresh` manual trigger endpoint; extended accelerometer model to accept linear-acceleration fields (`lx`, `ly`, `lz`); added `.env.example` documenting the required Mapbox token env var |
| Adrian | @adrks10 | **Dedicated hardware sensor firmware** — wrote the embedded firmware (`main.m5f2`) for a physical road-detection device that detects jolts locally on-board; hardware currently stores detections locally and has not yet been connected to the web app's `/report` endpoint (GPS + upload path integration is the next step) |

---

## 2. What is fully working

All features below run end-to-end on the live deployed app at `https://roadsense.onrender.com` with real sensor data and real logic. No simulated inputs.

- **Pothole detection via accelerometer** — phone reads `DeviceMotionEvent` at 500 ms intervals, computes linear jolt magnitude √(lx²+ly²+lz²). Triggers when jolt ≥ 2.0 m/s² **and** GPS speed ≥ 5 km/h. Completely blocked when stationary — hand-shaking the phone produces zero detections.

- **Microphone audio analysis** — browser `AudioContext` + `AnalyserNode` extracts 6 features live from the microphone: RMS amplitude, zero-crossing rate, spectral centroid, peak dB, low-frequency energy (0–500 Hz), high-frequency energy (2.5–22 kHz). Rule-based classifier matches these against pothole impact, wet road, tire squeal, and rough road profiles.

- **Camera visual detection** — rear-facing phone camera captures JPEG frames every 1.5 s, sent to the FastAPI backend. OpenCV pipeline: Gaussian blur → adaptive thresholding → global dark-region mask → Canny edge detection → contour analysis (circularity, aspect ratio, edge density, area). Returns pothole confidence score.

- **Three-sensor fusion** — `backend/models/fusion.py` combines all signals with weighted confidence: accelerometer 50–65%, audio 25–40%, camera 25–35% depending on which fired. When all three agree → 1.3× confidence boost. When they disagree → majority vote. A single weak signal alone will not trigger a confirmed hazard.

- **Speed gate (both layers)** — frontend freezes jolt display at 0 when GPS speed < 5 km/h. Backend independently rejects the entire report if `speed_kmh < 5` before running any model. Audio and camera are also server-side blocked below 5 km/h.

- **Hazard clustering** — reports within 50 m of each other are merged into one cluster. A hazard is only marked "confirmed" after ≥ 2 independent reports. Severity is the rolling 90th percentile of jolt readings in the cluster.

- **Live WebSocket dashboard** — FastAPI broadcasts hazard list + weather + stats to all connected browser tabs every 5 seconds. Map pins update in real-time without page refresh. Desktop and mobile can be open simultaneously.

- **Driver mode proximity banner** — every 3 s the driver's phone fetches all hazards within 300 m. The highest-severity hazard triggers a banner showing distance and recommended speed. Banner disappears when no hazards are nearby.

- **Voice alerts (Meta glasses compatible)** — `window.speechSynthesis` announces through whichever audio output is active (phone speaker or Bluetooth glasses speakers):
  - First detection in 5 s: *"Pothole detected. Hazard recorded."* (5 s cooldown)
  - New hazard enters 300 m: *"Pothole ahead, X metres. Slow to Y kilometres per hour."*
  - Distance countdown: *"Pothole in 200 metres"* → *"100 metres"* → *"50 metres"* (each announced once)
  - Still too fast: *"Too fast. Slow down to Y kilometres per hour."* (8 s cooldown)

- **Government portal** — shows all confirmed hazards sorted by severity, grouped by German district, with report count and confidence. Officers can flag "Send to BASt", "Mark Resolved", export CSV, or clear all data.

- **Auto-escalation** — background task runs every hour server-side. Any confirmed hazard unresolved after 48 h gets severity +1 (max 10) and is tagged "Escalated" in the portal.

- **DWD weather integration** — real HTTP call to BrightSky API (Deutsche Wetterdienst open data). Current weather fetched every 60 s. `road_multiplier` (1.0–1.4) is applied to detected severity: rain +20%, heavy rain +35%, snow +40%.

- **Reverse geocoding** — asynchronous background call to OpenStreetMap Nominatim on every newly confirmed hazard. Road name and full address stored in SQLite and shown in the portal.

- **SQLite persistence** — all confirmed hazards survive backend restarts. `DB_PATH` environment variable points to Render's persistent disk (`/var/data/hazards.db`) in production.

- **Deployed on Render (free tier)** — single Docker container builds Python backend + React frontend. One public HTTPS URL serves both the web dashboard and the mobile `/drive` page from any network, no same-WiFi requirement.

---

## 3. What is mocked, stubbed, or hardcoded

| What is faked | Where (file) | Why | What the real version would do |
|--------------|-------------|-----|-------------------------------|
| **Detection uses rule-based thresholds, not a trained ML model** | `backend/models/accelerometer.py`, `sound.py`, `vision.py` | Training a labelled pothole dataset (dashcam footage + IMU logs) was out of scope for a weekend hackathon | Production would use a CNN trained on labelled road footage for vision, and a supervised classifier trained on labelled IMU recordings for accelerometer |
| **Confidence scores are formula-derived** | `backend/models/fusion.py` | No ground-truth labels to calibrate against | Real confidence would come from a trained classifier's softmax output, calibrated on a held-out test set |
| **German district detection uses hardcoded lat/lng bounding boxes** | `backend/services/clustering.py` | Integrating official shapefile/PostGIS geometry was out of scope | Would do a point-in-polygon lookup against official German Kreise boundary files (Bundesamt für Kartographie) |
| **Typhoon mode polls HKO (Hong Kong Observatory)** — not a German API | `backend/services/typhoon.py` | Project started as a Hong Kong prototype; DWD has no equivalent real-time storm-signal endpoint | Would integrate DWD CAP (Common Alerting Protocol) severe weather warnings for Germany |
| **Berlin fallback coordinates** when GPS unavailable | `backend/main.py` line ~170 | Prevents null GPS crashing the pipeline | Would require GPS lock before accepting any report |

---

## 4. External APIs, services & data sources

| Service / API | Used for | Real or mocked? | Auth |
|--------------|---------|----------------|------|
| **BrightSky / DWD** `api.brightsky.dev` | Current weather + road severity multiplier | ✅ Real HTTP call every 60 s | None — public open API |
| **OpenStreetMap Nominatim** `nominatim.openstreetmap.org` | Reverse geocoding GPS → road name | ✅ Real HTTP call per new hazard | None — public, rate-limited to 1 req/s |
| **HKO Warning Summary** `data.weather.gov.hk` | Typhoon signal level (T1/T3/T8/T10) | ✅ Real HTTP call every 10 min | None — public open API |
| **Mapbox GL JS** | Interactive map tiles, cluster pins | ✅ Real API call | Restricted API token (domain-locked) |
| **Browser Geolocation API** | Driver GPS position and speed | ✅ Real device sensor | User permission prompt |
| **DeviceMotionEvent API** | Accelerometer x/y/z + linear acceleration | ✅ Real device sensor | User permission prompt (iOS 13+ only) |
| **Web Audio API** | Live microphone stream analysis | ✅ Real device sensor | User permission prompt |
| **MediaDevices.getUserMedia** | Rear camera frame capture | ✅ Real device sensor | User permission prompt |
| **Web Speech API — speechSynthesis** | Voice alerts through phone / Bluetooth glasses | ✅ Real browser API | None |

---

## 5. Pre-existing code

| Item | Source | How much | License |
|------|--------|----------|---------|
| Vite + React project scaffold | `npm create vite@latest` standard template | ~5 files, ~50 lines of boilerplate | MIT |
| FastAPI application skeleton | Standard FastAPI `pip install fastapi uvicorn` quickstart | ~10 lines | MIT |

All feature code — sensor fusion models, OpenCV vision pipeline, WebSocket layer, driver mode, government portal, clustering service, database layer, voice alerts, Docker config, deployment pipeline — was written **during the hackathon window**.

**AI-assistance disclosure:** The entire codebase was written with Claude (Anthropic) as an AI pair-programmer. Every feature, architecture decision, and design choice was directed, reviewed, and tested by Farhan Ghulam. Claude generated code on request; the human developer drove all product decisions and validated every feature against the real hardware (phone sensors, Bluetooth glasses).

---

## 6. Known limitations & next steps

- **No trained ML model** — the single biggest limitation. A CNN on labelled dashcam data + a trained IMU classifier would cut false positives significantly and produce calibrated confidence scores.
- **Single phone = single reporter** — fleet mode (multiple simultaneous drivers feeding one dashboard) requires a proper auth layer and per-device session tracking.
- **GPS indoors is noisy** — the 5 km/h speed gate prevents most false detections but GPS position can drift 10–30 m indoors, slightly misplacing confirmed hazards on the map.
- **Audio sensitive to car environment** — loud music, engine noise, or wind can match the pothole audio signature. The accelerometer cross-check greatly reduces this but does not eliminate it entirely.
- **Camera vision is daylight-only** — the adaptive thresholding relies on contrast; nighttime or tunnel detection would need separate threshold tuning or IR input.
- **SQLite is single-writer** — fine for a hackathon demo; a production multi-region deployment would need PostgreSQL.
- **Typhoon mode HKO → DWD migration** — HKO API used as a stand-in; real Germany deployment needs DWD CAP severe weather integration.
- **No user authentication** — the government portal is publicly accessible; production would require auth before "Send to BASt" or "Resolve" actions.

---

*RoadSense — real-time AI pothole detection and road hazard reporting.*
*Built at EuroTech Hackathon, June 2026.*
