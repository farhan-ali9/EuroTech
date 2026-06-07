# HONESTY.md

> Mandatory disclosure for the hackathon judges. This file lives at the repo root and
> is cross-checked against the code and the demo video.
> Disclosed shortcuts are **not** penalised — hidden ones are.

---

## 1. Team — who did what

Readable role overview (not a per-commit breakdown).

| Member | GitHub handle | Main contributions |
|---|---|---|
| Farhan Ali | @farhan-ali9 (also committed as `unknown` / farhanghulam09876@gmail.com) | Created the **first version** of BumpLess and worked across the stack — FastAPI backend, React driver app & government dashboard, sensor integration, and the defect reporting/clustering API. |
| Aleksandr Gorbunov | git: `Aleksandr Gorbunov <aleksandr.gorbunov@outlook.de>` | Backend & frontend work — the orientation-independent accelerometer detection engine, the driver & government views, backend aggregation/clustering & Postgres persistence, direction-aware proximity warnings, and the live VPS deployment (bump-less.club). |
| Adrian | @adrks10 | Hardware sensor — M5Stack AtomS3R accelerometer firmware (separate branch; **not yet wired to the backend**). |
| Marie-Louise | *(no commits — non-code)* | Presentation & visuals — demo video, editing, slides. |

> Note for the shortlog cross-check: Farhan's commits appear under **two** git identities
> (`farhan-ali9` and a misconfigured `unknown <farhanghulam09876@gmail.com>`) — same person.
> Marie-Louise's work was non-code, so she has no commits.

---

## 2. What is fully working

Runs end-to-end on the live app (https://bump-less.club) with real device sensors and real logic.

- **On-phone bump detection** — reads `DeviceMotionEvent`, recovers the gravity vector and
  projects acceleration onto it, so detection is the **vertical jolt regardless of phone
  orientation** (flat, upright, tilted); horizontal forces like braking/cornering are
  rejected. Scored into severity **1–5**, debounced (one bump = one event).
- **Road-tested in a car** — in a live in-car test while driving, real road bumps were
  detected and scored. (Detection was the part validated on the road; see §6 for what is
  *not* yet calibrated.)
- **Real GPS tagging** — each detected defect is tagged with the phone's live GPS position.
- **Direction-aware proximity warnings** — the driver is warned only about defects *ahead*
  of them, using compass + GPS heading (80° cone), within 150 m, with a metres countdown.
- **Crowd clustering + persistence** — `POST /report` merges reports within 50 m into one
  defect (`report_count++`, `severity = max`), stored in Postgres (survives restarts).
- **Reverse geocoding** — road name auto-filled from GPS via OpenStreetMap Nominatim.
- **Government map** — live Mapbox map of all defects coloured by severity, Hong Kong /
  Munich region selector, live polling, detail popups.
- **Deployed** — Docker Compose (FastAPI + Postgres + Caddy) on one VPS, real Let's Encrypt
  HTTPS at bump-less.club.

---

## 3. What is mocked, stubbed, or hardcoded

| What is faked | Where | Why | What the real version would do |
|---|---|---|---|
| **Demo seed defects** (12 Hong Kong + 1 Munich) | `backend/seed.py` | So the government map isn't empty in the demo | All markers come from real crowd reports; no seeding |
| **Rule-based severity (not ML)** | `frontend/src/services/detector.js` | No labelled IMU dataset in the hackathon window | Train a classifier on labelled accelerometer recordings |
| **Hardcoded, single-device thresholds** (floor 0.25 g; level 5 at 1.0 g, tuned sensitive for the demo) | `detector.js` | Calibrated by hand on one phone | Per-vehicle / per-mount calibration on first use |
| **`external` accelerometer source is a stub** | `frontend/src/services/accelSource.js` | Only the phone IMU is wired up; the external-sensor path isn't implemented | Receive readings from an external/hardware sensor |
| **Government "resolve" + double-click "add defect"** | `frontend/src/components/Map.jsx` | Demo/debug controls to manipulate the map during the pitch | A real maintenance workflow / auto-resolve by silence |

---

## 4. External APIs, services & data sources

| Service / API | Used for | Real or mocked? | Auth |
|---|---|---|---|
| **Mapbox GL JS** | Map rendering + defect pins | ✅ Real | Public token (`pk.…`) |
| **Browser Geolocation API** | Driver GPS position & speed | ✅ Real device sensor | User permission |
| **DeviceMotionEvent API** | Accelerometer for bump detection | ✅ Real device sensor | User permission (iOS 13+) |
| **DeviceOrientationEvent API** | Compass heading for direction-aware warnings | ✅ Real device sensor | User permission (iOS 13+) |
| **OpenStreetMap Nominatim** | Reverse geocoding GPS → road name | ✅ Real HTTP call | None (rate-limited, User-Agent) |
| **Caddy + Let's Encrypt** | Automatic TLS for bump-less.club | ✅ Real | ACME (automatic) |

---

## 5. Pre-existing code

| Item | Source | Roughly how much | License |
|---|---|---|---|
| Vite + React scaffold | `npm create vite@latest` | ~5 boilerplate files | MIT |
| FastAPI app skeleton | FastAPI quickstart | ~10 lines | MIT |

All feature code was written during the hackathon window — including Farhan's first version,
which was also built during the event (no pre-existing project code was brought in).

**AI assistance:** parts of the app were built with Claude (Anthropic) as an AI
pair-programmer. Architecture, product decisions, and the in-car testing were done by the
human team.

---

## 6. Known limitations & next steps

- **No speed gate** — detection is magnitude-only, so a hard shake while stationary can
  register. A speed gate (ignore < ~8 km/h) is the next step.
- **Single-device calibration** — thresholds were tuned on one phone/mount; real severity
  varies by vehicle, mount, and phone, so absolute severity isn't yet comparable across cars.
- **No multi-vehicle corroboration** — a single report creates a defect (no filtering of one-off noise yet).
- **Map is pre-seeded with demo data** (Hong Kong + Munich) so it isn't empty during the pitch.
- **No authentication** — anyone with the dashboard URL can resolve or add defects.
- **No auto-resolve** — a repaired road's marker stays until manually resolved; the planned
  approach is to decay defects once vehicles stop reporting them.
- **Hardware sensor not integrated** — Adrian's M5Stack firmware detects on-device but has no
  upload path to the backend yet (it lives on a separate branch).
- **Device support** — detection needs the device to report gravity-removed acceleration
  (works on iPhone; some older Androids don't provide it).

---

*BumpLess — real-time road-defect detection and reporting. Built at the EuroTech Hackathon, June 2026.*
