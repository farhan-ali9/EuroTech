import React, { useEffect, useState, useRef, useCallback } from "react";
import { startGPS, startAccelerometer, startAudio } from "../services/sensors";
import { sendReport, fetchNearby } from "../services/api";

const REC_SPEED = (s) => s >= 7 ? 10 : s >= 4 ? 20 : 30;

// iOS 13+ requires a user tap before DeviceMotionEvent.requestPermission() can be called
const needsTap = typeof DeviceMotionEvent !== "undefined" &&
                 typeof DeviceMotionEvent.requestPermission === "function";

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export default function DriverMode() {
  const [gps,            setGps]            = useState(null);
  const [accel,          setAccel]          = useState(null);
  const [nearbyHazards,  setNearbyHazards]  = useState([]);
  const [detectionCount, setDetectionCount] = useState(0);
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
        });
        if (res.hazard_detected) {
          setDetectionCount(c => c + 1);
        }
      } catch {}
    }, 500);
    return () => clearInterval(iv);
  }, [active]);

  // Nearby check every 3s
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(async () => {
      const g = latestGps.current;
      if (!g) return;
      try {
        const d = await fetchNearby(g.lat, g.lng, 300);
        setNearbyHazards(d.hazards || []);
      } catch {}
    }, 3000);
    return () => clearInterval(iv);
  }, [active]);

  useEffect(() => { if (tapped) startAll(); }, [tapped]);
  useEffect(() => () => stopAll(), [stopAll]);

  const speed     = gps?.speed_kmh ?? 0;
  const topHazard = [...nearbyHazards].sort((a, b) => b.severity - a.severity)[0];
  const recSpeed  = topHazard ? REC_SPEED(topHazard.severity) : null;
  const isSpeeding = topHazard && speed > recSpeed;

  const distanceM = topHazard && gps
    ? Math.round(haversineM(gps.lat, gps.lng, topHazard.lat, topHazard.lng))
    : null;

  const lx = accel?.lx ?? 0, ly = accel?.ly ?? 0, lz = accel?.lz ?? 0;
  const rawJolt = accel
    ? (Math.sqrt(lx*lx+ly*ly+lz*lz) > 0.1
        ? Math.sqrt(lx*lx+ly*ly+lz*lz)
        : Math.max(0, Math.abs(accel.z ?? 0) - 9.81))
    : 0;
  const jolt    = speed >= 5 ? rawJolt : 0;
  const isSpike = jolt > 2.0;

  if (!tapped) {
    return (
      <div
        onClick={() => setTapped(true)}
        style={{
          minHeight: "100vh", background: "#050d1a",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 16, cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 56 }}>🛡️</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9", letterSpacing: 1 }}>
          Road Sentinel
        </div>
        <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>
          Tap anywhere to start
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#050d1a", color: "#e2e8f0",
      fontFamily: "'Courier New', monospace",
      display: "flex", flexDirection: "column",
      maxWidth: 480, margin: "0 auto",
    }}>

      <video  ref={videoRef}  autoPlay playsInline muted style={{ display: "none" }} />
      <canvas ref={canvasRef} width={320} height={240} style={{ display: "none" }} />

      {/* Proximity / speeding banner */}
      {topHazard && (
        <div style={{
          background: isSpeeding ? "#ef444418" : "#1a2640",
          borderBottom: `2px solid ${isSpeeding ? "#ef4444" : "#f97316"}`,
          padding: "12px 20px", display: "flex", alignItems: "center", gap: 14,
        }}>
          <span style={{ fontSize: 26 }}>🕳️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: isSpeeding ? "#ef4444" : "#f97316" }}>
              {isSpeeding ? "⚠️ SLOW DOWN NOW" : "Pothole ahead"}
            </div>
            <div style={{ fontSize: 11, color: isSpeeding ? "#ef4444" : "#64748b", marginTop: 2 }}>
              {distanceM !== null ? `${distanceM}m away` : "nearby"}
              {isSpeeding && ` · ${Math.round(speed)} km/h — limit ${recSpeed} km/h`}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#64748b", fontWeight: 700 }}>SLOW TO</div>
            <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, color: isSpeeding ? "#ef4444" : "#22c55e" }}>
              {recSpeed}
            </div>
            <div style={{ fontSize: 9, color: "#64748b" }}>km/h</div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Status row: live pill + detection counter */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 2,
            background: active ? "#22c55e12" : "#1e293b",
            border: `1px solid ${active ? "#22c55e30" : "#334155"}`,
            borderRadius: 20, padding: "5px 16px",
            color: active ? "#22c55e" : "#475569",
          }}>
            {active
              ? `● LIVE  ${cameraOn ? "ACCEL + AUDIO + CAM" : "ACCEL + AUDIO"}`
              : "● CONNECTING..."}
          </span>

          {detectionCount > 0 && (
            <div style={{
              background: "#1e3a5f", border: "1px solid #1e4a8f",
              borderRadius: 20, padding: "5px 14px",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ fontSize: 12 }}>🕳️</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#60a5fa" }}>
                {detectionCount} detected
              </span>
            </div>
          )}
        </div>

        {/* Speed */}
        <div style={{
          background: "#0d1525", borderRadius: 14,
          padding: "28px 20px", textAlign: "center",
          border: `1px solid ${isSpeeding ? "#ef444440" : "#0f2040"}`,
          flex: 1,
        }}>
          <div style={{ fontSize: 10, color: "#334155", fontWeight: 700, letterSpacing: 3, marginBottom: 8 }}>
            SPEED
          </div>
          <div style={{
            fontSize: 112, fontWeight: 900, lineHeight: 1,
            color: isSpeeding ? "#ef4444" : gps ? "#22c55e" : "#1e293b",
            fontVariantNumeric: "tabular-nums",
          }}>
            {gps ? Math.round(speed) : "--"}
          </div>
          <div style={{ fontSize: 18, color: "#334155", marginTop: 8 }}>km/h</div>
        </div>

        {/* Jolt */}
        <div style={{
          background: isSpike ? "#ef444410" : "#0d1525", borderRadius: 14,
          padding: "20px", border: `1px solid ${isSpike ? "#ef444440" : "#0f2040"}`,
        }}>
          <div style={{ fontSize: 10, color: "#334155", fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>
            JOLT
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <span style={{
                fontSize: 64, fontWeight: 900, lineHeight: 1,
                color: isSpike ? "#ef4444" : "#e2e8f0",
                fontVariantNumeric: "tabular-nums",
              }}>
                {jolt.toFixed(2)}
              </span>
              <span style={{ fontSize: 14, color: "#334155", marginLeft: 8 }}>m/s²</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{
                fontSize: 12, fontWeight: 800, letterSpacing: 1,
                color: isSpike ? "#ef4444" : jolt > 2 ? "#f97316" : "#22c55e",
              }}>
                {isSpike ? "⚡ SPIKE" : jolt > 1 ? "ELEVATED" : "NORMAL"}
              </div>
              <div style={{ fontSize: 9, color: "#334155", marginTop: 4 }}>threshold 2.0</div>
            </div>
          </div>
          <div style={{ height: 5, background: "#0f2040", borderRadius: 3, marginTop: 16, overflow: "hidden" }}>
            <div style={{
              width: `${Math.min(100, (jolt / 12) * 100)}%`, height: "100%", borderRadius: 3,
              background: isSpike ? "#ef4444" : jolt > 2 ? "#f97316" : "#22c55e",
              transition: "width 0.15s",
            }} />
          </div>
        </div>

      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
