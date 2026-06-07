# HONESTY.md

> Mandatory disclosure for the hackathon judges.
> Disclosed shortcuts are **not** penalised — hidden ones are.

---

## 1. Team — who did what

| Member | GitHub handle | Main contributions |
|--------|--------------|-------------------|
| Farhan Ghulam | @farhan-ali9 | **Web app — backend & frontend** — FastAPI backend (`main.py`, `database.py`), three-sensor detection models (`accelerometer.py`, `sound.py`, `vision.py`, `fusion.py`), hazard clustering, SQLite persistence, auto-escalation, DWD weather integration, Nominatim reverse geocoding, React 18 frontend (Driver Mode, Dashboard, Government Portal), glassmorphism UI, voice alerts via Web Speech API (Meta glasses), distance countdown + speed warnings, speed gate, Docker deployment on Render |
| Aleksandr Gorbunov | @AleksandrGorbunov *(aleksandr.gorbunov@outlook.de)* | **Backend development + repo setup** — built live road-incident data integration (`hk_incidents.py`) pulling from HKO + Transport Department APIs, added background refresh loop and `/incidents/refresh` endpoint, extended accelerometer model with linear-acceleration fields (`lx`, `ly`, `lz`), added `.gitignore`, cleaned up repo, added `.env.example`; additional work was done locally but not all changes were pushed to GitHub |
| Adrian | @adrks10 | **Hardware sensor** — built and connected a physical bump-detection sensor, firmware (`main.m5f2`) is working and successfully detecting road bumps during testing; the sensor currently stores data locally and the upload path to the web app's `/report` endpoint has not yet been integrated |

---

## 2. What is fully working

All features below run end-to-end on the live deployed app with real sensor data and real logic. No simulated inputs.

- **Pothole detection via phone accelerometer** — phone reads `DeviceMotionEvent` at 500 ms intervals, computes linear jolt magnitude √(lx²+ly²+lz²). Triggers when jolt ≥ 2.0 m/s² **and** GPS speed ≥ 5 km/h. Completely blocked when stationary — hand-shaking the phone produces zero detections.

- **Microphone audio analysis** — browser `AudioContext` + `AnalyserNode` extracts 6 features live from the microphone: RMS amplitude, zero-crossing rate, spectral centroid, peak dB, low-frequency energy (0–500 Hz), high-frequency energy (2.5–22 kHz). Rule-based classifier matches these against pothole impact, wet road, tire squeal, and rough road profiles.

- **Camera visual detection** — rear-facing phone camera captures JPEG frames every 1.5 s, sent to FastAPI backend. OpenCV pipeline: Gaussian blur → adaptive thresholding → global dark-region mask → Canny edge detection → contour analysis (circularity, aspect ratio, edge density, area). Returns pothole confidence score.

- **Three-sensor fusion** — `backend/models/fusion.py` combines all signals with weighted confidence: accelerometer 50–65%, audio 25–40%, camera 25–35% depending on which fired. When all three agree → 1.3× confidence boost. When they disagree → majority vote. A single weak signal alone will not trigger a confirmed hazard.

- **Speed gate (two layers)** — frontend freezes jolt display at 0 when GPS speed < 5 km/h. Backend independently rejects the entire report if `speed_kmh < 5` before running any model. Audio and camera also blocked server-side below 5 km/h.

- **Hazard clustering** — reports within 50 m of each other merge into one cluster. A hazard is only marked "confirmed" after ≥ 2 independent reports. Severity is the rolling 90th percentile of jolt readings in the cluster.

- **Live WebSocket dashboard** — FastAPI broadcasts hazard list + weather + stats to all connected browser tabs every 5 seconds. Map pins (Mapbox GL JS) update in real-time without page refresh.

- **Driver mode proximity banner** — every 3 s the driver's phone fetches all hazards within 300 m. The highest-severity hazard triggers a banner with distance and recommended speed limit.

- **Voice alerts (Meta Ray-Ban glasses compatible)** — `window.speechSynthesis` announces through phone speaker or Bluetooth glasses speakers:
  - Detection confirmed: *"Pothole detected. Hazard recorded."* (5 s cooldown)
  - New hazard enters 300 m: *"Pothole ahead, X metres. Slow to Y km/h."*
  - Distance countdown: at 200 m → 100 m → 50 m (each announced once per hazard)
  - Still speeding near hazard: *"Too fast. Slow down to Y km/h."* (8 s cooldown)

- **Government portal** — live hazard list sorted by severity, district breakdown table, flag "Send to BASt", "Mark Resolved" removal, CSV export, Clear All Data button.

- **Auto-escalation** — background task runs every hour; any confirmed hazard unresolved after 48 h gets severity +1 (max 10) and is tagged "Escalated" in the portal.

- **DWD weather integration** — real HTTP call to BrightSky API (Deutsche Wetterdienst open data). Weather fetched every 60 s. `road_multiplier` boosts detected severity: rain +20%, heavy rain +35%, snow +40%.

- **Reverse geocoding** — async background call to OpenStreetMap Nominatim on every newly confirmed hazard. Road name and full address stored and shown in the portal.

- **SQLite persistence** — all confirmed hazards survive backend restarts. `DB_PATH` env var supports Render persistent disk in production.

