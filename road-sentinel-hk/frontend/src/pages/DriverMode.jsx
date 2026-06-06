import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Mark } from "../components/Logo";
import { startGPS, startCompass } from "../services/sensors";
import { createAccelSource } from "../services/accelSource";
import { createDetector } from "../services/detector";
import { sendReport, fetchNearby } from "../services/api";
import { haversineMeters, bearingDeg, angleDelta } from "../services/geo";

const WARN_RANGE_M = 150; // start warning when a defect is this close
const NEARBY_REFRESH_MS = 15000; // re-fetch the local defect set this often
const ACCEL_VIEW_MS = 150; // throttle for the live accelerometer readout
const AHEAD_CONE_DEG = 80; // only warn about defects within this cone of travel direction

const BRAND = "#2C5364"; // app theme color
const PAGE_BG = "linear-gradient(180deg,#f5f8f9 0%,#e6eef0 100%)";

const SEVERITY_COLORS = { 1: "#22c55e", 2: "#84cc16", 3: "#eab308", 4: "#f97316", 5: "#ef4444" };
const SEVERITY_LABELS = { 1: "Minor", 2: "Low", 3: "Moderate", 4: "High", 5: "Severe" };
const sev = (s) => Math.max(1, Math.min(5, Math.round(s || 1)));

export default function DriverView() {
  const [active, setActive] = useState(false);
  const [gps, setGps] = useState(null);
  const [warning, setWarning] = useState(null); // { defect, distance }
  const [logged, setLogged] = useState(0);
  const [flash, setFlash] = useState(null); // severity of last-logged defect
  const [error, setError] = useState(null);
  const [accelView, setAccelView] = useState(null); // throttled live reading

  const stopGps = useRef(null);
  const stopAccel = useRef(null);
  const stopCompass = useRef(null);
  const latestGps = useRef(null);
  const latestAccel = useRef(null);
  const prevPos = useRef(null); // previous GPS fix, for deriving heading
  const heading = useRef(null); // GPS-derived travel heading (deg) or null
  const compass = useRef(null); // phone-facing heading (deg) from the compass
  const lastCompassWarn = useRef(0);
  const nearby = useRef([]);
  const detector = useRef(null);

  const updateWarning = useCallback((pos) => {
    const speed = pos.speed_kmh ?? 0;
    // Prefer the compass (where the front of the phone points); once moving
    // fast, trust the GPS course more (compass can drift in a car).
    const hdg =
      speed > 30 && heading.current != null
        ? heading.current
        : compass.current != null
        ? compass.current
        : heading.current;
    let nearest = null;
    let best = Infinity;
    for (const d of nearby.current) {
      const dist = haversineMeters(pos, d);
      if (dist > WARN_RANGE_M) continue;
      // When we know our heading, only warn about defects roughly ahead.
      if (hdg != null && angleDelta(hdg, bearingDeg(pos, d)) > AHEAD_CONE_DEG) continue;
      if (dist < best) {
        best = dist;
        nearest = d;
      }
    }
    setWarning(nearest ? { defect: nearest, distance: best } : null);
  }, []);

  const onDefect = useCallback(({ severity }) => {
    const pos = latestGps.current;
    if (!pos) return;
    setFlash(severity);
    setTimeout(() => setFlash(null), 1400);
    setLogged((n) => n + 1);
    sendReport({ lat: pos.lat, lng: pos.lng, severity }).catch(() => {});
  }, []);

  const stopAll = useCallback(() => {
    stopGps.current?.();
    stopAccel.current?.();
    stopCompass.current?.();
    stopGps.current = null;
    stopAccel.current = null;
    stopCompass.current = null;
    detector.current = null;
    prevPos.current = null;
    heading.current = null;
    compass.current = null;
    setActive(false);
    setWarning(null);
  }, []);

  const start = useCallback(() => {
    setError(null);
    detector.current = createDetector(onDefect);

    stopGps.current = startGPS(
      (pos) => {
        setGps(pos);
        latestGps.current = pos;
        // Derive heading from movement; unknown when slow/stopped (so the
        // shake-test and parked use still show every nearby defect).
        if (pos.speed_kmh > 5 && prevPos.current && haversineMeters(prevPos.current, pos) > 4) {
          heading.current = bearingDeg(prevPos.current, pos);
        } else if (pos.speed_kmh <= 5) {
          heading.current = null;
        }
        prevPos.current = pos;
        updateWarning(pos);
      },
      (err) => setError(`GPS: ${err}`)
    );

    const source = createAccelSource();
    stopAccel.current = source.start(
      (reading) => {
        latestAccel.current = reading;
        detector.current?.feed(reading);
      },
      (err) => setError(`Motion: ${err}`)
    );

    // Compass — direction the front of the phone points (Google-Maps style).
    stopCompass.current = startCompass(
      (h) => {
        compass.current = h;
        const now = Date.now();
        if (now - lastCompassWarn.current > 200 && latestGps.current) {
          lastCompassWarn.current = now;
          updateWarning(latestGps.current);
        }
      },
      () => {} // no compass → fall back to GPS-derived heading
    );

    setActive(true);
  }, [onDefect, updateWarning]);

  // Periodically refresh the local defect set from the backend.
  useEffect(() => {
    if (!active) return;
    const load = async () => {
      const pos = latestGps.current;
      if (!pos) return;
      try {
        const data = await fetchNearby(pos.lat, pos.lng, 1000);
        nearby.current = data.hazards || [];
        updateWarning(pos);
      } catch {}
    };
    load();
    const t = setInterval(load, NEARBY_REFRESH_MS);
    return () => clearInterval(t);
  }, [active, updateWarning]);

  // Throttled live accelerometer readout for the status line.
  useEffect(() => {
    if (!active) {
      setAccelView(null);
      return;
    }
    const t = setInterval(() => setAccelView(latestAccel.current), ACCEL_VIEW_MS);
    return () => clearInterval(t);
  }, [active]);

  useEffect(() => () => stopAll(), [stopAll]);

  const close = warning && warning.distance < 80;

  return (
    <div style={{ ...styles.page, background: PAGE_BG }}>
      {flash && <Flash severity={sev(flash)} />}

      {/* top bar */}
      <div style={styles.topBar}>
        <div style={styles.wordmark}>
          <Mark size={20} color={BRAND} strokeWidth={2.2} /> BumpLess
        </div>
        {!active && (
          <Link to="/gov" style={styles.govLink}>
            Dashboard
          </Link>
        )}
      </div>

      {/* subtle live accelerometer readout */}
      {active && accelView && (
        <div style={styles.accelLog}>
          z {(accelView.lz || 0).toFixed(2)} m/s²  ·  x {(accelView.lx || 0).toFixed(2)}  y {(accelView.ly || 0).toFixed(2)}
        </div>
      )}

      {/* main */}
      <div style={styles.main}>
        {!active ? (
          <Idle />
        ) : warning ? (
          <Warning warning={warning} close={close} gps={gps} />
        ) : (
          <Monitoring gps={gps} logged={logged} nearbyCount={nearby.current.length} />
        )}
        {error && <div style={styles.error}>{error}</div>}
      </div>

      {/* bottom action */}
      <div style={styles.bottom}>
        {active && (
          <div style={styles.tripStat}>
            {logged} logged · {Math.round(gps?.speed_kmh ?? 0)} km/h
          </div>
        )}
        <button
          onClick={active ? stopAll : start}
          style={{
            ...styles.button,
            background: active
              ? "linear-gradient(135deg,#ef4444,#dc2626)"
              : "linear-gradient(135deg,#2c5364,#22414e)",
            boxShadow: active ? "0 10px 28px #ef444433" : "0 10px 28px #2c536440",
          }}
        >
          {active ? "Stop" : "Start"}
        </button>
      </div>
    </div>
  );
}

