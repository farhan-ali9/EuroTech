# 🛞 BumpLess

**Detect road defects and their severity from a phone's accelerometer, warn drivers
about defects ahead, and give the government a live map to fix them.**

BumpLess turns any phone mounted in a car into a road-quality sensor. As you drive,
it detects bumps/potholes from the accelerometer, scores each one **1–5**, and logs
it. Other drivers get warned as they approach a known defect; a government dashboard
shows every defect on a map, ranked by severity and how many times it's been reported.

---

## How it works — edge detection, central aggregation

```
  📱 Driver phone (per-driver, real-time)            🖥️ Backend (shared source of truth)
  ┌─────────────────────────────────────┐           ┌───────────────────────────────────┐
  │ • GPS + accelerometer (device APIs)  │  POST     │ • cluster reports within 50 m       │
  │ • detect bump → severity 1–5         │ ───────▶  │ • report_count++, severity = max    │
  │ • proximity warning (local haversine)│ /report   │ • persist to Postgres               │
  │ • START button, bars + countdown     │ ◀───────  │ • reverse-geocode road name         │
  └─────────────────────────────────────┘  /hazards  └───────────────────────────────────┘
                                                                    │
                                            🏛️ Government map ◀──────┘  GET /hazards (poll)
```

Detection runs **on the phone** (the accelerometer is ~60 Hz there) — only a small
`{lat, lng, severity}` is sent per bump. The backend's job is to merge reports from
many drivers, persist them, and serve the map. **No raw accelerometer data leaves the phone.**

---

## Repo layout

```
road-sentinel-hk/
├── docker-compose.yml      # Postgres (the only container)
├── backend/                # FastAPI + uv  — aggregation, persistence, API
│   ├── main.py             #   /report, /hazards, /hazards/nearby, /health
│   ├── services/clustering.py
│   ├── database.py         #   Postgres via psycopg
│   └── pyproject.toml
└── frontend/               # React + Vite (HTTPS) — driver app + gov map
    └── src/
        ├── pages/DriverMode.jsx        # "/"    mobile driver view
        ├── pages/GovernmentPortal.jsx  # "/gov" government map
        ├── services/detector.js        # jolt → severity 1–5
        └── services/accelSource.js     # pluggable accelerometer source
```

---

## Prerequisites

