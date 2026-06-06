import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Mark } from "../components/Logo";
import { startGPS } from "../services/sensors";
import { createAccelSource } from "../services/accelSource";
import { createDetector } from "../services/detector";
import { sendReport, fetchNearby } from "../services/api";
import { haversineMeters } from "../services/geo";

const WARN_RANGE_M = 150; // start warning when a defect is this close
const NEARBY_REFRESH_MS = 15000; // re-fetch the local defect set this often

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

  const stopGps = useRef(null);
  const stopAccel = useRef(null);
  const latestGps = useRef(null);
  const nearby = useRef([]);
  const detector = useRef(null);

  const updateWarning = useCallback((pos) => {
    let nearest = null;
    let best = Infinity;
    for (const d of nearby.current) {
      const dist = haversineMeters(pos, d);
      if (dist <= WARN_RANGE_M && dist < best) {
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
    stopGps.current = null;
    stopAccel.current = null;
    detector.current = null;
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
        updateWarning(pos);
      },
      (err) => setError(`GPS: ${err}`)
    );

    const source = createAccelSource();
    stopAccel.current = source.start(
      (reading) => detector.current?.feed(reading, latestGps.current?.speed_kmh ?? 0),
      (err) => setError(`Motion: ${err}`)
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

  useEffect(() => () => stopAll(), [stopAll]);

  const close = warning && warning.distance < 80;
  const warnColor = warning ? SEVERITY_COLORS[sev(warning.defect.severity)] : BRAND;

  return (
    <div
      style={{
        ...styles.page,
        background: close
          ? `radial-gradient(circle at 50% 36%, ${warnColor}2b, #eef3f5 70%)`
          : PAGE_BG,
      }}
    >
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

      {/* main */}
      <div style={styles.main}>
        {!active ? (
          <Idle />
        ) : warning ? (
          <Warning warning={warning} color={warnColor} close={close} gps={gps} />
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

function Warning({ warning, color, close, gps }) {
  const s = sev(warning.defect.severity);
  const dist = Math.round(warning.distance);
  const fill = Math.max(0, Math.min(1, 1 - warning.distance / WARN_RANGE_M));
  const speed = gps?.speed_kmh ?? 0;
  const secs = speed > 1 ? Math.round(warning.distance / (speed / 3.6)) : null;

  return (
    <div style={{ textAlign: "center", width: "100%", maxWidth: 420, padding: "0 22px" }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.5, color }}>
        {close ? "DEFECT IMMINENT" : "DEFECT AHEAD"}
      </div>

      <div
        style={{
          ...styles.sevBadge,
          background: color,
          animation: close ? "pulse 0.8s infinite" : "none",
        }}
      >
        {s}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color, marginTop: 8 }}>
        Severity {s}/5 · {SEVERITY_LABELS[s]}
      </div>
      {warning.defect.road_name && (
        <div style={{ fontSize: 13, color: "#5a7480", marginTop: 4 }}>{warning.defect.road_name}</div>
      )}

      <div style={{ marginTop: 26 }}>
        <span style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, color: "#152830", fontVariantNumeric: "tabular-nums" }}>
          {dist}
        </span>
        <span style={{ fontSize: 20, color: "#90a4ac", fontWeight: 600 }}> m</span>
      </div>
      {secs != null && <div style={{ fontSize: 13, color: "#90a4ac", marginTop: 2 }}>~{secs}s away</div>}

      <div style={{ marginTop: 28, display: "flex", justifyContent: "center" }}>
        <ProximitySignal color={color} fill={fill} />
      </div>
    </div>
  );
}

// WiFi-style proximity glyph: a dot with concentric arcs that light up
// (inner → outer) as you close in on the defect.
function ProximitySignal({ color, fill }) {
  const litArcs = Math.round(Math.max(0, Math.min(1, fill)) * 3); // 0..3 arcs
  const dim = "rgba(20,40,48,0.12)";
  const arcs = [
    "M39.4 51.4 A15 15 0 0 1 60.6 51.4",
    "M30.2 42.2 A28 28 0 0 1 69.8 42.2",
    "M21 33 A41 41 0 0 1 79 33",
  ];
  return (
    <svg width="118" height="85" viewBox="0 0 100 72" fill="none">
      {arcs.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke={i < litArcs ? color : dim}
          strokeWidth="7"
          strokeLinecap="round"
          style={{ transition: "stroke 0.2s" }}
        />
      ))}
      <circle cx="50" cy="62" r="6" fill={color} />
    </svg>
  );
}

function Flash({ severity }) {
  const color = SEVERITY_COLORS[severity];
  return (
    <div style={{ ...styles.flash, background: `${color}22` }}>
      <svg width="62" height="62" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="11" fill={color} />
        <path d="M7 12.4l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
  sevBadge: {
    width: 92,
    height: 92,
    borderRadius: "50%",
    color: "#fff",
    fontSize: 50,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "16px auto 0",
    boxShadow: "0 10px 30px rgba(20,40,48,0.18)",
    fontVariantNumeric: "tabular-nums",
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
