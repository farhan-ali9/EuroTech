import React, { useEffect, useState, useRef, useCallback } from "react";
import { startGPS, startAccelerometer, startAudio } from "../services/sensors";
import { sendReport, fetchNearby, fetchTyphoonStatus } from "../services/api";

const REC_SPEED = (s) => s >= 7 ? 10 : s >= 4 ? 20 : 30;

// iOS 13+ requires a user tap before DeviceMotionEvent.requestPermission() can be called
const needsTap = typeof DeviceMotionEvent !== "undefined" &&
                 typeof DeviceMotionEvent.requestPermission === "function";

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05; u.volume = 1; u.lang = "en-US";
  window.speechSynthesis.speak(u);
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getDeviceId() {
  let id = localStorage.getItem("roadsense_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("roadsense_device_id", id);
  }
  return id;
}

export default function DriverMode() {
  const deviceId = useRef(getDeviceId());

  const [gps,            setGps]            = useState(null);
  const [accel,          setAccel]          = useState(null);
  const [nearbyHazards,  setNearbyHazards]  = useState([]);
  const [detectionCount, setDetectionCount] = useState(0);
  const [typhoon,        setTyphoon]        = useState(null);
  const [cameraOn,       setCameraOn]       = useState(false);
  const [active,         setActive]         = useState(false);
  const [tapped,         setTapped]         = useState(!needsTap);

  const latestGps   = useRef(null);
  const latestAccel = useRef(null);
  const latestAudio = useRef(null);
  const latestFrame = useRef(null);
  const gpsStop     = useRef(null);
  const audioStop   = useRef(null);
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const frameIvRef  = useRef(null);
  const lastWarned       = useRef(null);
  const lastSpokenAt     = useRef(0);
  const distMilestonesRef = useRef(new Set()); // tracks which distances already announced
  const lastSpeedWarnAt  = useRef(0);

  const stopAll = useCallback(() => {
    gpsStop.current?.();
    audioStop.current?.();
    clearInterval(frameIvRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    latestFrame.current = null;
    setCameraOn(false);
    setActive(false);
  }, []);

  const startAll = useCallback(async () => {
    gpsStop.current = startGPS(
      (p) => { setGps(p); latestGps.current = p; },
      () => {}
    );

    startAudio(
      (f) => { latestAudio.current = f; },
      () => {}
    ).then(stop => { if (stop) audioStop.current = stop; });

    startAccelerometer(
      (r) => { setAccel(r); latestAccel.current = r; },
      () => {}
    );

    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
      frameIvRef.current = setInterval(() => {
        const video = videoRef.current, canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return;
        canvas.getContext("2d").drawImage(video, 0, 0, 320, 240);
        latestFrame.current = canvas.toDataURL("image/jpeg", 0.6);
      }, 1500);
    } catch {
      setCameraOn(false);
    }

    setActive(true);
  }, []);

  // Send report every 500ms
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(async () => {
      const a = latestAccel.current;
      if (!a) return;
      const g = latestGps.current;
      try {
        const res = await sendReport({
          lat: g?.lat ?? null, lng: g?.lng ?? null,
          speed_kmh: g?.speed_kmh ?? 0,
          accelerometer: a, audio_features: latestAudio.current,
          frame: latestFrame.current || undefined,
          device_id: deviceId.current,
        });
        if (res.hazard_detected) {
          setDetectionCount(c => c + 1);
          const now = Date.now();
          if (now - lastSpokenAt.current > 5000) {
            lastSpokenAt.current = now;
            speak("Pothole detected. Hazard recorded.");
          }
        }
      } catch {}
    }, 500);
    return () => clearInterval(iv);
  }, [active]);

  // Nearby check + voice alerts every 3s
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(async () => {
      const g = latestGps.current;
      if (!g) return;
      try {
        const d = await fetchNearby(g.lat, g.lng, 300);
        const hazards = d.hazards || [];
        setNearbyHazards(hazards);

        if (hazards.length === 0) {
          // Reset milestones when no hazards nearby
          distMilestonesRef.current.clear();
          lastWarned.current = null;
          return;
        }

        const top  = [...hazards].sort((a, b) => b.severity - a.severity)[0];
        const dist = Math.round(haversineM(g.lat, g.lng, top.lat, top.lng));
        const rec  = REC_SPEED(top.severity);
        const spd  = g.speed_kmh ?? 0;

        // Reset milestones when hazard changes
        if (lastWarned.current !== top.id) {
          lastWarned.current = top.id;
          distMilestonesRef.current.clear();
          speak(`Pothole ahead, ${dist} metres. Slow to ${rec} kilometres per hour.`);
          return;
        }

        // Distance countdown: announce at 200m, 100m, 50m
        const milestones = [200, 100, 50];
        for (const m of milestones) {
          if (dist <= m && !distMilestonesRef.current.has(m)) {
            distMilestonesRef.current.add(m);
            speak(`Pothole in ${m} metres.`);
            return; // one announcement per interval
          }
        }

        // Speed warning: fire if still too fast, max once every 8s
        if (spd > rec) {
          const now = Date.now();
          if (now - lastSpeedWarnAt.current > 8000) {
            lastSpeedWarnAt.current = now;
            speak(`Too fast. Slow down to ${rec} kilometres per hour.`);
          }
        }
      } catch {}
    }, 3000);
    return () => clearInterval(iv);
  }, [active]);

  // Typhoon status check every 5 minutes + voice alert
  useEffect(() => {
    const check = async () => {
      try {
        const t = await fetchTyphoonStatus();
        setTyphoon(prev => {
          if (t?.active && !prev?.active) {
            speak(`Warning. Typhoon ${t.label} in effect. Road damage survey mode activated.`);
          }
          return t;
        });
      } catch {}
    };
    check();
    const iv = setInterval(check, 300000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { if (tapped) startAll(); }, [tapped]);
  useEffect(() => () => stopAll(), [stopAll]);

  const speed     = gps?.speed_kmh ?? 0;

  const lx = accel?.lx ?? 0, ly = accel?.ly ?? 0, lz = accel?.lz ?? 0;
  const rawJolt = accel
    ? (Math.sqrt(lx*lx+ly*ly+lz*lz) > 0.1
        ? Math.sqrt(lx*lx+ly*ly+lz*lz)
        : Math.max(0, Math.abs(accel.z ?? 0) - 9.81))
    : 0;
  const jolt    = speed >= 5 ? rawJolt : 0;
  const isSpike = jolt > 2.0;
  const topHazard = [...nearbyHazards].sort((a, b) => b.severity - a.severity)[0];
  const recSpeed  = topHazard ? REC_SPEED(topHazard.severity) : null;
  const isSpeeding = topHazard && speed > recSpeed;

  const distanceM = topHazard && gps
    ? Math.round(haversineM(gps.lat, gps.lng, topHazard.lat, topHazard.lng))
    : null;


  if (!tapped) {
    return (
      <div onClick={() => setTapped(true)} style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #020810 0%, #050d1a 50%, #020810 100%)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 20, cursor: "pointer", position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "radial-gradient(circle at 50% 50%, #00d4ff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />
        <div style={{
          width: 90, height: 90, borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(0,212,255,0.2), rgba(59,130,246,0.2))",
          border: "2px solid rgba(0,212,255,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 40, boxShadow: "0 0 40px rgba(0,212,255,0.3), 0 0 80px rgba(0,212,255,0.1)",
        }}>🛡️</div>
        <div style={{
          fontSize: 28, fontWeight: 900, letterSpacing: 2,
          background: "linear-gradient(135deg, #00d4ff, #3b82f6)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>RoadSense</div>
        <div style={{ fontSize: 13, color: "#334155", letterSpacing: 1 }}>TAP TO START MONITORING</div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #020810 0%, #050d1a 100%)",
      color: "#e2e8f0",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: "flex", flexDirection: "column",
      maxWidth: 480, margin: "0 auto",
      position: "relative",
    }}>
      <video  ref={videoRef}  autoPlay playsInline muted style={{ display: "none" }} />
      <canvas ref={canvasRef} width={320} height={240} style={{ display: "none" }} />

      {/* Typhoon banner */}
      {typhoon?.active && (
        <div style={{
          background: "linear-gradient(90deg, rgba(120,53,15,0.9), rgba(92,40,10,0.9))",
          backdropFilter: "blur(10px)",
          borderBottom: "2px solid #f59e0b",
          padding: "12px 20px",
          display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 4px 20px rgba(245,158,11,0.2)",
        }}>
          <span style={{ fontSize: 28 }}>🌀</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 13, color: "#fef3c7", letterSpacing: 1 }}>
              TYPHOON {typhoon.label?.toUpperCase()} IN EFFECT
            </div>
            <div style={{ fontSize: 11, color: "#fcd34d88", marginTop: 2 }}>
              {typhoon.name && `${typhoon.name} · `}Damage survey mode active
            </div>
          </div>
        </div>
      )}

      {/* Proximity / speeding banner */}
      {topHazard && (
        <div style={{
          background: isSpeeding
            ? "linear-gradient(90deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))"
            : "linear-gradient(90deg, rgba(249,115,22,0.12), rgba(249,115,22,0.04))",
          backdropFilter: "blur(10px)",
          borderBottom: `2px solid ${isSpeeding ? "rgba(239,68,68,0.6)" : "rgba(249,115,22,0.5)"}`,
          padding: "14px 20px", display: "flex", alignItems: "center", gap: 14,
          boxShadow: isSpeeding ? "0 4px 20px rgba(239,68,68,0.2)" : "0 4px 20px rgba(249,115,22,0.1)",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: isSpeeding ? "rgba(239,68,68,0.2)" : "rgba(249,115,22,0.15)",
            border: `1px solid ${isSpeeding ? "rgba(239,68,68,0.4)" : "rgba(249,115,22,0.3)"}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
          }}>🕳️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: isSpeeding ? "#ef4444" : "#f97316", letterSpacing: 0.5 }}>
              {isSpeeding ? "⚠️ SLOW DOWN NOW" : "Pothole Ahead"}
            </div>
            <div style={{ fontSize: 11, color: isSpeeding ? "rgba(239,68,68,0.7)" : "#64748b", marginTop: 3 }}>
              {distanceM !== null ? `${distanceM}m away` : "nearby"}
              {isSpeeding && ` · ${Math.round(speed)} km/h — limit ${recSpeed} km/h`}
            </div>
          </div>
          <div style={{ textAlign: "center", minWidth: 52 }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 1 }}>SLOW TO</div>
            <div style={{
              fontSize: 38, fontWeight: 900, lineHeight: 1,
              color: isSpeeding ? "#ef4444" : "#00d4ff",
              textShadow: isSpeeding ? "0 0 16px rgba(239,68,68,0.6)" : "0 0 16px rgba(0,212,255,0.6)",
            }}>{recSpeed}</div>
            <div style={{ fontSize: 9, color: "#475569" }}>km/h</div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, padding: "20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Status row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: active ? "rgba(0,212,255,0.08)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${active ? "rgba(0,212,255,0.25)" : "rgba(255,255,255,0.06)"}`,
            borderRadius: 20, padding: "5px 14px",
            boxShadow: active ? "0 0 12px rgba(0,212,255,0.1)" : "none",
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: active ? "#00d4ff" : "#475569",
              display: "inline-block",
              boxShadow: active ? "0 0 6px #00d4ff" : "none",
              animation: active ? "pulse 2s infinite" : "none",
            }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: active ? "#00d4ff" : "#475569", letterSpacing: 1.5 }}>
              {active ? `LIVE · ${cameraOn ? "ACCEL+AUDIO+CAM" : "ACCEL+AUDIO"}` : "CONNECTING..."}
            </span>
          </div>

          {detectionCount > 0 && (
            <div style={{
              background: "rgba(59,130,246,0.12)",
              border: "1px solid rgba(59,130,246,0.3)",
              borderRadius: 20, padding: "5px 14px",
              display: "flex", alignItems: "center", gap: 6,
              boxShadow: "0 0 12px rgba(59,130,246,0.15)",
            }}>
              <span style={{ fontSize: 12 }}>🕳️</span>
              <span style={{ fontSize: 11, fontWeight: 900, color: "#60a5fa" }}>
                {detectionCount} detected
              </span>
            </div>
          )}
        </div>

        {/* Speed card */}
        <div style={{
          background: "rgba(6,18,40,0.8)",
          backdropFilter: "blur(20px)",
          borderRadius: 20,
          padding: "32px 20px", textAlign: "center",
          border: isSpeeding
            ? "1px solid rgba(239,68,68,0.4)"
            : "1px solid rgba(0,212,255,0.12)",
          boxShadow: isSpeeding
            ? "0 8px 40px rgba(239,68,68,0.1), inset 0 1px 0 rgba(239,68,68,0.1)"
            : "0 8px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(0,212,255,0.05)",
          flex: 1,
        }}>
          <div style={{ fontSize: 10, color: "#1e4a6e", fontWeight: 800, letterSpacing: 4, marginBottom: 8 }}>
            SPEED
          </div>
          <div style={{
            fontSize: 108, fontWeight: 900, lineHeight: 1,
            color: isSpeeding ? "#ef4444" : gps ? "#00d4ff" : "#0f2a40",
            fontVariantNumeric: "tabular-nums",
            textShadow: gps ? (isSpeeding ? "0 0 40px rgba(239,68,68,0.5)" : "0 0 40px rgba(0,212,255,0.4)") : "none",
            transition: "color 0.3s, text-shadow 0.3s",
          }}>
            {gps ? Math.round(speed) : "--"}
          </div>
          <div style={{ fontSize: 16, color: "#1e4a6e", marginTop: 8, fontWeight: 700, letterSpacing: 2 }}>km/h</div>
        </div>

        {/* Jolt card */}
        <div style={{
          background: isSpike
            ? "rgba(239,68,68,0.08)"
            : "rgba(6,18,40,0.8)",
          backdropFilter: "blur(20px)",
          borderRadius: 20, padding: "18px 20px",
          border: isSpike
            ? "1px solid rgba(239,68,68,0.35)"
            : "1px solid rgba(0,212,255,0.1)",
          boxShadow: isSpike
            ? "0 8px 30px rgba(239,68,68,0.15)"
            : "0 8px 30px rgba(0,0,0,0.2)",
          transition: "all 0.2s",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "#1e4a6e", fontWeight: 800, letterSpacing: 4 }}>JOLT</div>
            <div style={{
              fontSize: 10, fontWeight: 900, letterSpacing: 1,
              color: isSpike ? "#ef4444" : jolt > 1 ? "#f97316" : speed < 5 ? "#334155" : "#00d4ff",
              background: isSpike ? "rgba(239,68,68,0.15)" : jolt > 1 ? "rgba(249,115,22,0.12)" : "rgba(0,212,255,0.08)",
              border: `1px solid ${isSpike ? "rgba(239,68,68,0.3)" : jolt > 1 ? "rgba(249,115,22,0.25)" : "rgba(0,212,255,0.2)"}`,
              padding: "2px 10px", borderRadius: 10,
            }}>
              {isSpike ? "⚡ SPIKE" : jolt > 1 ? "ELEVATED" : speed < 5 ? "WAITING" : "NORMAL"}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 14 }}>
            <span style={{
              fontSize: 56, fontWeight: 900, lineHeight: 1,
              color: isSpike ? "#ef4444" : "#94a3b8",
              fontVariantNumeric: "tabular-nums",
              textShadow: isSpike ? "0 0 24px rgba(239,68,68,0.6)" : "none",
              transition: "color 0.15s",
            }}>
              {jolt.toFixed(2)}
            </span>
            <span style={{ fontSize: 13, color: "#1e4a6e", fontWeight: 600 }}>m/s²</span>
            <span style={{ fontSize: 10, color: "#1e293b", marginLeft: "auto" }}>
              {speed < 5 ? "speed < 5 km/h" : "threshold 2.0"}
            </span>
          </div>

          <div style={{ height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              width: `${Math.min(100, (jolt / 12) * 100)}%`, height: "100%", borderRadius: 3,
              background: isSpike
                ? "linear-gradient(90deg, #ef444480, #ef4444)"
                : jolt > 1
                  ? "linear-gradient(90deg, #f9731680, #f97316)"
                  : "linear-gradient(90deg, #00d4ff40, #00d4ff)",
              boxShadow: isSpike ? "0 0 10px rgba(239,68,68,0.6)" : "none",
              transition: "width 0.15s, background 0.2s",
            }} />
          </div>
        </div>

      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