- [**uv**](https://docs.astral.sh/uv/) (Python toolchain — installs its own Python 3.12)
- **Node** 18+ and npm
- **Docker** (for the Postgres container)
- A **Mapbox public token** (`pk....`) — free at https://account.mapbox.com/access-tokens/

Put the token in `frontend/.env`:

```bash
cp frontend/.env.example frontend/.env
# then edit frontend/.env and set VITE_MAPBOX_TOKEN=pk....
```

---

## Run it locally

```bash
cd road-sentinel-hk

# 1. Database
docker compose up -d                       # Postgres on :5432

# 2. Backend  (terminal A)
cd backend
uv sync                                     # first time only
uv run uvicorn main:app --host 0.0.0.0 --port 8000

# 3. Frontend (terminal B)
cd frontend
npm install                                 # first time only
npm run dev                                 # HTTPS dev server on :3000
```

Open **https://localhost:3000** → Driver view. **https://localhost:3000/gov** → Government map.
(API calls are proxied to the backend by Vite, so there's no backend URL to configure.)

---

## 📱 Connect from your phone (the demo)

Phone sensors (motion + GPS) **only work over HTTPS**, so you can't use a plain
`http://<ip>` link. Two ways:

**Option A — same Wi-Fi (quickest):**
1. Find your laptop's LAN IP (the `Network:` line Vite prints, e.g. `192.168.x.x`).
2. On the phone open **`https://<that-ip>:3000`** (type `https://` explicitly).
3. You'll see *"This Connection Is Not Secure"* (the dev server's self-signed cert) → tap **Continue / Visit**.
4. Tap **START** and allow the motion + location prompts.

**Option B — a trusted HTTPS tunnel (no cert warning, works off Wi-Fi):**
```bash
cd frontend
npm run tunnel        # needs cloudflared installed
```
Open the printed `https://<random>.trycloudflare.com` on the phone → **START**.

> iOS is strict about self-signed certs — if Option A misbehaves, use Option B.

---

## Swapping the accelerometer source

The detector reads from an **AccelSource** (`frontend/src/services/accelSource.js`),
so the hardware is pluggable:

- **`phone`** (default) — the device's built-in IMU.
- **`external`** — placeholder for an external sensor (e.g. an **ESP32** over BLE / a
  local WebSocket) that emits the same `{x, y, z, lx, ly, lz}` reading shape.

Switch with an env var in `frontend/.env`:
```
VITE_ACCEL_SOURCE=phone        # or: external
```

Because `POST /report` just takes `{lat, lng, severity}`, a Wi-Fi sensor (ESP32) can
also detect bumps itself and **report directly to the backend**, bypassing the phone.

---

## API

| Method | Endpoint              | Purpose                                            |
|--------|-----------------------|----------------------------------------------------|
| POST   | `/report`             | Log a defect — body `{lat, lng, severity}` (1–5)   |
| GET    | `/hazards`            | All defects (government map)                        |
| GET    | `/hazards/nearby`     | Defects near a point — `?lat&lng&radius` (driver)   |
| GET    | `/health`             | Health check                                       |

Interactive docs at http://localhost:8000/docs.

### Seed / test without a phone
```bash
# Log a severe defect in central Hong Kong
curl -k -X POST https://localhost:3000/report \
  -H "Content-Type: application/json" \
  -d '{"lat":22.3193,"lng":114.1694,"severity":5}'

# A second report within 50 m merges into it (report_count++, severity = max)
curl -s http://localhost:8000/hazards | python3 -m json.tool
```

Defects persist in Postgres across restarts. To wipe them:
```bash
docker compose exec db psql -U bumpless -d bumpless -c "TRUNCATE defects;"
```

---

## Bump detection

**Demo (current code).** Severity is derived from a single value — the **absolute
strength of the acceleration the phone feels**, i.e. the magnitude of the
gravity-removed acceleration vector:

```
|a| = sqrt(lx² + ly² + lz²)     # lx, ly, lz from DeviceMotionEvent.acceleration
```

A bump fires when `|a|` exceeds a small threshold (with a short debounce so one
pothole = one event), and `|a|` is bucketed into severity 1–5. There is **no speed
gate and no axis isolation**, so you can test it just by shaking the phone. This is
deliberately trivial — see `frontend/src/services/detector.js`.

**How it should work (production).** Raw magnitude alone is not enough:
- **Speed gate** — ignore readings under ~8 km/h so handling the phone while parked or walking doesn't register.
- **Isolate the vertical axis** — use the gyroscope/orientation to project acceleration onto the road-normal (vertical) axis, so braking and cornering (horizontal forces) aren't mistaken for road defects.
- **Windowed peak** — a pothole is a sub-100 ms spike; sample at ~100 Hz on-device and take the peak over a short sliding window instead of one instantaneous reading.
- **Per-vehicle / per-mount calibration** — normalize thresholds for suspension stiffness and phone mounting so a "4" means the same in every car.
- **Corroboration** — only treat a location as a real defect once several independent vehicles report a spike there (filters one-off noise like a dropped phone or a single speed bump).

---

## Roadmap

### Known limitations
- **No "mark as fixed / resolved" flow** — defects persist indefinitely; the
  government can see them but cannot close them.
- **Proximity warns within a radius, not strictly "ahead"** — there is no heading,
  so it can warn about a defect that is actually behind you.

### Product next steps (to make it practical)
1. **Auto-resolve by silence, not a button.** A defect should clear itself when
   vehicles stop reporting bumps at that location — a repaired road simply stops
   generating reports, so the defect decays off the map after a quiet window.
   Resolution is **inferred from the absence of new reports**, not a manual
   "mark fixed" control on the dashboard.
2. **Direction-aware warnings.** Use GPS heading to warn only about defects ahead
   on your path (ideally matched to your road, not a parallel one), so you're never
   alerted for something behind you or on the opposite carriageway.
3. **Severity calibration & per-vehicle normalization.** Tune the jolt→severity
   thresholds against real, ground-truthed potholes, and normalize for vehicle
   suspension and phone-mount differences so a "4" means the same in every car.
   (Detection currently uses total 3-D jolt magnitude, so hard braking/cornering
   can also register — calibration should isolate the vertical component.)
4. **Multi-vehicle corroboration before surfacing.** Only show/escalate a defect
   once several independent vehicles hit the same spot, filtering one-off noise
   (a dropped phone, a single speed bump).
5. **Hands-free driver alerts.** Spoken/audio warnings and background operation so
   the driver isn't watching (or keeping awake) the screen.

