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

In plain terms: **the core is real.** The app detects genuine bumps from a real phone's motion
sensor while driving, and each one becomes a real report on the map. None of the shortcuts below
fake that — they are either conveniences for the live demo or pieces we plan to build next.

| What | Where | Why | What the full version would do |
|---|---|---|---|
| **Extra sample pins on the map** (12 in Hong Kong, 1 in Munich) | `backend/seed.py` | The app *does* create real defects from real driving — these few points are added only so the government map looks populated in a short demo, **not** because we can't produce real data | The map fills up on its own from real drivers; no pre-loaded points |
| **Severity is a simple rule — no AI/ML yet** | `frontend/src/services/detector.js` | We use a clear, honest physical rule (a bigger jolt = a higher severity); it works today. We didn't have a labelled dataset to train a model during the hackathon | **Future work:** a model trained on many real, labelled bump recordings |
| **Severity levels tuned by hand on one phone** | `detector.js` | The 1–5 cut-offs were set by testing on a single phone (and turned up so bumps trigger easily in the demo) | **Future work:** auto-calibrate to each car and phone mount, so a "4" means the same in every vehicle |
| **Slot for an external sensor not wired up** | `frontend/src/services/accelSource.js` | Detection currently runs only on the phone's own sensor; the connector for a separate in-car device is a placeholder | Accept live data from a dedicated hardware sensor through the same connector |
| **Dashboard "resolve" and double-click "add" buttons** | `frontend/src/components/Map.jsx` | Demo controls so we can add or clear a defect live during the pitch | A real repair workflow — and defects clearing themselves once cars stop reporting them |

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

None — all code was written during the hackathon window (Farhan's first version was built during
the event too). The only boilerplate is the standard `npm create vite` (React) and FastAPI
starter scaffolding.

**AI assistance:** parts of the app were built with Claude (Anthropic) as an AI pair-programmer;
the architecture, product decisions, and in-car testing were done by the team.

**Scope decision — no sound or video analysis:** The original brief mentioned these as
additional signal sources. We focused on the accelerometer + GPS path because it is
hardware-agnostic (works on any phone, no camera or microphone permission), latency-free,
and was fully validated on the road during the hackathon. Sound/video classification would
require a labelled dataset we did not have.

---

## 6. Known limitations & next steps

Where we'd take BumpLess next (with an honest note on today's state):

- **Speed-aware detection** — detection is currently magnitude-only; next we add a speed gate
  (ignore below ~8 km/h) so a hard shake while parked doesn't register.
- **Per-vehicle calibration** — thresholds are tuned on one phone today; next we auto-calibrate
  per car, mount, and phone so a severity "4" means the same in every vehicle.
- **Multi-vehicle corroboration** — today a single report creates a defect; next we confirm a
  spot only after several independent vehicles report it, filtering one-off noise.
- **Crowd-filled map** — the demo map is pre-seeded (Hong Kong + Munich) so it isn't empty during
  the pitch; in production it fills from real driver reports.
- **Dashboard access control** — the government dashboard is open today; next we add authentication
  so only authorised staff can resolve or add defects.
- **Auto-resolve** — repaired roads are cleared by hand today; next, defects fade out automatically
  once vehicles stop reporting them.
- **Hardware-sensor integration** — Adrian's M5Stack sensor detects on-device today; next we wire
  its upload path into the backend (it currently lives on a separate branch).
- **Wider device support** — detection uses the phone's gravity-removed motion data (great on
  iPhone); next we add a fallback for older Android devices that don't provide it.

---

*BumpLess — real-time road-defect detection and reporting. Built at the EuroTech Hackathon, June 2026.*