// ── States ────────────────────────────────────────────────────────────────────

function Idle() {
  return (
    <div style={{ textAlign: "center", padding: "0 24px" }}>
      <div style={{ display: "inline-flex", opacity: 0.9 }}>
        <Mark size={44} color={BRAND} strokeWidth={2.2} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#14252e", marginTop: 18 }}>
        Tap Start to begin
      </div>
    </div>
  );
}

function Monitoring({ gps, logged, nearbyCount }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={styles.radar}>
        <span style={styles.radarRing} />
        <span style={styles.radarDot} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: BRAND }}>Monitoring</div>
      <div style={{ fontSize: 14, color: "#5a7480", marginTop: 6 }}>
        {nearbyCount > 0
          ? `${nearbyCount} defect${nearbyCount === 1 ? "" : "s"} nearby`
          : "No defects nearby"}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 36, marginTop: 28 }}>
        <Stat label="km/h" value={`${Math.round(gps?.speed_kmh ?? 0)}`} />
        <Stat label="logged" value={logged} />
      </div>
    </div>
  );
}

function Warning({ warning, close, gps }) {
  const s = sev(warning.defect.severity);
  const dist = Math.round(warning.distance);
  const fill = Math.max(0, Math.min(1, 1 - warning.distance / WARN_RANGE_M));
  const speed = gps?.speed_kmh ?? 0;
  const secs = speed > 1 ? Math.round(warning.distance / (speed / 3.6)) : null;

  return (
    <div style={{ textAlign: "center", width: "100%", maxWidth: 440, padding: "0 22px" }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.5, color: close ? "#dc2626" : "#64748b" }}>
        {close ? "DEFECT IMMINENT" : "DEFECT AHEAD"}
      </div>

      {/* proximity signal fan — the main element */}
      <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
        <ProximitySignal fill={fill} size={220} />
      </div>

      {/* distance to the defect */}
      <div style={{ marginTop: 4 }}>
        <span style={{ fontSize: 60, fontWeight: 800, lineHeight: 1, color: "#152830", fontVariantNumeric: "tabular-nums" }}>
          {dist}
        </span>
        <span style={{ fontSize: 22, color: "#90a4ac", fontWeight: 600 }}> m</span>
      </div>
      {secs != null && <div style={{ fontSize: 13, color: "#90a4ac", marginTop: 2 }}>~{secs}s away</div>}

      {/* severity (secondary) */}
      <div style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: SEVERITY_COLORS[s] }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: "#152830" }}>
          Severity {s}/5 · {SEVERITY_LABELS[s]}
        </span>
      </div>
      {warning.defect.road_name && (
        <div style={{ fontSize: 13, color: "#7c95a0", marginTop: 4 }}>{warning.defect.road_name}</div>
      )}
    </div>
  );
}

