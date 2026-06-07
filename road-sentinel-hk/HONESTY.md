# HONESTY.md

> Mandatory disclosure for the hackathon judges.
> Disclosed shortcuts are **not** penalised — hidden ones are.

---

## 1. Team — who did what

| Member | GitHub handle | Main contributions |
|--------|--------------|-------------------|
| Farhan Ghulam | @farhanghulam | Full-stack development, sensor integration, deployment, demo |
|  |  |  |
|  |  |  |

---

## 2. What is fully working

Features that run end-to-end on the live app with real data and real logic:

- **Accelerometer pothole detection** — phone reads `DeviceMotionEvent`, computes linear jolt magnitude (√lx²+ly²+lz²), triggers when ≥ 2.0 m/s² and vehicle speed ≥ 5 km/h. No detection when stationary.
- **Microphone audio analysis** — browser `AudioContext` + `AnalyserNode` extracts RMS, zero-crossing rate, spectral centroid, peak dB, and low/high frequency band energies from the live microphone stream every frame.
- **Camera visual detection** — OpenCV (backend) runs adaptive thresholding + Canny edge detection + contour circularity analysis on each JPEG frame to find dark oval patches on the road surface.
- **Sensor fusion** — weighted combination of all three signals; accelerometer 50–65%, audio 25–40%, camera 25–35% depending on which sensors fired. Majority vote when all three disagree.
- **Speed gate** — all three sensor paths blocked server-side when `speed_kmh < 5`. Frontend also freezes jolt display to 0.
- **Live WebSocket dashboard** — server broadcasts hazard list + weather + stats every 5 seconds to all connected browser tabs. Map pins update in real-time.
- **Driver Mode voice alerts** — Web Speech API speaks through phone speaker or Bluetooth glasses. Distance countdown at 300m → 200m → 100m → 50m. Speed warning if still too fast near a hazard. 5-second cooldown on detection alerts to prevent spam.
- **Government portal** — live hazard list sorted by severity, district breakdown table, "Send to BASt" flag, "Mark Resolved" removal, CSV export, Clear All Data.
- **Auto-escalation** — background loop runs every hour; any unresolved hazard older than 48 h gets severity +1 (max 10). Tagged "Escalated" in the portal.
- **DWD weather integration** — real HTTP call to BrightSky API (Deutsche Wetterdienst wrapper); `road_multiplier` boosts detected severity in rain/snow conditions.
- **Reverse geocoding** — real HTTP call to OpenStreetMap Nominatim; newly confirmed hazards are enriched with road name and full address asynchronously.
- **SQLite persistence** — hazards survive backend restarts; `DB_PATH` env var supports Render persistent disk.
- **Deployed on Render** — Docker single-container (Python + Node.js build); one public URL serves both the web dashboard and the mobile driver page from any network.
- **Meta Ray-Ban glasses integration** — `/drive` page opened in the glasses phone companion browser; voice alerts play through Bluetooth glasses speakers automatically.

---

## 3. What is mocked, stubbed, or hardcoded

| What is faked | Where | Why we mocked it | What the real version would do |
|--------------|-------|-----------------|-------------------------------|
| **No trained ML model** — detection is rule-based thresholds and classical CV | `backend/models/accelerometer.py`, `sound.py`, `vision.py` | Training a labelled pothole dataset was out of scope for a hackathon weekend | A production system would train a CNN on labelled dashcam footage and a supervised audio classifier on impact recordings |
| **Confidence scores are formula-derived** — not from a calibrated classifier | `backend/models/fusion.py` | No ground-truth labels available | Real confidence would come from a trained classifier's softmax output |
| **District detection uses hardcoded bounding boxes** — not real administrative boundaries | `backend/services/clustering.py` | Shapefile/PostGIS integration was out of scope | Would use a proper geometry lookup against official German Kreise boundaries |
| **Typhoon mode uses HKO API (Hong Kong)** — app is deployed/branded for Germany | `backend/services/typhoon.py` | The project started as a Hong Kong prototype and typhoon mode was added locally; DWD does not have an equivalent real-time storm-signal API | Would integrate DWD severe-weather warnings for Germany |

---

## 4. External APIs, services & data sources

| Service / API | Used for | Real call or mocked? | Auth |
|--------------|---------|---------------------|------|
| **BrightSky / DWD** (`api.brightsky.dev`) | Current weather at driver location; road severity multiplier | ✅ Real HTTP call | None (public API) |
| **OpenStreetMap Nominatim** (`nominatim.openstreetmap.org`) | Reverse geocoding — road name from GPS coordinates | ✅ Real HTTP call | None (public API, rate-limited) |
| **HKO Warning Summary API** (`data.weather.gov.hk`) | Typhoon signal level for threshold override | ✅ Real HTTP call | None (public API) |
| **Mapbox GL JS** | Interactive map tiles, hazard pin rendering | ✅ Real call | API token (restricted to our domain) |
| **Browser Geolocation API** | Driver GPS position and speed | ✅ Real device sensor | User permission required |
| **DeviceMotionEvent API** | Accelerometer readings (linear + gravity) | ✅ Real device sensor | User permission required (iOS 13+) |
| **Web Audio API** | Microphone stream analysis | ✅ Real device sensor | User permission required |
| **MediaDevices / getUserMedia** | Rear camera frame capture | ✅ Real device sensor | User permission required |
| **Web Speech API** (`speechSynthesis`) | Voice alerts through glasses speakers | ✅ Real browser API | None |

---

## 5. Pre-existing code

| Item | Source | Roughly how much | License |
|------|--------|-----------------|---------|
| **Vite + React boilerplate** | `npm create vite@latest` (standard template) | ~5 files, ~50 lines | MIT |
| **FastAPI project skeleton** | Standard FastAPI docs quickstart pattern | ~10 lines | MIT |

All feature code (sensor fusion, detection models, dashboard, driver mode, government portal, WebSocket layer, deployment config) was written during the hackathon window.

**AI assistance disclosure:** Development was assisted by Claude (Anthropic) as a coding pair-programmer throughout the hackathon. All architecture decisions, feature choices, and code were directed and reviewed by the team.

---

## 6. Known limitations & next steps

- **No trained ML model** — the biggest limitation. A CNN trained on real pothole footage would significantly reduce false positives and improve severity accuracy.
- **Single device, no fleet** — currently one phone = one driver. Real scalability requires a fleet management layer with multiple simultaneous reporters.
- **GPS accuracy indoors** — GPS noise can cause minor position drift when the phone is inside a building. The 5 km/h speed gate mitigates false detections but not position errors.
- **Audio false positives** — loud music or engine noise in the car could theoretically match the audio pothole signature. The speed gate and accelerometer cross-check reduce this but don't eliminate it.
- **Camera limited to daylight** — the OpenCV vision model relies on contrast and brightness; night driving detection would require tuned thresholds or IR input.
- **SQLite not horizontally scalable** — fine for a hackathon demo, would need PostgreSQL for multi-region production.
- **Typhoon mode is HKO-specific** — needs replacing with DWD severe weather alerts for a Germany production deployment.

---

*RoadSense — AI-powered pothole detection and road hazard reporting.*
*Built at EuroTech Hackathon 2026.*
