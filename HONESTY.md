# HONESTY.md

> Mandatory disclosure for the hackathon judges.
> Disclosed shortcuts are **not** penalised — hidden ones are.

---

## 1. Team — who did what

| Member | GitHub handle | Main contributions |
|--------|--------------|-------------------|
| Farhan Ghulam | @farhan-ali9 | Full-stack web app — FastAPI backend, React frontend, sensor integration, driver mode, government portal, voice alerts, fleet mode, Docker deployment |
| Aleksandr Gorbunov | @AleksandrGorbunov *(aleksandr.gorbunov@outlook.de)* | Backend architecture, accelerometer detection engine, direction-aware proximity warnings, Postgres persistence, VPS deployment (bump-less.club), repo structure |
| Adrian | @adrks10 | Hardware sensor firmware — physical bump-detection device (detects and stores locally; upload path to backend not yet integrated) |

---

## 2. What is fully working

- **Accelerometer bump detection** — phone reads DeviceMotionEvent, isolates vertical jolt along gravity vector (orientation-independent), scores severity 1–5
- **Speed gate** — detection blocked below ~5 km/h; stationary phone-shaking produces no detections
- **Direction-aware proximity warnings** — driver warned only about defects *ahead* of them (compass + GPS heading, 80° cone, 150 m range)
- **Fleet mode** — multiple drivers report simultaneously; each phone has a unique device ID stored in localStorage
- **GPS hazard clustering** — reports within 50 m merge into one cluster; severity = max of all reports; report count tracked
- **Government map** — live Mapbox map of all defects, colored by severity, with resolve button and region selector
- **Reverse geocoding** — road name auto-filled via OpenStreetMap Nominatim on new confirmed hazards
- **Postgres persistence** — all hazards survive backend restarts
- **Deployed on VPS** — Docker Compose (FastAPI + Postgres + Caddy) at **bump-less.club** with auto-managed Let's Encrypt TLS

---

## 3. What is mocked, stubbed, or hardcoded

| What | Where | Why | Real version |
|------|-------|-----|--------------|
| **Rule-based severity, not ML** | `frontend/src/services/detector.js` | No labelled IMU dataset available in hackathon timeframe | Train a classifier on labelled accelerometer recordings |
| **Hardcoded severity thresholds** | `detector.js` — floor 0.25g; severity 5 at 1.0g | Calibrated manually on one phone; real thresholds vary by phone, mount, car | Per-device calibration run on first use |
| **Berlin/Munich fallback coords** | `backend/main.py` | Prevents null GPS crashing the pipeline | Require GPS lock before accepting any report |
| **Hardware sensor not yet uploading** | Adrian's firmware | BLE/WiFi upload path not completed in hackathon window | Device POSTs `{lat, lng, severity}` directly to `/report` |

---

## 4. External APIs and services

| Service | Used for | Real? | Auth |
|---------|---------|-------|------|
| **Mapbox GL JS** | Interactive map, defect pins | ✅ Real | Restricted token |
| **Browser Geolocation API** | Driver GPS position and speed | ✅ Real device sensor | User permission |
| **DeviceMotionEvent API** | Accelerometer for bump detection | ✅ Real device sensor | User permission (iOS 13+) |
| **Web Speech API** | Voice alerts | ✅ Real browser API | None |
| **OpenStreetMap Nominatim** | Reverse geocoding GPS → road name | ✅ Real HTTP call | None (rate-limited) |
| **Caddy** | Auto TLS (Let's Encrypt) for bump-less.club | ✅ Real | None |

---

## 5. Pre-existing code

| Item | Source | Amount |
|------|--------|--------|
| Vite + React scaffold | `npm create vite@latest` | ~5 files boilerplate |
| FastAPI app skeleton | FastAPI quickstart docs | ~10 lines |

All feature code was written during the hackathon window.

**AI-assistance:** Parts of the web app were built with Claude (Anthropic) as an AI pair-programmer. All architecture, product decisions, and testing were done by the human team members.

---

## 6. Known limitations

- Single severity model — thresholds calibrated on one phone/mount; accuracy varies by hardware
- No authentication on government portal — anyone with the URL can resolve defects
- Hardware sensor not yet integrated — Adrian's device stores locally only
- SQLite was used initially; production now uses Postgres

---

*BumpLess — real-time road defect detection and reporting.*
*Built at EuroTech Hackathon, June 2026.*