// Proximity signal: a fan of thick, squared bars that light up bottom→top as you
// close in. Colours escalate green → orange → red. No animation.
const BAR_COLORS = ["#22c55e", "#16a34a", "#f97316", "#ea580c", "#ef4444", "#991b1b"];
function ProximitySignal({ fill, size = 220 }) {
  const lit = Math.max(0, Math.min(BAR_COLORS.length, Math.ceil(fill * BAR_COLORS.length)));
  const dim = "rgba(20,40,48,0.07)";
  const arcs = [
    "M41.8 73.2 A12 12 0 0 1 58.2 73.2",
    "M34.3 65.2 A23 23 0 0 1 65.7 65.2",
    "M26.8 57.1 A34 34 0 0 1 73.2 57.1",
    "M19.3 49.1 A45 45 0 0 1 80.7 49.1",
    "M11.8 41.1 A56 56 0 0 1 88.2 41.1",
    "M4.3 33 A67 67 0 0 1 95.7 33",
  ];
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 100 90" fill="none">
      {arcs.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke={i < lit ? BAR_COLORS[i] : dim}
          strokeWidth="7.5"
          strokeLinecap="round"
          style={{
            transition: "stroke 0.35s ease",
            animation: `fanIn 0.45s ${i * 0.06}s ease-out both`,
          }}
        />
      ))}
    </svg>
  );
}

function Flash({ severity }) {
  const WARN = "#f59e0b"; // amber warning
  return (
    <div style={{ ...styles.flash, background: `${WARN}22` }}>
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
        <path d="M12 4 L21 19.5 H3 Z" fill={WARN} stroke={WARN} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M12 10.5 V14" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="16.7" r="1.15" fill="#fff" />
      </svg>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#152830", marginTop: 12 }}>Defect logged</div>
      <div style={{ fontSize: 13, color: "#5a7480", marginTop: 2 }}>
        Severity {severity} · {SEVERITY_LABELS[severity]}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 36, fontWeight: 800, color: "#152830", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#7c95a0", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

// ── Styles (light theme, teal accent) ─────────────────────────────────────────
const styles = {
  page: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    color: "#152830",
    transition: "background 0.4s",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "calc(env(safe-area-inset-top) + 16px) 18px 8px",
    flexShrink: 0,
  },
  wordmark: { fontSize: 15, fontWeight: 800, letterSpacing: -0.2, color: BRAND, display: "flex", alignItems: "center", gap: 8 },
  govLink: {
    fontSize: 13,
    fontWeight: 600,
    color: BRAND,
    textDecoration: "none",
    border: `1px solid ${BRAND}33`,
    borderRadius: 9,
    padding: "7px 14px",
  },
  accelLog: {
    flexShrink: 0,
    textAlign: "center",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 10.5,
    fontWeight: 400,
    letterSpacing: 0.2,
    color: "#9fb1b9",
    padding: "0 16px 2px",
  },
  main: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  bottom: { padding: "12px 20px calc(env(safe-area-inset-bottom) + 22px)", flexShrink: 0 },
  tripStat: { textAlign: "center", fontSize: 13, color: "#7c95a0", marginBottom: 12, fontWeight: 500 },
  button: {
    width: "100%",
    padding: "19px",
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 0.2,
    color: "white",
    border: "none",
    borderRadius: 16,
    cursor: "pointer",
  },
  radar: {
    position: "relative",
    width: 128,
    height: 128,
    margin: "0 auto 22px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  radarRing: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    border: `2px solid ${BRAND}40`,
    animation: "pulse 2s infinite",
  },
  radarDot: {
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: BRAND,
    boxShadow: `0 0 0 8px ${BRAND}1f`,
  },
  flash: {
    position: "fixed",
    inset: 0,
    zIndex: 999,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    animation: "flashFade 1.4s forwards",
    pointerEvents: "none",
  },
  error: { marginTop: 20, fontSize: 12, color: "#d97706", textAlign: "center", padding: "0 24px" },
};
