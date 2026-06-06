import React, { useEffect, useState, useRef, useCallback } from "react";
import Map from "../components/Map";
import { startGPS, startAccelerometer, startAudio, startCamera } from "../services/sensors";
import { sendReport, fetchNearby } from "../services/api";

const SEND_INTERVAL_MS = 500;
const NEARBY_CHECK_MS  = 3000;

const TYPE_ICONS = {
  pothole:    "🕳️",
  slippery:   "🌊",
  wet_road:   "💧",
  rough_road: "⚡",
  bump:       "🔺",
};

export default function DriverMode() {
  const [active,          setActive]          = useState(false);
  const [cameraEnabled,   setCameraEnabled]   = useState(false);  // off by default — impractical inside car
  const [gps,             setGps]             = useState(null);
  const [accel,           setAccel]           = useState(null);
  const [audioFeatures,   setAudioFeatures]   = useState(null);
  const [lastFrame,       setLastFrame]       = useState(null);
  const [nearbyHazards,   setNearbyHazards]   = useState([]);
  const [lastDetection,   setLastDetection]   = useState(null);
  const [errors,          setErrors]          = useState([]);
  const [stats,           setStats]           = useState({ reports: 0, detected: 0 });
  const [detectionFlash,  setDetectionFlash]  = useState(null);
  const [govToast,        setGovToast]        = useState(false);

  const gpsRef      = useRef(null);
  const accelRef    = useRef(null);
  const audioRef    = useRef(null);
  const cameraRef   = useRef(null);
  const latestGps   = useRef(null);
  const latestAccel = useRef(null);
  const latestAudio = useRef(null);
  const latestFrame = useRef(null);
  const cameraEnabledRef = useRef(cameraEnabled);
  useEffect(() => { cameraEnabledRef.current = cameraEnabled; }, [cameraEnabled]);

  const addError = (msg) => setErrors((e) => [...e.slice(-3), msg]);

  const stopAll = useCallback(() => {
    gpsRef.current?.();
    accelRef.current?.();
    audioRef.current?.();
    cameraRef.current?.();
    gpsRef.current = accelRef.current = audioRef.current = cameraRef.current = null;
    setLastFrame(null);
    setActive(false);
  }, []);

  const startAll = useCallback(async () => {
    setErrors([]);

    gpsRef.current = startGPS(
      (pos) => { setGps(pos); latestGps.current = pos; },
      (err) => addError(`GPS: ${err}`)
    );

    startAccelerometer(
      (r) => { setAccel(r); latestAccel.current = r; },
      (err) => addError(`Accel: ${err}`)
    );

    const stopAudio = await startAudio(
      (f) => { setAudioFeatures(f); latestAudio.current = f; },
      (err) => addError(`Audio: ${err}`)
    );
    if (stopAudio) audioRef.current = stopAudio;

    // Camera is optional — only start if user explicitly enabled it
    if (cameraEnabledRef.current) {
      const stopCamera = await startCamera(
        (frame) => { setLastFrame(frame); latestFrame.current = frame; },
        (err) => addError(`Camera: ${err}`)
      );
      if (stopCamera) cameraRef.current = stopCamera;
    }

    setActive(true);
  }, []);

  // Send sensor data to backend every 500ms
  useEffect(() => {
    if (!active) return;

    const interval = setInterval(async () => {
      const gpsData   = latestGps.current;
      const accelData = latestAccel.current;
      if (!gpsData || !accelData) return;

      try {
        const result = await sendReport({
          lat:            gpsData.lat,
          lng:            gpsData.lng,
          speed_kmh:      gpsData.speed_kmh,
          accelerometer:  accelData,
          audio_features: latestAudio.current,
          frame:          latestFrame.current,
        });

        setStats((s) => ({
          reports:  s.reports + 1,
          detected: s.detected + (result.hazard_detected ? 1 : 0),
        }));

        if (result.hazard_detected) {
          setLastDetection(result);

          // Trigger full-screen flash
          setDetectionFlash(result.event_type);
          setTimeout(() => setDetectionFlash(null), 2000);

          // If government was notified, show toast
          if (result.severity >= 5) {
            setGovToast(true);
            setTimeout(() => setGovToast(false), 4000);
          }
        }
      } catch {}
    }, SEND_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [active]);

  // Check nearby hazards every 3s
  useEffect(() => {
    if (!active) return;

    const interval = setInterval(async () => {
      const pos = latestGps.current;
      if (!pos) return;
      try {
        const data = await fetchNearby(pos.lat, pos.lng, 300);
        setNearbyHazards(data.hazards || []);
      } catch {}
    }, NEARBY_CHECK_MS);

    return () => clearInterval(interval);
  }, [active]);

  useEffect(() => () => stopAll(), [stopAll]);

  const topHazard = [...nearbyHazards].sort((a, b) => b.severity - a.severity)[0];

  return (
    <div style={styles.page}>

      {/* ── Full-screen detection flash ──────────────────────────────────── */}
      {detectionFlash && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 999,
          background: "#ef444440",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          animation: "fadeFlash 2s forwards",
          pointerEvents: "none",
        }}>
          <div style={{ fontSize: 72 }}>{TYPE_ICONS[detectionFlash] || "⚠️"}</div>
          <div style={{
            fontSize: 28, fontWeight: 900, color: "white",
            textTransform: "uppercase", letterSpacing: 3, marginTop: 12,
            textShadow: "0 0 20px #ef4444",
          }}>
            {detectionFlash.replace("_", " ")} DETECTED
          </div>
        </div>
      )}

      {/* ── Government toast ─────────────────────────────────────────────── */}
      {govToast && (
        <div style={{
          position: "fixed", top: 70, right: 20, zIndex: 998,
          background: "#1e293b",
          border: "1px solid #22c55e50",
          borderRadius: 12,
          padding: "12px 18px",
          display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          animation: "slideIn 0.3s ease",
          maxWidth: 320,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "#22c55e20",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
          }}>🏛️</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: "#22c55e" }}>
              Reported to HK Highways Dept
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              Alert auto-sent · Road maintenance notified
            </div>
          </div>
        </div>
      )}

      {/* ── Nearby hazard warning ─────────────────────────────────────────── */}
      {topHazard && active && (
        <div style={styles.warningBanner}>
          <div style={{ fontSize: 30, lineHeight: 1 }}>
            {TYPE_ICONS[topHazard.event_type] || "⚠️"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16, textTransform: "capitalize" }}>
              {topHazard.event_type.replace("_", " ")} ahead
            </div>
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
              {nearbyHazards.length} hazard{nearbyHazards.length > 1 ? "s" : ""} within 300m of your route
            </div>
          </div>
          <div style={{ minWidth: 92, textAlign: "center", background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, opacity: 0.8 }}>RECOMMENDED</div>
            <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1, color: "#f97316" }}>
              {topHazard.severity >= 7 ? 10 : topHazard.severity >= 4 ? 20 : 30}
            </div>
            <div style={{ fontSize: 10, opacity: 0.8 }}>km/h</div>
          </div>
        </div>
      )}

      <section style={styles.mapHero}>
        <div style={styles.heroInfo}>
          <div style={styles.sectionLabel}>Driver mode</div>
          <h1 style={styles.heroTitle}>Live Hong Kong road safety dashboard</h1>
          <p style={styles.heroText}>
            Track your vehicle position and nearby road hazards in real time, with a focused map view for the whole territory.
          </p>
          <div style={styles.heroRow}>
            <div style={styles.heroStatCard}>
              <div style={styles.heroStatLabel}>Current state</div>
              <div style={styles.heroStatValue}>{active ? "ACTIVE" : "INACTIVE"}</div>
            </div>
            <div style={styles.heroStatCard}>
              <div style={styles.heroStatLabel}>Live hazards</div>
              <div style={styles.heroStatValue}>{nearbyHazards.length}</div>
            </div>
            <div style={styles.heroStatCard}>
              <div style={styles.heroStatLabel}>Speed</div>
              <div style={styles.heroStatValue}>{gps ? `${gps.speed_kmh.toFixed(0)} km/h` : "—"}</div>
            </div>
          </div>
        </div>

        <div style={styles.mapCard}>
          <div style={styles.mapCardHeader}>
            <div>
              <div style={styles.sectionLabel}>Hong Kong coverage</div>
              <div style={{ color: "#f1f5f9", fontWeight: 800, fontSize: 14, marginTop: 4 }}>
                Zoom in to inspect a district or zoom out for the full city.
              </div>
            </div>
            <div style={{
              background: active ? "rgba(45,212,191,0.12)" : "rgba(148,163,184,0.08)",
              color: active ? "#2dd4bf" : "#94a3b8",
              borderRadius: 999,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.5,
              border: `1px solid ${active ? "rgba(45,212,191,0.2)" : "rgba(148,163,184,0.12)"}`
            }}>
              {active ? "🟢 Live feed" : "⚪ Standby"}
            </div>
          </div>
          <div style={styles.mapWrapper}>
            <Map hazards={nearbyHazards} userLocation={gps ? { lat: gps.lat, lng: gps.lng } : null} />
          </div>
          <div style={styles.mapFooter}>
            <span>{nearbyHazards.length} hazard{nearbyHazards.length === 1 ? "" : "s"} near your current route</span>
            <span>Full Hong Kong bounds available</span>
          </div>
        </div>
      </section>

      <div style={styles.grid}>

        {/* Control card */}
        <div style={styles.card}>
          <div style={styles.cardLabel}>MONITORING STATUS</div>
          <button
            onClick={active ? stopAll : startAll}
            style={{
              ...styles.bigButton,
              background: active
                ? "linear-gradient(135deg, #ff3b4a, #e60033)"
                : "linear-gradient(135deg, #2dd4bf, #14b8a6)",
              boxShadow: active
                ? "0 8px 32px rgba(255, 59, 74, 0.25)"
                : "0 8px 32px rgba(45, 212, 191, 0.25)",
            }}
          >
            {active ? "■ STOP" : "▶ START"}
          </button>

          {/* Sensor status row */}
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            <SensorPill icon="📍" label="GPS" active={active} />
            <SensorPill icon="📳" label="Accel" active={active} />
            <SensorPill icon="🎤" label="Audio" active={active} />
            <SensorPill icon="📷" label="Camera" active={active && cameraEnabled} dim={!cameraEnabled} />
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: 8, marginTop: 12,
          }}>
            <MiniStat label="Reports" value={stats.reports} />
            <MiniStat label="Detected" value={stats.detected} color="#ff3b4a" />
          </div>
          {errors.map((e, i) => (
            <div key={i} style={{ fontSize: 10, color: "#ef4444", marginTop: 4 }}>{e}</div>
          ))}
        </div>

        {/* GPS card */}
        <div style={styles.card}>
          <div style={styles.cardLabel}>GPS LOCATION</div>
          {gps ? (
            <>
              <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1, color: "#2dd4bf" }}>
                {gps.speed_kmh.toFixed(0)}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>km/h</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
              </div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
                Accuracy ±{gps.accuracy?.toFixed(0)}m
              </div>
              {gps.speed_kmh < 8 && (
                <div style={{
                  marginTop: 8, fontSize: 10, color: "#ff8c42",
                  background: "#ff8c4215", padding: "4px 8px", borderRadius: 4,
                }}>
                  Too slow — detection paused
                </div>
              )}
            </>
          ) : (
            <div style={styles.waiting}>
              {active ? "📡 Acquiring GPS..." : "Start to enable"}
            </div>
          )}
        </div>

        {/* Accelerometer card */}
        <div style={styles.card}>
          <div style={styles.cardLabel}>ACCELEROMETER</div>
          {accel ? (() => {
            const lx = accel.lx ?? 0, ly = accel.ly ?? 0, lz = accel.lz ?? 0;
            const jolt = Math.sqrt(lx*lx + ly*ly + lz*lz);
            const hasLinear = jolt > 0.1;
            const displayJolt = hasLinear ? jolt : Math.max(0, Math.abs(accel.z) - 9.81);
            const isSpike = displayJolt > 4;
            return (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <AxisBar label="X" value={accel.x} max={15} />
                  <AxisBar label="Y" value={accel.y} max={15} />
                  <AxisBar label="Z" value={accel.z} max={15} />
                </div>
                <div style={{
                  marginTop: 10, padding: "8px 10px",
                  background: isSpike ? "#ef444415" : "#0a1120",
                  borderRadius: 8,
                  border: `1px solid ${isSpike ? "#ef444440" : "#1e293b"}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 10, color: "#475569" }}>
                    {hasLinear ? "JOLT (linear)" : "JOLT (z-net)"}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: isSpike ? "#ef4444" : "#22c55e" }}>
                    {displayJolt.toFixed(2)} m/s²
                    {isSpike && <span style={{ marginLeft: 6 }}>⚡ SPIKE</span>}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: "#334155", marginTop: 4, textAlign: "center" }}>
                  Threshold: 4.0 m/s² · {hasLinear ? "orientation-independent" : "z-axis only (fallback)"}
                </div>
              </>
            );
          })() : (
            <div style={styles.waiting}>{active ? "Waiting for motion..." : "Start to enable"}</div>
          )}
        </div>

        {/* Audio card */}
        <div style={styles.card}>
          <div style={styles.cardLabel}>ROAD SOUND ANALYSIS</div>
          {audioFeatures ? (
            <>
              <AudioBar label="Volume (RMS)"    value={audioFeatures.rms}  max={0.3} />
              <AudioBar label="Sharpness (ZCR)" value={audioFeatures.zcr}  max={0.4} />
              <AudioBar label="Low Frequency"   value={audioFeatures.low_freq_energy}  max={1} />
              <AudioBar label="High Frequency"  value={audioFeatures.high_freq_energy} max={1} />
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 6 }}>
                Peak: {audioFeatures.peak_db?.toFixed(1)} dB
              </div>
            </>
          ) : (
            <div style={styles.waiting}>{active ? "🎤 Listening..." : "Start to enable"}</div>
          )}
        </div>

        {/* Last Detection card */}
        <div style={{
          ...styles.card,
          border: lastDetection
            ? `1px solid ${lastDetection.severity >= 7 ? "#ef444460" : "#f9731640"}`
            : "1px solid #334155",
        }}>
          <div style={styles.cardLabel}>LAST DETECTION</div>
          {lastDetection ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 32 }}>{TYPE_ICONS[lastDetection.event_type] || "⚠️"}</span>
                <div>
                  <div style={{
                    fontWeight: 900, fontSize: 20, textTransform: "capitalize",
                    color: lastDetection.severity >= 7 ? "#ef4444" : lastDetection.severity >= 4 ? "#f97316" : "#eab308",
                  }}>
                    {lastDetection.event_type?.replace("_", " ")}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {new Date().toLocaleTimeString()}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <MiniStat label="Severity"   value={`${lastDetection.severity?.toFixed(1)}/10`}
                  color={lastDetection.severity >= 7 ? "#ef4444" : "#f97316"} />
                <MiniStat label="Speed Rec"  value={`${lastDetection.speed_rec_kmh} km/h`} color="#22c55e" />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {lastDetection.signals_used?.map((s) => (
                  <span key={s} style={{
                    background: "#3b82f620", color: "#3b82f6",
                    padding: "2px 8px", borderRadius: 4,
                    fontSize: 10, fontWeight: 700,
                  }}>
                    {s === "accelerometer" ? "📳 Accel" : s === "audio" ? "🎤 Audio" : "📷 Camera"}
                  </span>
                ))}
              </div>

              {lastDetection.vision_detected && (
                <div style={{
                  background: "#22c55e15", border: "1px solid #22c55e30",
                  borderRadius: 6, padding: "6px 10px", fontSize: 11,
                  color: "#22c55e", fontWeight: 700,
                }}>
                  📷 Camera visually confirmed road hazard
                </div>
              )}

              {lastDetection.weather_boost && (
                <div style={{
                  background: "#3b82f615", border: "1px solid #3b82f630",
                  borderRadius: 6, padding: "6px 10px", fontSize: 11,
                  color: "#3b82f6", fontWeight: 700, marginTop: 6,
                }}>
                  ⛈ HKO rain warning boosted severity
                </div>
              )}
            </>
          ) : (
            <div style={styles.waiting}>No hazard detected yet</div>
          )}
        </div>

        {/* Camera card */}
        <div style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={styles.cardLabel}>CAMERA — OPTIONAL</div>
            {/* Toggle */}
            <button
              onClick={() => {
                if (active) return; // can't toggle while running
                setCameraEnabled(v => !v);
              }}
              style={{
                background: cameraEnabled ? "#3b82f620" : "#1e293b",
                color: cameraEnabled ? "#3b82f6" : "#475569",
                border: `1px solid ${cameraEnabled ? "#3b82f650" : "#334155"}`,
                borderRadius: 20,
                padding: "3px 12px",
                fontSize: 11,
                fontWeight: 700,
                cursor: active ? "not-allowed" : "pointer",
                opacity: active ? 0.5 : 1,
              }}
            >
              {cameraEnabled ? "ON" : "OFF"}
            </button>
          </div>

          {!cameraEnabled ? (
            /* Explanation when off */
            <div style={{
              background: "#0a1120", borderRadius: 10,
              padding: "14px 16px",
              border: "1px solid #1e293b",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>
                📷 Camera is OFF
              </div>
              <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.7 }}>
                The rear camera cannot see the road when the phone is held inside the car.
                <br /><br />
                <span style={{ color: "#64748b", fontWeight: 700 }}>Detection works without it:</span>
                <br />
                • 📳 Accelerometer detects the physical jolt of a pothole
                <br />
                • 🎤 Microphone hears the thud/vibration of road damage
                <br /><br />
                <span style={{ color: "#22c55e", fontWeight: 700 }}>Only enable camera if</span> the phone
                is mounted on the dashboard facing the road through the windshield (dashcam style).
              </div>
            </div>
          ) : lastFrame ? (
            /* Live camera feed when enabled */
            <div style={{ position: "relative" }}>
              <img
                src={lastFrame}
                alt="road"
                style={{ width: "100%", borderRadius: 8, border: "1px solid #334155", display: "block" }}
              />
              <div style={{
                position: "absolute", top: 6, left: 6,
                background: "#ef444490", color: "white",
                fontSize: 9, fontWeight: 800,
                padding: "2px 7px", borderRadius: 4, letterSpacing: 1,
              }}>
                LIVE · AI SCANNING
              </div>
              {lastDetection?.vision_detected && (
                <div style={{
                  position: "absolute", bottom: 6, left: 6, right: 6,
                  background: "#ef444490", color: "white",
                  fontSize: 10, fontWeight: 800,
                  padding: "4px 8px", borderRadius: 4, textAlign: "center",
                }}>
                  ⚠ HAZARD DETECTED IN FRAME
                </div>
              )}
            </div>
          ) : (
            /* Enabled but not started yet */
            <div style={{
              height: 130, background: "#0a1120", borderRadius: 8,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              color: "#334155", fontSize: 13,
              border: "1px dashed #1e293b", gap: 8,
            }}>
              <span style={{ fontSize: 28 }}>📷</span>
              {active ? "Starting camera..." : "Press START to open camera"}
            </div>
          )}
        </div>

      </div>

      {/* CSS keyframes injected inline */}
      <style>{`
        @keyframes fadeFlash {
          0%   { opacity: 1; }
          60%  { opacity: 0.8; }
          100% { opacity: 0; }
        }
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AxisBar({ label, value, max }) {
  const pct   = Math.min(100, (Math.abs(value) / max) * 100);
  const color = pct > 70 ? "#ff3b4a" : pct > 40 ? "#ff8c42" : "#2dd4bf";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{
        height: 64, background: "#0a1120", borderRadius: 4,
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: `${pct}%`,
          background: `linear-gradient(to top, ${color}, ${color}80)`,
          boxShadow: `0 0 12px ${color}40`,
          transition: "height 0.1s, background 0.1s",
        }} />
      </div>
      <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{value.toFixed(1)}</div>
    </div>
  );
}

function AudioBar({ label, value, max }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <div style={{ fontSize: 10, color: "#64748b", width: 68, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 5, background: "#0a1120", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: pct > 70 ? "#ef4444" : "#3b82f6",
          transition: "width 0.15s",
        }} />
      </div>
      <div style={{ fontSize: 9, color: "#475569", width: 34, textAlign: "right" }}>
        {value.toFixed(3)}
      </div>
    </div>
  );
}

function SensorPill({ icon, label, active, dim }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      background: active && !dim ? "#22c55e15" : "#1e293b",
      border: `1px solid ${active && !dim ? "#22c55e40" : "#334155"}`,
      borderRadius: 20,
      padding: "3px 8px",
      fontSize: 10,
      fontWeight: 700,
      color: active && !dim ? "#22c55e" : dim ? "#334155" : "#475569",
    }}>
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ background: "#0a1120", borderRadius: 7, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 16, color: color || "#f1f5f9", marginTop: 2 }}>{value}</div>
    </div>
  );
}

