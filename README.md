# BumpLess

**Detect road defects and their severity from a phone's accelerometer, warn drivers
about defects ahead, and give the government a live map to fix them.**

BumpLess turns any phone mounted in a car into a road-quality sensor. As you drive,
it detects bumps/potholes from the accelerometer, scores each one **1–5**, and logs
it. Other drivers are warned as they approach a known defect (only ones *ahead* of
them); a government dashboard shows every defect on a map, ranked by severity and how
many times it's been reported.

**Live:** https://bump-less.club (driver) · https://bump-less.club/gov (dashboard)

---

## How it works — edge detection, central aggregation

```
  Driver phone (per-driver, real-time)               Backend (shared source of truth)
  ┌─────────────────────────────────────┐           ┌───────────────────────────────────┐
  │ • GPS + accelerometer (device APIs)  │  POST     │ • cluster reports within 50 m       │
  │ • detect bump → severity 1–5         │ ───────▶  │ • report_count++, severity = max    │
  │ • proximity warning (local haversine)│ /report   │ • persist to Postgres               │
  │ • ahead-only (compass / GPS heading) │ ◀───────  │ • reverse-geocode road name         │
  └─────────────────────────────────────┘  /hazards  └───────────────────────────────────┘
                                                                    │
                                            Government map ◀─────────┘  GET /hazards (poll)
```

Detection runs **on the phone** (the accelerometer is ~60 Hz there) — only a small
`{lat, lng, severity}` is sent per bump. The backend merges reports from many drivers,
persists them, and serves the map. **No raw accelerometer data leaves the phone.**

---

## The two views

- **Driver (`/`)** — mobile, full-screen. Tap **START**; it logs defects you hit and
  warns about ones ahead with a colored signal fan + a metres countdown. Warnings are
  **direction-aware** (compass / GPS heading), so you're only alerted about defects in
  front of you, within 150 m.
- **Government (`/gov`)** — a Mapbox map of every defect, colored by severity, with a
  **Hong Kong / Munich** region selector. Hover a marker for details (severity, times
  reported, road name). Demo/debug helpers: **resolve** a defect from its popup, or
  **double-click the map** to add one.

---

## Repo layout

```
.
├── docker-compose.yml          # local dev: Postgres only
├── docker-compose.prod.yml     # prod: Postgres + backend + Caddy (auto-TLS)
├── deploy.sh · DEPLOY.md       # one-VPS deployment
├── HONESTY.md                  # hackathon disclosure
├── backend/                    # FastAPI + uv — aggregation, persistence, API
│   ├── main.py                 #   /report, /hazards, /hazards/nearby, DELETE, /health
│   ├── services/clustering.py
│   ├── database.py             #   Postgres via psycopg
│   ├── seed.py                 #   mock data (HK spread + Munich)
│   └── Dockerfile, pyproject.toml
└── frontend/                   # React + Vite (HTTPS) — driver app + gov map
    ├── Dockerfile, Caddyfile
    └── src/
        ├── pages/DriverMode.jsx        # "/"    mobile driver view
        ├── pages/GovernmentPortal.jsx  # "/gov" government map
        ├── components/Map.jsx          # Mapbox map
        ├── services/detector.js        # vertical jolt → severity 1–5
        ├── services/accelSource.js     # pluggable accelerometer source
        └── services/geo.js             # haversine + bearing (proximity/heading)
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
# 1. Database (run from the repo root)
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

Seed the demo data (optional):
```bash
cd backend && uv run python seed.py        # then restart the backend
```

---

## Connect from your phone (local dev)

Phone sensors (motion + GPS) **only work over HTTPS**, so you can't use a plain
`http://<ip>` link.

**Option A — same Wi-Fi:** open **`https://<your-laptop-LAN-ip>:3000`** (type `https://`
explicitly), accept the dev server's self-signed cert ("Not Secure → Continue"), then START.

**Option B — trusted HTTPS tunnel** (no warning, works off Wi-Fi):
```bash
cd frontend && npm run tunnel     # cloudflared → https://<random>.trycloudflare.com
```

> Or just use the live site at **https://bump-less.club** (real cert, nothing to set up).

---

## Deployment

One VPS, everything in Docker Compose (**Postgres + FastAPI + Caddy**). Caddy serves the
built frontend, proxies the API, and **auto-manages a Let's Encrypt cert** for
`bump-less.club`. Deploy from your machine:

```bash
./deploy.sh        # rsyncs the app to the VPS, then builds + restarts the stack
```

Full setup (DNS, firewall, first-run) is in **[DEPLOY.md](DEPLOY.md)**.

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
| GET    | `/hazards/nearby`     | Defects near a point — `?lat&lng&radius` (driver)  |
| DELETE | `/hazards/{id}`       | Resolve / remove a defect                          |
| GET    | `/health`             | Health check                                       |

Interactive docs at `/docs` (e.g. http://localhost:8000/docs).

### Seed / test without a phone
```bash
# Log a defect (clusters with others within 50 m: report_count++, severity = max)
curl -k -X POST https://localhost:3000/report \
  -H "Content-Type: application/json" \
  -d '{"lat":22.3193,"lng":114.1694,"severity":4}'

curl -s http://localhost:8000/hazards | python3 -m json.tool
```

Defects persist in Postgres across restarts. To wipe them:
```bash
docker compose exec db psql -U bumpless -d bumpless -c "TRUNCATE defects;"
```

---

## Bump detection

**Demo (current code).** Severity comes from the **vertical jolt — the motion
acceleration projected onto gravity ("down")** — which is orientation-independent
(works whether the phone is flat, upright, or tilted, and ignores horizontal forces
like braking/cornering):

```
gravity = accelerationIncludingGravity − acceleration     # both from DeviceMotionEvent
down    = | acceleration · gravity / |gravity| |          # m/s²
```

A bump fires when `down` exceeds a threshold (with a short debounce so one pothole =
one event), and it's bucketed into severity 1–5. There's still **no speed gate** or
corroboration. Deliberately simple — see `frontend/src/services/detector.js`.

Thresholds are tuned **sensitive for the demo** so bumps trigger easily (vertical jolt,
shown in **g**):

| Severity | Vertical jolt | Meaning |
|---|---|---|
| _ignored_ | < 0.25 g | gentle handling / vibration |
| 1 | 0.25–0.4 g | minor bump / rough patch |
| 2 | 0.4–0.55 g | noticeable bump / mild pothole |
| 3 | 0.55–0.75 g | moderate pothole |
| 4 | 0.75–1.0 g | bad, jarring pothole |
| 5 | ≥ 1.0 g | severe pothole / hard hit |

(For reference: a crash that fires airbags is ~15 g — well above level 5.)

**How it should work (production).** Beyond the current demo:
- **Speed gate** — ignore readings under ~8 km/h (phone handling while parked/walking).
- **Windowed peak** — a pothole is a sub-100 ms spike; sample ~100 Hz and take the peak.
- **Per-vehicle / per-mount calibration** — so a "4" means the same in every car.
- **Corroboration** — only treat a spot as a real defect after several independent vehicles report it.

---

## Roadmap

**Implemented:** accelerometer → severity, crowd clustering + persistence, driver
warnings (direction-aware), government map with region selector, manual resolve / add,
one-VPS deployment with auto-TLS.

**Known limitations**
- **No automatic resolution** — you can resolve a defect by hand, but it won't clear
  itself; a repaired road's marker stays until removed.
- **Demo-grade detection** — severity is raw `|a|` magnitude only (see above).

**Next steps to make it practical**
1. **Auto-resolve by silence** — a defect decays off the map once vehicles stop
   reporting bumps there (inferred from absence of reports, not a manual button).
2. **Severity calibration & per-vehicle normalization** — tune thresholds against real
   potholes and normalize for suspension/phone-mount differences.
3. **Multi-vehicle corroboration** before a defect is surfaced (filters one-off noise).
4. **Hands-free alerts** — spoken/audio warnings and background operation.

---

## Team

- **Farhan Ali** ([@farhan-ali9](https://github.com/farhan-ali9)) — created BumpLess and built the
  full-stack foundation: the FastAPI backend, the React driver app & government dashboard, and
  sensor integration.
- **Aleksandr Gorbunov** — the detection engine (orientation-independent accelerometer scoring),
  crowd aggregation & Postgres persistence, and the live deployment.
- **Adrian** ([@adrks10](https://github.com/adrks10)) — hardware: M5Stack accelerometer sensor firmware.
- **Marie-Louise** — product story: demo video, editing, and slides.

Built at the EuroTech Hackathon, June 2026.
