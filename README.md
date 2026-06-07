# RoadSense

**Real-time AI pothole detection and road hazard reporting for smarter city infrastructure.**

RoadSense turns any smartphone into a mobile road scanner. Drivers open the web app, tap once, and the phone's accelerometer, microphone, and camera begin detecting potholes in real time. Confirmed hazards appear instantly on a live dashboard visible to city officials — complete with GPS location, severity rating, weather context, and voice alerts through Meta Ray-Ban glasses or Bluetooth speakers.

Built at the **EuroTech Hackathon, June 2026**.

---

## Live Demo

| Interface | URL |
|-----------|-----|
| Dashboard | `[https://roadsense.onrender.com](https://eurotech-gv2a.onrender.com/)` |
| Driver Mode (mobile) | `https://eurotech-gv2a.onrender.com/drive` |
| Government Portal | `https://eurotech-gv2a.onrender.com/government` |

---

## Features

- **Three-sensor fusion** — accelerometer + microphone + camera signals combined with weighted confidence scoring
- **Speed gate** — detection blocked below 5 km/h, preventing false positives when stationary
- **Fleet mode** — multiple drivers report simultaneously; dashboard shows live active driver count
- **Voice alerts** — Web Speech API announces hazard distance and speed warnings through Bluetooth glasses or phone speaker
- **Distance countdown** — "Pothole in 200m … 100m … 50m" spoken once per hazard
- **Live WebSocket dashboard** — map pins and stats update every 5 seconds without page refresh
- **Government portal** — severity table, district breakdown, CSV export, BASt flag, auto-escalation after 48 h
- **Weather integration** — DWD (Deutsche Wetterdienst) live weather boosts severity in rain/snow
- **Reverse geocoding** — road name auto-filled via OpenStreetMap Nominatim
- **SQLite persistence** — hazards survive backend restarts; Render persistent disk in production
- **Docker deployment** — single container, one-command deploy on Render free tier

---

## Architecture

```
Phone (mobile browser)
  ├── DeviceMotionEvent  ──┐
  ├── Web Audio API      ──┼──► POST /report  ──► FastAPI backend
  └── Rear Camera        ──┘                       │
                                                   ├── AccelModel
                                                   ├── SoundModel
                                                   ├── VisionModel (OpenCV)
                                                   └── FusionModel
                                                         │
                                         ┌───────────────┴──────────────┐
                                         │      ClusteringService        │
                                         │  (50m radius, 90th-pct sev)  │
                                         └───────────────┬──────────────┘
                                                         │
                                          ┌──────────────┴──────────────┐
                                          │          SQLite DB           │
                                          └──────────────┬──────────────┘
                                                         │
                                             WebSocket broadcast (5s)
                                                         │
                                         ┌───────────────┴──────────────┐
                                         │      React Dashboard          │
                                         │  (Mapbox GL + live stats)    │
                                         └──────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11, FastAPI, Uvicorn, WebSockets |
| Detection | NumPy, SciPy, OpenCV (headless), scikit-learn |
| Frontend | React 18, Vite, Mapbox GL JS |
| Database | SQLite (via built-in `sqlite3`) |
| Weather | BrightSky API (DWD open data) |
| Geocoding | OpenStreetMap Nominatim |
| Deployment | Docker, Render (free tier) |
| Voice | Web Speech API (`speechSynthesis`) |
| Sensors | DeviceMotionEvent, Web Audio API, getUserMedia |

---

## Project Structure

```
EuroTech/
├── HONESTY.md                  ← hackathon disclosure (team, shortcuts, APIs)
├── LICENSE
└── road-sentinel-hk/
    ├── Dockerfile
    ├── render.yaml
    ├── backend/
    │   ├── main.py             ← FastAPI app, WebSocket, /report endpoint
    │   ├── database.py         ← SQLite persistence layer
    │   ├── requirements.txt
    │   ├── models/
    │   │   ├── accelerometer.py   ← jolt detection, speed gate
    │   │   ├── sound.py           ← audio feature extraction + classifier
    │   │   ├── vision.py          ← OpenCV frame analysis
    │   │   └── fusion.py          ← weighted multi-sensor fusion
    │   └── services/
    │       ├── clustering.py      ← 50m radius hazard clustering
    │       ├── dwd.py             ← DWD weather integration
    │       ├── geocoding.py       ← OSM Nominatim reverse geocoding
    │       ├── typhoon.py         ← HKO typhoon signal
    │       └── hk_incidents.py    ← live road incident feed
    └── frontend/
        ├── vite.config.js
        ├── .env.example        ← copy to .env and add Mapbox token
        └── src/
            ├── App.jsx
            ├── pages/
            │   ├── DriverMode.jsx      ← mobile scanning + voice alerts
            │   ├── Dashboard.jsx       ← live map + WebSocket feed
            │   └── GovernmentPortal.jsx
            └── services/
                ├── api.js
                └── sensors.js
```

---

## Running Locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- A free [Mapbox token](https://account.mapbox.com/access-tokens/)

### 1. Backend

```bash
cd road-sentinel-hk/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd road-sentinel-hk/frontend
cp .env.example .env
# Edit .env and set VITE_MAPBOX_TOKEN=pk.your_token_here
npm install
npm run dev
```

Open `https://localhost:3001` (HTTPS required for camera + accelerometer on mobile).

### 3. Mobile driver mode

Connect your phone to the same network, then open `https://<your-laptop-ip>:3001/drive`.
Accept the self-signed certificate warning — it is required for `DeviceMotionEvent` on iOS 13+.

---

## Docker (production)

```bash
cd road-sentinel-hk
docker build --build-arg VITE_MAPBOX_TOKEN=pk.your_token_here -t roadsense .
docker run -p 8000:8000 roadsense
```

---

## Deploying on Render

1. Push to GitHub.
2. Create a new **Web Service** on [render.com](https://render.com), connect this repo.
3. Set environment variable `VITE_MAPBOX_TOKEN` in the Render dashboard.
4. Render picks up `render.yaml` automatically and deploys.

---

## Team

| Member | Role |
|--------|------|
| Farhan Ghulam — [@farhan-ali9](https://github.com/farhan-ali9) | Backend + frontend web app |
| Aleksandr Gorbunov | Backend incident integration, repo setup |
| Adrian — [@adrks10](https://github.com/adrks10) | Hardware sensor firmware |

See [HONESTY.md](HONESTY.md) for full disclosure of each person's contributions, shortcuts taken, and external APIs used.

---

## License

MIT — see [LICENSE](LICENSE).