const styles = {
  page: {
    position: "absolute",
    inset: 0,
    overflowY: "auto",
    padding: 22,
    display: "flex",
    flexDirection: "column",
    gap: 18,
    background: "linear-gradient(180deg, #030711 0%, #08121d 48%, #0b1722 100%)",
  },
  warningBanner: {
    background: "linear-gradient(135deg, rgba(255,59,74,0.95), rgba(230,0,51,0.95))",
    color: "white",
    borderRadius: 18,
    padding: "16px 22px",
    display: "flex",
    alignItems: "center",
    gap: 18,
    boxShadow: "0 28px 90px rgba(255,59,74,0.25)",
    flexShrink: 0,
  },
  mapHero: {
    display: "grid",
    gridTemplateColumns: "1fr 1.2fr",
    gap: 18,
    alignItems: "start",
  },
  heroInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    padding: 26,
    borderRadius: 24,
    background: "rgba(15, 23, 42, 0.98)",
    border: "1px solid rgba(148, 163, 184, 0.08)",
    boxShadow: "0 30px 80px rgba(0, 0, 0, 0.26)",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: "#94a3b8",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  heroTitle: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.05,
    color: "#f8fafc",
  },
  heroText: {
    fontSize: 14,
    lineHeight: 1.75,
    color: "#cbd5e1",
    maxWidth: 520,
  },
  heroRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  },
  heroStatCard: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: 18,
    padding: "16px 18px",
  },
  heroStatLabel: {
    fontSize: 11,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroStatValue: {
    fontSize: 22,
    fontWeight: 800,
    color: "#f8fafc",
  },
  mapCard: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: 18,
    borderRadius: 24,
    background: "rgba(18, 30, 49, 0.98)",
    border: "1px solid rgba(148, 163, 184, 0.1)",
    boxShadow: "0 24px 90px rgba(0, 0, 0, 0.24)",
  },
  mapCardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  mapWrapper: {
    height: 470,
    minHeight: 430,
    borderRadius: 24,
    overflow: "hidden",
    background: "#020a12",
    border: "1px solid rgba(148,163,184,0.08)",
  },
  mapFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#94a3b8",
  },
  statusPill: {
    background: "rgba(34,197,94,0.12)",
    color: "#86efac",
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    border: "1px solid rgba(34,197,94,0.18)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: 16,
  },
  card: {
    background: "rgba(15, 23, 42, 0.95)",
    border: "1px solid rgba(148, 163, 184, 0.08)",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 18px 60px rgba(0, 0, 0, 0.22)",
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: 800,
    color: "#94a3b8",
    letterSpacing: 1.5,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  bigButton: {
    width: "100%",
    padding: "15px",
    fontSize: 16,
    fontWeight: 900,
    color: "white",
    borderRadius: 14,
    letterSpacing: 2,
    border: "none",
    cursor: "pointer",
  },
  waiting: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
    padding: "22px 0",
  },
};