- **Deployed on Render (free tier)** — single Docker container builds Python backend + React frontend. One public HTTPS URL serves both web dashboard and mobile `/drive` page from any network.

---

## 3. What is mocked, stubbed, or hardcoded

| What is faked | Where (file) | Why | What the real version would do |
|--------------|-------------|-----|-------------------------------|
| **Detection uses rule-based thresholds, not a trained ML model** | `road-sentinel-hk/backend/models/accelerometer.py`, `sound.py`, `vision.py` | Training a labelled pothole dataset was out of scope for a weekend hackathon | Production would use a CNN on labelled dashcam footage + supervised classifier on labelled IMU recordings |
| **Confidence scores are formula-derived** | `road-sentinel-hk/backend/models/fusion.py` | No ground-truth labels available to calibrate against | Real confidence would come from a trained classifier's softmax output |
| **German district detection uses hardcoded lat/lng bounding boxes** | `road-sentinel-hk/backend/services/clustering.py` | Shapefile/PostGIS integration was out of scope | Point-in-polygon lookup against official German Kreise boundary files |
| **Typhoon mode polls HKO (Hong Kong Observatory)** — not a German API | `road-sentinel-hk/backend/services/typhoon.py` | Project started as a Hong Kong prototype; DWD has no equivalent real-time storm-signal endpoint | DWD CAP (Common Alerting Protocol) severe weather warnings for Germany |
| **Berlin fallback coordinates when GPS unavailable** | `road-sentinel-hk/backend/main.py` | Prevents null GPS crashing the pipeline | Require GPS lock before accepting any report |
| **Hardware sensor (Adrian's device) not yet connected to the web app** | `main.m5f2` | Hardware–software integration not completed during hackathon | Device would POST directly to `/report` endpoint with GPS + jolt data, bypassing the phone entirely |

---

## 4. External APIs, services & data sources

| Service / API | Used for | Real or mocked? | Auth |
|--------------|---------|----------------|------|
| **BrightSky / DWD** `api.brightsky.dev` | Current weather + road severity multiplier | ✅ Real HTTP call every 60 s | None — public open API |
| **OpenStreetMap Nominatim** `nominatim.openstreetmap.org` | Reverse geocoding GPS → road name | ✅ Real HTTP call per new hazard | None — public, rate-limited 1 req/s |
| **HKO Warning Summary** `data.weather.gov.hk` | Typhoon signal level (T1/T3/T8/T10) | ✅ Real HTTP call every 10 min | None — public open API |
| **Mapbox GL JS** | Interactive map tiles, hazard pin rendering | ✅ Real API | Restricted API token |
| **Browser Geolocation API** | Driver GPS position and speed | ✅ Real device sensor | User permission prompt |
| **DeviceMotionEvent API** | Accelerometer x/y/z + linear acceleration | ✅ Real device sensor | User permission prompt (iOS 13+) |
| **Web Audio API** | Live microphone stream analysis | ✅ Real device sensor | User permission prompt |
| **MediaDevices.getUserMedia** | Rear camera frame capture | ✅ Real device sensor | User permission prompt |
| **Web Speech API — speechSynthesis** | Voice alerts through phone / Bluetooth glasses | ✅ Real browser API | None |

---

## 5. Pre-existing code

| Item | Source | How much | License |
|------|--------|----------|---------|
| Vite + React project scaffold | `npm create vite@latest` standard template | ~5 files, ~50 lines | MIT |
| FastAPI application skeleton | Standard FastAPI quickstart docs | ~10 lines | MIT |

All feature code — sensor fusion models, OpenCV vision pipeline, WebSocket layer, driver mode, government portal, clustering service, database layer, voice alerts, Docker config — was written **during the hackathon window**.

**AI-assistance disclosure:** The web app codebase was built with Claude (Anthropic) as an AI pair-programmer. Every feature, architecture decision, and design choice was directed, reviewed, and tested by Farhan Ghulam. Claude generated code on request; the human developer drove all product decisions and validated every feature against real hardware (phone sensors, Bluetooth glasses).

---

## 6. Known limitations & next steps

- **Hardware sensor not yet connected** — Adrian's physical detection device detects and stores locally but does not yet upload to the web app. Connecting it to `/report` with GPS data is the highest priority next step.
- **No trained ML model** — rule-based thresholds work but a CNN on labelled dashcam data would significantly reduce false positives.
- **Single phone = single reporter** — fleet mode (multiple simultaneous drivers feeding one dashboard) requires a proper auth layer and per-device session tracking.
- **GPS indoors is noisy** — 5 km/h speed gate prevents most false detections but GPS position can drift 10–30 m indoors, slightly misplacing confirmed hazards.
- **Audio sensitive to car environment** — loud music or engine noise can match the pothole audio signature. The accelerometer cross-check greatly reduces this but does not eliminate it.
- **Camera vision is daylight-only** — adaptive thresholding relies on contrast; nighttime/tunnel detection needs separate threshold tuning.
- **SQLite is single-writer** — fine for a demo; production multi-region deployment needs PostgreSQL.
- **No user authentication** — government portal is publicly accessible; production needs auth before "Send to BASt" or "Resolve" actions.

---

*RoadSense — real-time AI pothole detection and road hazard reporting.*
*Built at EuroTech Hackathon, June 2026.*
